import { useMemo, useState, useEffect, useRef, useDeferredValue } from "react";
import { Sparkles, Eye, Pencil } from "lucide-react";
import * as summaryAI from "../utils/summaryAI";
import { computeMatchStats } from "../utils/summaryStats";
import { BLOG } from "../constants/messages";
import {
  createSummary,
  updateSummary,
  publishSummary,
  unpublishSummary,
} from "../store";
import { useMatchResults, useUserDirectory, useAllPredictions, useSummaries } from "../hooks/useStore";
import { ALL_MATCHES, getMatchById, STAGES } from "../data/matches";
import { getMatchKickoffUTC } from "../utils/matchTime";
import { getGlobalSuggestions, pairCoveredMatches } from "../utils/statStarters";
import SummaryArticle from "./SummaryArticle";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";
// MatchNoteRow + helpers moved out so a keystroke in one row doesn't
// re-render the 800-line editor body. teamLabel + appendSuggestion are
// re-exported because the global suggestion panel below also uses them.
import MatchNoteRow, { teamLabel, appendSuggestion } from "./SummaryMatchNoteRow";

// Global piquancy panel — shown above intro / conclusion. Each chip has TWO
// insertion targets (intro/conclusion) since the cross-match observations
// could fit either spot. Hidden when no suggestions fired.
function GlobalSuggestionPanel({ suggestions, onInsertIntro, onInsertConclusion }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="card-duo">
      <h3 className="font-extrabold text-sm text-ink mb-2">
        {BLOG.editor.suggestionsGlobalHeading}
      </h3>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div key={s.id} className="flex items-center gap-2 flex-wrap">
            <span
              title={s.text}
              className="inline-flex items-center gap-1 text-xs font-extrabold bg-primary-soft text-primary-dark border-2 border-primary/30 px-2 py-1 rounded-full truncate max-w-[260px] flex-1 min-w-0"
            >
              <span className="truncate">{s.label}</span>
            </span>
            <button
              type="button"
              onClick={() => onInsertIntro(s.text)}
              className="btn-duo-flat text-[11px] flex-shrink-0"
            >
              להקדמה
            </button>
            <button
              type="button"
              onClick={() => onInsertConclusion(s.text)}
              className="btn-duo-flat text-[11px] flex-shrink-0"
            >
              לסיכום
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchRow({ match, result, selected, isAlreadyCovered, onToggle }) {
  const home = teamLabel(match.homeTeam);
  const away = teamLabel(match.awayTeam);
  const scoreText = result
    ? `${result.awayScore}–${result.homeScore}`
    : "אין תוצאה";
  return (
    <label
      className={`flex items-center gap-3 px-3 py-2 rounded-xl border-2 cursor-pointer transition ${
        selected
          ? "bg-primary/5 border-primary"
          : "bg-white border-border hover:border-ink-muted"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onToggle(e.target.checked)}
        className="w-5 h-5 accent-primary flex-shrink-0"
      />
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink truncate">
          {home} <span className="text-ink-muted">נגד</span> {away}
        </span>
        <span className="text-xs font-extrabold text-primary tabular-nums flex-shrink-0">
          {scoreText}
        </span>
      </div>
      {isAlreadyCovered && (
        <span className="text-[10px] font-extrabold text-accent-text bg-accent-soft-2 px-2 py-0.5 rounded-full flex-shrink-0">
          כבר בסיכום קודם
        </span>
      )}
    </label>
  );
}

export default function SummaryEditor({ summaryId, onClose }) {
  const matchResults = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUserDirectory();
  const summaries = useSummaries();
  const showToast = useToast();
  const confirm = useConfirm();

  const existing = summaryId ? summaries[summaryId] : null;
  // `summaryId && !existing` means the doc hasn't loaded yet OR was deleted
  // by another session while we're open. We distinguish the two states below.
  const isExistingSummary = !!summaryId;
  const isPublished = existing?.status === "published";

  // Draft state in this form. We do NOT write to Firestore on every keystroke
  // — that would touch security rules far too often. One save button commits.
  const [title, setTitle] = useState(existing?.title || "");
  const [subtitle, setSubtitle] = useState(existing?.subtitle || "");
  const [intro, setIntro] = useState(existing?.intro || "");
  const [conclusion, setConclusion] = useState(existing?.conclusion || "");
  const [coveredMatchIds, setCoveredMatchIds] = useState(
    existing?.coveredMatchIds ? [...existing.coveredMatchIds] : [],
  );
  const [matchNotes, setMatchNotes] = useState(
    existing?.matchNotes ? { ...existing.matchNotes } : {},
  );
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(null); // null | 'title' | 'intro' | 'conclusion' | match-id
  // Editor view mode toggle. On xl: both columns are visible regardless of
  // this state (split view). On smaller screens: this picks which one shows.
  const [viewMode, setViewMode] = useState("write");

  // Hydrate local drafts from the loaded doc. We intentionally do NOT re-run
  // on every `existing` identity change, because the Firestore listener
  // replaces the object reference on every snapshot and would wipe unsaved
  // edits. The ref tracks the id we've already initialized for — and we only
  // count it as "hydrated" once `existing` has actually arrived, which
  // prevents the cold-mount case where we ran with null data first and then
  // refused to adopt the real doc when the listener caught up.
  const hydratedForIdRef = useRef(null);
  useEffect(() => {
    if (!summaryId) {
      // "New summary" form — reset once on open.
      if (hydratedForIdRef.current !== "__new__") {
        hydratedForIdRef.current = "__new__";
        setTitle(""); setSubtitle(""); setIntro(""); setConclusion("");
        setCoveredMatchIds([]); setMatchNotes({});
      }
      return;
    }
    if (!existing) return; // listener hasn't populated yet (or doc was deleted)
    if (hydratedForIdRef.current === summaryId) return;
    hydratedForIdRef.current = summaryId;
    setTitle(existing.title || "");
    setSubtitle(existing.subtitle || "");
    setIntro(existing.intro || "");
    setConclusion(existing.conclusion || "");
    setCoveredMatchIds(existing.coveredMatchIds ? [...existing.coveredMatchIds] : []);
    setMatchNotes(existing.matchNotes ? { ...existing.matchNotes } : {});
  }, [summaryId, existing]);

  // Deleted-while-editing guard: once we've hydrated for this id and the
  // doc has since vanished from the listener, don't let Save create a new
  // summary silently. The return below renders an explicit error state.
  const wasDeletedMidEdit =
    isExistingSummary && !existing && hydratedForIdRef.current === summaryId;
  // Waiting for the initial snapshot on a cold cache.
  const isHydrating =
    isExistingSummary && !existing && hydratedForIdRef.current !== summaryId;

  // The matches that have a result. Exclude from this list any that are
  // already covered in OTHER summaries (but keep the ones this summary already
  // selected so editing works). The user can tick covered-elsewhere matches
  // anyway via a separate "הוסף משחק שכבר הוצג" button.
  const { uncovered, otherSummariesCovered } = useMemo(() => {
    // All summaries EXCEPT this one's covered ids
    const otherCovered = new Set<string>();
    for (const [id, sAny] of Object.entries(summaries || {})) {
      if (id === summaryId) continue;
      const s = sAny as any;
      for (const mid of s.coveredMatchIds || []) otherCovered.add(mid);
    }
    const withResults = ALL_MATCHES.filter((m) => !!matchResults[m.id]);
    const uncov = withResults.filter((m) => !otherCovered.has(m.id));
    return { uncovered: uncov, otherSummariesCovered: otherCovered };
  }, [matchResults, summaryId, summaries]);

  // Build the "available" list: uncovered + any currently selected
  const selectableMatches = useMemo(() => {
    const byId = new Map(ALL_MATCHES.map((m) => [m.id, m]));
    const set = new Set(uncovered.map((m) => m.id));
    for (const mid of coveredMatchIds) set.add(mid);
    const list = Array.from(set).map((id) => byId.get(id)).filter(Boolean);
    // Sort by kickoff time ascending
    return list.sort((a, b) => {
      const ak = getMatchKickoffUTC(a) || 0;
      const bk = getMatchKickoffUTC(b) || 0;
      return ak - bk;
    });
  }, [uncovered, coveredMatchIds]);

  const [showAll, setShowAll] = useState(false);
  const allMatchesSorted = useMemo(() => {
    return [...ALL_MATCHES]
      .filter((m) => !!matchResults[m.id])
      .sort((a, b) => (getMatchKickoffUTC(a) || 0) - (getMatchKickoffUTC(b) || 0));
  }, [matchResults]);
  const shownMatches = showAll ? allMatchesSorted : selectableMatches;

  // Deferred copies of the heavy text fields so a fast typist doesn't trigger
  // a full preview re-render on every keystroke (React 19 useDeferredValue).
  const dfTitle = useDeferredValue(title);
  const dfSubtitle = useDeferredValue(subtitle);
  const dfIntro = useDeferredValue(intro);
  const dfConclusion = useDeferredValue(conclusion);
  const dfMatchNotes = useDeferredValue(matchNotes);

  // Draft snapshot for the live preview. Includes the EXISTING fields
  // (number, publishedAt, status) on top of in-memory edits so the preview
  // shows the same masthead/byline the public page will.
  const draftSummary = useMemo(
    () => ({
      ...(existing || {}),
      title: dfTitle,
      subtitle: dfSubtitle,
      intro: dfIntro,
      conclusion: dfConclusion,
      coveredMatchIds,
      matchNotes: dfMatchNotes,
      // Make the byline date sensible even on a brand-new draft.
      publishedAt: existing?.publishedAt || null,
      updatedAt: existing?.updatedAt || new Date().toISOString(),
      number: existing?.number,
      status: existing?.status || "draft",
    }),
    [existing, dfTitle, dfSubtitle, dfIntro, dfConclusion, coveredMatchIds, dfMatchNotes],
  );

  // Global ("cross-match") piquancy suggestions for the whole post.
  const globalSuggestions = useMemo(
    () => getGlobalSuggestions({
      coveredMatches: pairCoveredMatches(coveredMatchIds, matchResults),
      allPredictions,
      users,
    }),
    [coveredMatchIds, matchResults, allPredictions, users],
  );

  const toggleMatch = (matchId, checked) => {
    setCoveredMatchIds((prev) => {
      if (checked) {
        if (prev.includes(matchId)) return prev;
        // Insert at position sorted by kickoff
        const next = [...prev, matchId];
        const orderedIds = allMatchesSorted.map((m) => m.id);
        return next.sort((a, b) => orderedIds.indexOf(a) - orderedIds.indexOf(b));
      }
      return prev.filter((id) => id !== matchId);
    });
  };

  const buildPayload = () => ({
    title: title.trim(),
    subtitle: subtitle.trim(),
    intro,
    conclusion,
    coveredMatchIds,
    matchNotes,
  });

  const validate = () => {
    if (!title.trim()) return "חובה למלא כותרת";
    // Summaries with matches: each selected match should exist in our schedule
    for (const mid of coveredMatchIds) {
      if (!getMatchById(mid)) return `מזהה משחק לא תקין: ${mid}`;
    }
    return null;
  };

  const handleSaveDraft = async () => {
    // If we opened this editor for an existing summaryId but the doc is
    // gone (deleted in another session), refuse to save. Otherwise we'd
    // fall through to createSummary and spawn a new doc.
    if (wasDeletedMidEdit) {
      showToast(BLOG.editor.deletedMidEditToast, "error");
      return;
    }
    const err = validate();
    if (err) { showToast(err, "error"); return; }
    setSaving(true);
    try {
      if (existing) {
        // Preserve the existing status on plain saves. Going to draft is a
        // separate explicit action via "החזר לטיוטה".
        const ok = await updateSummary(summaryId, {
          ...buildPayload(),
          status: existing.status,
        });
        if (!ok) showToast(BLOG.editor.saveFailed, "error");
        else showToast(BLOG.editor.saved, "success");
      } else if (!isExistingSummary) {
        const id = await createSummary(buildPayload());
        if (!id) showToast(BLOG.editor.createFailed, "error");
        else {
          showToast(BLOG.editor.draftSaved, "success");
          onClose?.(id);
          return;
        }
      }
    } catch (e) {
      showToast(e?.message || BLOG.editor.saveFailed, "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (wasDeletedMidEdit) {
      showToast(BLOG.editor.deletedMidEditToast, "error");
      return;
    }
    const err = validate();
    if (err) { showToast(err, "error"); return; }
    setSaving(true);
    try {
      // Single round-trip: write fields + publish in one update when editing
      // an existing doc. For a brand new summary, create (as draft) then
      // publish — createSummary intentionally forces status:"draft" at rule
      // level so we can't skip the second step.
      let idForStatus = summaryId;
      if (!existing && !isExistingSummary) {
        idForStatus = await createSummary(buildPayload());
        if (!idForStatus) {
          showToast(BLOG.editor.saveFailed, "error");
          return;
        }
        const ok = await publishSummary(idForStatus);
        if (!ok) { showToast(BLOG.editor.publishFailed, "error"); return; }
      } else if (existing) {
        const ok = await updateSummary(summaryId, {
          ...buildPayload(),
          status: "published",
        });
        if (!ok) { showToast(BLOG.editor.publishFailed, "error"); return; }
      }
      showToast(BLOG.editor.published, "success");
      onClose?.(idForStatus);
    } catch (e) {
      showToast(e?.message || BLOG.editor.publishFailed, "error");
    } finally {
      setSaving(false);
    }
  };

  const runAI = async (kind, fn) => {
    setAiLoading(kind);
    try {
      return await fn();
    } catch (err) {
      showToast(err?.message || BLOG.editor.aiFailed, "error");
      return null;
    } finally {
      setAiLoading(null);
    }
  };

  const handleSuggestTitle = async () => {
    if (!intro.trim() && !conclusion.trim()) {
      showToast(BLOG.editor.aiEmptyInput, "error");
      return;
    }
    const res = await runAI("title", () =>
      summaryAI.suggestTitle({
        intro,
        conclusion,
        dayNumber: existing?.number,
      }),
    );
    if (!res) return;
    if (res.title) setTitle(res.title);
    if (res.subtitle) setSubtitle(res.subtitle);
    showToast(BLOG.editor.aiTitleUpdated, "success");
  };

  const handlePolish = async (kind) => {
    const current = kind === "intro" ? intro : conclusion;
    if (!current.trim()) {
      showToast(BLOG.editor.aiEmptyTextInput, "error");
      return;
    }
    const res = await runAI(kind, () =>
      summaryAI.polishText({ text: current, kind }),
    );
    if (!res?.text) return;
    if (kind === "intro") setIntro(res.text);
    else setConclusion(res.text);
    showToast(BLOG.editor.aiPolished, "success");
  };

  const handleMatchCommentary = async (mid) => {
    const m = getMatchById(mid);
    if (!m) return;
    const r = matchResults[mid];
    const stats = computeMatchStats({
      matchId: mid,
      result: r,
      allPredictions,
      users,
    });
    const res = await runAI(`m:${mid}`, () =>
      summaryAI.matchCommentary({
        match: { home: m.homeTeam, away: m.awayTeam, stage: m.stage, group: m.group },
        result: r,
        stats,
        currentNote: matchNotes[mid] || "",
      }),
    );
    if (!res?.text) return;
    setMatchNotes((prev) => ({ ...prev, [mid]: res.text }));
    showToast(BLOG.editor.aiDraftReady, "success");
  };

  const handleUnpublish = async () => {
    if (!existing) return;
    const yes = await confirm({
      title: "להחזיר לטיוטה?",
      message: "הסיכום יוסתר מהמבקרים עד שתפרסם שוב.",
      confirmLabel: "החזר לטיוטה",
    });
    if (!yes) return;
    setSaving(true);
    try {
      const ok = await unpublishSummary(summaryId);
      if (ok) showToast(BLOG.editor.unpublished, "success");
      else showToast(BLOG.editor.saveFailed, "error");
    } finally {
      setSaving(false);
    }
  };

  if (wasDeletedMidEdit) {
    return (
      <div className="card-duo-lg text-center">
        <div className="text-5xl mb-3">🗑️</div>
        <h3 className="text-base font-extrabold text-ink mb-1">
          {BLOG.editor.deletedMidEditTitle}
        </h3>
        <p className="text-sm text-ink-muted font-medium mb-4">
          {BLOG.editor.deletedMidEditBody}
        </p>
        {onClose && (
          <button onClick={() => onClose()} className="btn-duo btn-duo-primary">
            {BLOG.editor.back}
          </button>
        )}
      </div>
    );
  }

  if (isHydrating) {
    return (
      <div className="text-center py-8 text-ink-muted font-bold">טוען...</div>
    );
  }

  // The form column (everything that exists today + the new global panel).
  const writeColumn = (
    <div className="space-y-4">
      <GlobalSuggestionPanel
        suggestions={globalSuggestions}
        onInsertIntro={(text) => setIntro((cur) => appendSuggestion(cur, text))}
        onInsertConclusion={(text) => setConclusion((cur) => appendSuggestion(cur, text))}
      />
      {/* Title + subtitle */}
      <div className="card-duo">
        <div className="flex items-center justify-between mb-1 gap-2">
          <label className="block text-xs font-extrabold text-ink-muted">כותרת</label>
          <button
            type="button"
            onClick={handleSuggestTitle}
            disabled={!!aiLoading}
            className="btn-duo btn-duo-ghost-raised btn-duo-sm flex items-center gap-1"
            aria-label={BLOG.editor.aiSuggestTitle}
          >
            <Sparkles size={14} />
            <span>{aiLoading === "title" ? BLOG.editor.aiThinking : BLOG.editor.aiSuggestTitle}</span>
          </button>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 border-2 border-border rounded-xl font-bold"
          placeholder={BLOG.editor.placeholderTitle}
          maxLength={200}
        />
        <label className="block text-xs font-extrabold text-ink-muted mt-3 mb-1">
          תת-כותרת (אופציונלי)
        </label>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          className="w-full p-2 border-2 border-border rounded-xl"
          placeholder={BLOG.editor.placeholderSubtitle}
          maxLength={300}
        />
      </div>

      {/* Intro */}
      <div className="card-duo">
        <div className="flex items-center justify-between mb-1 gap-2">
          <label className="block text-xs font-extrabold text-ink-muted">הקדמה</label>
          <button
            type="button"
            onClick={() => handlePolish("intro")}
            disabled={!!aiLoading || !intro.trim()}
            className="btn-duo btn-duo-ghost-raised btn-duo-sm flex items-center gap-1"
            aria-label={BLOG.editor.aiPolish}
          >
            <Sparkles size={14} />
            <span>{aiLoading === "intro" ? BLOG.editor.aiPolishing : BLOG.editor.aiPolish}</span>
          </button>
        </div>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={5}
          className="w-full p-2 border-2 border-border rounded-xl text-base leading-relaxed"
          placeholder={BLOG.editor.placeholderIntro}
          maxLength={20000}
        />
      </div>

      {/* Match selection */}
      <div className="card-duo">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <h3 className="font-extrabold text-base text-ink">בחירת משחקים</h3>
            <p className="text-xs text-ink-muted font-medium">
              {uncovered.length} משחקים חדשים עם תוצאה שעוד לא סוכמו.
            </p>
          </div>
          <button
            onClick={() => setShowAll((v) => !v)}
            className="btn-duo btn-duo-ghost-raised btn-duo-sm"
          >
            {showAll ? "הצג רק חדשים" : "הצג את כל המשחקים"}
          </button>
        </div>
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {shownMatches.length === 0 && (
            <p className="text-sm text-ink-muted py-4 text-center font-medium">
              אין משחקים עם תוצאה. אפשר לשמור סיכום "לקראת" בלי משחקים.
            </p>
          )}
          {shownMatches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              result={matchResults[m.id]}
              selected={coveredMatchIds.includes(m.id)}
              isAlreadyCovered={otherSummariesCovered.has(m.id)}
              onToggle={(checked) => toggleMatch(m.id, checked)}
            />
          ))}
        </div>
      </div>

      {/* Per-match notes */}
      {coveredMatchIds.length > 0 && (
        <div className="card-duo">
          <h3 className="font-extrabold text-base text-ink mb-1">הערות למשחקים</h3>
          <p className="text-xs text-ink-muted font-medium mb-3">
            תוספת טקסט חופשית לכל משחק. הנתונים (כמה טפסים ניחשו מה)
            יחושבו אוטומטית בסיכום.
          </p>
          <div className="space-y-3">
            {coveredMatchIds.map((mid) => (
              <MatchNoteRow
                key={mid}
                mid={mid}
                matchResults={matchResults}
                allPredictions={allPredictions}
                users={users}
                value={matchNotes[mid] || ""}
                onChange={(val) =>
                  setMatchNotes((prev) => ({ ...prev, [mid]: val }))
                }
                onAskAI={() => handleMatchCommentary(mid)}
                aiLoading={aiLoading === `m:${mid}`}
                aiDisabled={!!aiLoading}
              />
            ))}
          </div>
        </div>
      )}

      {/* Conclusion */}
      <div className="card-duo">
        <div className="flex items-center justify-between mb-1 gap-2">
          <label className="block text-xs font-extrabold text-ink-muted">סיכום</label>
          <button
            type="button"
            onClick={() => handlePolish("conclusion")}
            disabled={!!aiLoading || !conclusion.trim()}
            className="btn-duo btn-duo-ghost-raised btn-duo-sm flex items-center gap-1"
            aria-label={BLOG.editor.aiPolish}
          >
            <Sparkles size={14} />
            <span>{aiLoading === "conclusion" ? BLOG.editor.aiPolishing : BLOG.editor.aiPolish}</span>
          </button>
        </div>
        <textarea
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
          rows={4}
          className="w-full p-2 border-2 border-border rounded-xl text-base leading-relaxed"
          placeholder={BLOG.editor.placeholderConclusion}
          maxLength={20000}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="btn-duo btn-duo-ghost-raised"
        >
          {BLOG.editor.saveDraft}
        </button>
        <button
          onClick={handlePublish}
          disabled={saving}
          className="btn-duo btn-duo-primary"
        >
          {isPublished ? BLOG.editor.republish : BLOG.editor.publish}
        </button>
        {isPublished && (
          <button
            onClick={handleUnpublish}
            disabled={saving}
            className="btn-duo btn-duo-ghost-raised"
          >
            {BLOG.editor.unpublish}
          </button>
        )}
        {onClose && (
          <button
            onClick={() => onClose()}
            className="btn-duo btn-duo-ghost mr-auto"
          >
            {BLOG.editor.back}
          </button>
        )}
      </div>
    </div>
  );

  // Live preview column. Reuses the public-page article render so the
  // admin sees exactly what readers will. We strip the page chrome
  // (banners, prev/next, archive) — those aren't part of the post itself.
  const previewColumn = (
    <div className="bg-bg rounded-2xl border-2 border-border p-4 md:p-6 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="text-[11px] font-extrabold text-ink-light uppercase tracking-wider mb-3">
        {BLOG.editor.tabPreview}
      </div>
      <SummaryArticle
        summary={draftSummary}
        matchResults={matchResults}
        allPredictions={allPredictions}
        users={users}
      />
    </div>
  );

  return (
    <div>
      {/* View-mode tabs — visible on mobile/tablet only. On xl the split
          view shows both columns simultaneously, so the toggle is hidden. */}
      <div className="xl:hidden flex gap-1 mb-3 bg-bg-soft rounded-xl p-1 border-2 border-border">
        <button
          type="button"
          onClick={() => setViewMode("write")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-extrabold flex items-center justify-center gap-1.5 transition ${
            viewMode === "write"
              ? "bg-white text-ink shadow-sm"
              : "bg-transparent text-ink-muted hover:text-ink"
          }`}
          aria-pressed={viewMode === "write"}
        >
          <Pencil size={14} />
          {BLOG.editor.tabWrite}
        </button>
        <button
          type="button"
          onClick={() => setViewMode("preview")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-extrabold flex items-center justify-center gap-1.5 transition ${
            viewMode === "preview"
              ? "bg-white text-ink shadow-sm"
              : "bg-transparent text-ink-muted hover:text-ink"
          }`}
          aria-pressed={viewMode === "preview"}
        >
          <Eye size={14} />
          {BLOG.editor.tabPreview}
        </button>
      </div>

      <div className="xl:grid xl:grid-cols-2 xl:gap-6 xl:items-start">
        <div className={viewMode === "write" ? "" : "hidden xl:block"}>
          {writeColumn}
        </div>
        <div className={viewMode === "preview" ? "" : "hidden xl:block"}>
          {previewColumn}
        </div>
      </div>
    </div>
  );
}
