import { useMemo, useState, useEffect } from "react";
import {
  createSummary,
  updateSummary,
  publishSummary,
  unpublishSummary,
} from "../store";
import { useMatchResults, useUsers, useAllPredictions, useSummaries } from "../hooks/useStore";
import { ALL_MATCHES, getMatchById, STAGES } from "../data/matches";
import { getTeamByCode } from "../data/teams";
import { getMatchKickoffUTC } from "../utils/matchTime";
import { computeMatchStats } from "../utils/summaryStats";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";

function teamLabel(code) {
  const t = getTeamByCode(code);
  return t ? `${t.flag} ${t.name}` : code || "—";
}

function MatchRow({ match, result, selected, isAlreadyCovered, onToggle }) {
  const home = teamLabel(match.homeTeam);
  const away = teamLabel(match.awayTeam);
  const scoreText = result
    ? `${result.homeScore}–${result.awayScore}`
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
  const users = useUsers();
  const summaries = useSummaries();
  const showToast = useToast();
  const confirm = useConfirm();

  const existing = summaryId ? summaries[summaryId] : null;
  const isEditing = !!existing;
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

  // Reset when switching summaries
  useEffect(() => {
    setTitle(existing?.title || "");
    setSubtitle(existing?.subtitle || "");
    setIntro(existing?.intro || "");
    setConclusion(existing?.conclusion || "");
    setCoveredMatchIds(existing?.coveredMatchIds ? [...existing.coveredMatchIds] : []);
    setMatchNotes(existing?.matchNotes ? { ...existing.matchNotes } : {});
  }, [summaryId, existing]);

  // The matches that have a result. Exclude from this list any that are
  // already covered in OTHER summaries (but keep the ones this summary already
  // selected so editing works). The user can tick covered-elsewhere matches
  // anyway via a separate "הוסף משחק שכבר הוצג" button.
  const { uncovered, otherSummariesCovered } = useMemo(() => {
    // All summaries EXCEPT this one's covered ids
    const otherCovered = new Set();
    for (const [id, s] of Object.entries(summaries || {})) {
      if (id === summaryId) continue;
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
    const err = validate();
    if (err) { showToast(err, "error"); return; }
    setSaving(true);
    try {
      if (isEditing) {
        // If it was published, moving back to draft is handled via the
        // "ביטול פרסום" button; saving an already-published summary keeps it
        // published. Preserve the existing status here.
        const ok = await updateSummary(summaryId, {
          ...buildPayload(),
          status: existing.status,
        });
        if (!ok) showToast("שמירה נכשלה", "error");
        else showToast("נשמר", "success");
      } else {
        const id = await createSummary(buildPayload());
        if (!id) showToast("יצירה נכשלה", "error");
        else {
          showToast("טיוטה נשמרה", "success");
          onClose?.(id);
          return;
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    const err = validate();
    if (err) { showToast(err, "error"); return; }
    setSaving(true);
    try {
      let idForStatus = summaryId;
      if (!isEditing) {
        idForStatus = await createSummary(buildPayload());
        if (!idForStatus) {
          showToast("שמירה נכשלה", "error");
          return;
        }
      } else {
        const ok = await updateSummary(summaryId, buildPayload());
        if (!ok) { showToast("שמירה נכשלה", "error"); return; }
      }
      const ok = await publishSummary(idForStatus);
      if (!ok) { showToast("פרסום נכשל", "error"); return; }
      showToast("הסיכום פורסם", "success");
      onClose?.(idForStatus);
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!isEditing) return;
    const yes = await confirm({
      title: "להחזיר לטיוטה?",
      message: "הסיכום יוסתר מהמבקרים עד שתפרסם שוב.",
      confirmLabel: "החזר לטיוטה",
    });
    if (!yes) return;
    setSaving(true);
    try {
      const ok = await unpublishSummary(summaryId);
      if (ok) showToast("הוחזר לטיוטה", "success");
      else showToast("פעולה נכשלה", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Title + subtitle */}
      <div className="card-duo">
        <label className="block text-xs font-extrabold text-ink-muted mb-1">כותרת</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 border-2 border-border rounded-xl font-bold"
          placeholder="למשל: יום הפתיחה"
        />
        <label className="block text-xs font-extrabold text-ink-muted mt-3 mb-1">
          תת-כותרת (אופציונלי)
        </label>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          className="w-full p-2 border-2 border-border rounded-xl"
          placeholder="משפט קצר"
        />
      </div>

      {/* Intro */}
      <div className="card-duo">
        <label className="block text-xs font-extrabold text-ink-muted mb-1">הקדמה</label>
        <p className="text-xs text-ink-muted mb-2">
          טקסט חופשי שיופיע בפתיחת הסיכום.
        </p>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={5}
          className="w-full p-2 border-2 border-border rounded-xl text-base leading-relaxed"
          placeholder="במה נתמקד הפעם? מה קרה היום?"
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
            {coveredMatchIds.map((mid) => {
              const m = getMatchById(mid);
              if (!m) return null;
              const r = matchResults[mid];
              const stats = computeMatchStats({
                matchId: mid,
                result: r,
                allPredictions,
                users,
              });
              return (
                <div key={mid} className="border-2 border-border rounded-2xl p-3 bg-bg-soft/40">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <span className="text-sm font-extrabold text-ink">
                      {teamLabel(m.homeTeam)} {r ? `${r.homeScore}–${r.awayScore}` : "–"} {teamLabel(m.awayTeam)}
                    </span>
                    <span className="text-[11px] font-bold text-ink-muted">
                      {STAGES[m.stage] || m.stage} · {stats.exactHitCount}/{stats.totalForms} קלעו
                    </span>
                  </div>
                  <textarea
                    value={matchNotes[mid] || ""}
                    onChange={(e) =>
                      setMatchNotes((prev) => ({ ...prev, [mid]: e.target.value }))
                    }
                    rows={3}
                    className="w-full p-2 border-2 border-border rounded-xl text-sm leading-relaxed"
                    placeholder="מה הייתה הדרמה? מי קלע בול?"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conclusion */}
      <div className="card-duo">
        <label className="block text-xs font-extrabold text-ink-muted mb-1">סיכום</label>
        <p className="text-xs text-ink-muted mb-2">
          טקסט סיום — מה מחכה לנו הלאה?
        </p>
        <textarea
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
          rows={4}
          className="w-full p-2 border-2 border-border rounded-xl text-base leading-relaxed"
          placeholder="מסקנות, מבט קדימה..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="btn-duo btn-duo-ghost-raised"
        >
          שמור טיוטה
        </button>
        {!isPublished && (
          <button
            onClick={handlePublish}
            disabled={saving}
            className="btn-duo btn-duo-primary"
          >
            פרסם
          </button>
        )}
        {isPublished && (
          <button
            onClick={handleUnpublish}
            disabled={saving}
            className="btn-duo btn-duo-ghost-raised"
          >
            החזר לטיוטה
          </button>
        )}
        {isPublished && (
          <button
            onClick={handlePublish}
            disabled={saving}
            className="btn-duo btn-duo-primary"
          >
            שמור שינויים
          </button>
        )}
        {onClose && (
          <button
            onClick={() => onClose()}
            className="btn-duo btn-duo-ghost mr-auto"
          >
            חזרה
          </button>
        )}
      </div>
    </div>
  );
}
