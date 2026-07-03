// "המצב שלי בתחרות" — the competition-analysis page.
//
// Reached ONLY via CompetitionAnalysisEntry (Leaderboard mounts) or a deep
// link; admin releases per user via settings.features.competitionAnalysis.
// Everything here is READ-ONLY: the page computes over data the client
// already has (post-lock predictions + results + the scenarioRun doc) and
// writes nothing.
//
// Render strategy (accepted load time, but never a blank page):
//   - instant: gates, form selector, deterministic certainty, tournament
//     outlook (existing scenarioRun subscription)
//   - ~2s: first Monte-Carlo snapshot from the worker (verdict + root-for),
//     then silent refinement up to 20k sims / 30s
//   - worker failure: deterministic + outlook stay, probabilistic sections
//     show a retry — no eternal spinner (CLAUDE.md failure-path rule).

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import PageHeader from "../components/PageHeader";
import VerdictSection from "../components/competitionStatus/VerdictSection";
import RootForSection from "../components/competitionStatus/RootForSection";
import HeadToHeadSection from "../components/competitionStatus/HeadToHeadSection";
import OutlookSection from "../components/competitionStatus/OutlookSection";
import EmptyState from "../components/EmptyState";
import {
  useAllPredictions,
  useMatchResults,
  useActualBonuses,
} from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useCompetitionAnalysisAccess } from "../hooks/useCompetitionAnalysisAccess";
import { usePersonalAnalysis } from "../hooks/usePersonalAnalysis";
import { computePoolCertainty } from "../utils/poolCertainty";
import { selectWatchMatches, NEXT_ROUND } from "../utils/analysisWindow";
import { pickPrimaryTarget, targetProbs, type PrimaryTarget } from "../utils/analysisVerdict";
import { getCachedBracket } from "../utils/bracketCache";
import { deriveAdvancingTeams, deriveActualAdvancing } from "../utils/bracket";
import { ALL_MATCHES, knockoutMatches } from "../data/matches";
import { normalizeStatus, isScoreValid } from "../utils/helpers";

export default function CompetitionStatus() {
  const { visible, confirmed, locked, user } = useCompetitionAnalysisAccess();
  const { navigate, params } = useNavigation();
  const allPredictions = useAllPredictions();
  const results = useMatchResults();
  const actualBonuses = useActualBonuses();

  // Every submitted form in the pool (leaderboard-ordered) — ANY of them can
  // be analysed (post-lock all predictions are readable); the viewer's own
  // forms are just the subset that gets first-person copy + head-to-head.
  const cert = useMemo(
    () => computePoolCertainty(results, allPredictions, actualBonuses),
    [results, allPredictions, actualBonuses],
  );
  const submittedForms = useMemo(
    () =>
      cert.forms.filter(
        (f) => normalizeStatus(allPredictions?.[f.formId]?.status) === "submitted",
      ),
    [cert, allPredictions],
  );
  const myForms = useMemo(
    () => submittedForms.filter((f) => user && f.userId === user.id),
    [submittedForms, user],
  );
  const otherForms = useMemo(
    () => submittedForms.filter((f) => !user || f.userId !== user.id),
    [submittedForms, user],
  );

  const [pickedForm, setPickedForm] = useState<string | null>(null);
  const urlForm = typeof params?.form === "string" ? params.form : null;
  const selectedFormId =
    [pickedForm, urlForm].find((fid) => fid && submittedForms.some((f) => f.formId === fid)) ||
    myForms[0]?.formId ||
    null;
  const owned = !!(
    user && selectedFormId && cert.byFormId[selectedFormId]?.userId === user.id
  );

  // Head-to-head rival — only meaningful while viewing one of MY forms, and
  // never the viewed form itself.
  const [rivalPick, setRivalPick] = useState<string | null>(null);
  const rivalFormId =
    owned &&
    rivalPick &&
    rivalPick !== selectedFormId &&
    submittedForms.some((f) => f.formId === rivalPick)
      ? rivalPick
      : null;

  // Minute ticker so the time-based window keeps sliding while the page is
  // open (a match kicking off must surface without waiting for a result).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Watch matches: next 48h (or next matchday), matchup already known.
  const watchMatches = useMemo(
    () => selectWatchMatches(ALL_MATCHES, results, getCachedBracket(results, true), now),
    [results, now],
  );
  const workerWatch = useMemo(
    () => watchMatches.map((w) => ({ id: w.id, isKnockout: w.stage !== "group" })),
    [watchMatches],
  );
  // Targets = my forms + (when browsing) the selected foreign form. Adding a
  // form changes the run's cache key — an accepted rerun (~2s first paint).
  const targetFormIds = useMemo(() => {
    const ids = myForms.map((f) => f.formId);
    if (selectedFormId && !ids.includes(selectedFormId)) ids.push(selectedFormId);
    return ids;
  }, [myForms, selectedFormId]);

  const analysis = usePersonalAnalysis({
    allPredictions,
    results,
    actualBonuses,
    targetFormIds,
    rivalFormId,
    watchMatches: workerWatch,
    enabled: visible && locked && targetFormIds.length > 0,
  });

  // Teams still alive in the real tournament (for the no-target live-picks
  // line): R32 qualifiers minus every played knockout match's loser. Before
  // the groups finish, qualification isn't final — treat everyone as alive.
  const aliveSet = useMemo(() => {
    const bracket = getCachedBracket(results, true);
    const r32 = deriveActualAdvancing(bracket, results)?.R32 || [];
    if (r32.length < 32) return null;
    const alive = new Set<string>(r32);
    for (const km of knockoutMatches) {
      const r = results?.[km.id];
      if (!isScoreValid(r)) continue;
      const teams = bracket[km.id];
      if (!teams?.home || !teams?.away) continue;
      const h = Number(r.homeScore);
      const a = Number(r.awayScore);
      const loser =
        h > a ? teams.away : a > h ? teams.home : r.advancingTeam === teams.home ? teams.away : teams.home;
      if (loser) alive.delete(loser);
    }
    return alive;
  }, [results]);

  // Selected form's index inside the aggregate + its primary target (the
  // root-for section serves ONE target — the verdict's).
  const targetFormIndex = useMemo(() => {
    if (!analysis.agg || !selectedFormId) return -1;
    return analysis.agg.targetForms.findIndex((t) => t.formId === selectedFormId);
  }, [analysis.agg, selectedFormId]);

  // The PrimaryTarget is computed ONCE here and passed to BOTH the verdict
  // and the root-for section — a single evaluation, so the headline and the
  // advice can never describe different money targets.
  const primaryTarget = useMemo<PrimaryTarget | null>(() => {
    if (!analysis.agg || targetFormIndex < 0 || !selectedFormId) return null;
    const my = cert.byFormId[selectedFormId];
    if (!my || analysis.agg.simCount === 0) return null;
    return pickPrimaryTarget({
      currentRank: my.rank,
      nForms: cert.nForms,
      probs: targetProbs(analysis.agg, targetFormIndex),
      aliveForFirst: my.aliveForFirst,
    });
  }, [analysis.agg, targetFormIndex, selectedFormId, cert]);

  // Teams the selected form predicted to advance out of the watch matches'
  // stages (against-heart detection in the root-for cards).
  const predictedAdvancers = useMemo(() => {
    if (!selectedFormId) return null;
    const matches = allPredictions?.[selectedFormId]?.matches;
    if (!matches) return null;
    const advancing = deriveAdvancingTeams(getCachedBracket(matches));
    const rounds = new Set(
      watchMatches.map((w) => NEXT_ROUND[w.stage]).filter(Boolean),
    );
    const teams = new Set<string>();
    for (const round of rounds) {
      for (const t of advancing[round] || []) teams.add(t);
    }
    return teams;
  }, [selectedFormId, allPredictions, watchMatches]);

  // Live-match staleness note (same detection idea as LiveNowCard: kicked
  // off, no recorded result).
  const liveNow = useMemo(
    () => watchMatches.some((w) => w.kickoffUTC <= now),
    [watchMatches, now],
  );

  // Settings-confirmation watchdog: if the server snapshot never lands
  // (offline deep link), the loader below must not be eternal (CLAUDE.md
  // failure-path rule) — after the timeout we offer a way out.
  const [confirmStuck, setConfirmStuck] = useState(false);
  useEffect(() => {
    if (confirmed) return undefined;
    const t = setTimeout(() => setConfirmStuck(true), 10000);
    return () => clearTimeout(t);
  }, [confirmed]);

  // ── Gates ──
  // Settings not server-confirmed yet: we don't KNOW whether this user is
  // released, so show a neutral loader — never the "not opened for you"
  // message off a stale/default cache.
  if (!confirmed) {
    return (
      <div className="text-center py-16 text-ink-muted font-bold">
        <div className="text-5xl animate-bounce">⚽</div>
        <div className="text-sm mt-3">טוען…</div>
        {confirmStuck && (
          <div className="mt-6 space-y-2 max-w-xs mx-auto">
            <p className="text-xs font-medium">ההגדרות לא נטענות — בדקו את החיבור.</p>
            <button onClick={() => window.location.reload()} className="btn-duo btn-duo-primary w-full">
              רעננו את הדף
            </button>
            <button onClick={() => navigate("home")} className="btn-duo btn-duo-ghost w-full">
              חזרה לדף הבית
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!visible) {
    return (
      <EmptyState
        icon="🔭"
        title="העמוד הזה עוד לא נפתח עבורך"
        description="ניתוח התחרות נפתח בהדרגה. עוד קצת סבלנות — שווה לחכות."
        cta={
          <button onClick={() => navigate("home")} className="btn-duo btn-duo-primary">
            חזרה לדף הבית
          </button>
        }
      />
    );
  }

  if (!locked) {
    return (
      <div className="text-center py-16 card-duo-lg max-w-md mx-auto">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-extrabold text-ink mb-2">המצב שלי בתחרות</h2>
        <p className="text-sm text-ink-muted font-medium">
          הניתוח יתגלה כשהמשחקים יתחילו.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate("leaderboard")}
        className="text-sm text-secondary mb-3 flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0 hover:text-secondary-dark"
      >
        <ArrowRight size={16} aria-hidden="true" />
        חזרה לדירוג
      </button>
      <PageHeader
        eyebrow="המונדיאל שלך"
        title="המצב שלי בתחרות"
        subtitle="נכון להיום, לפי סימולציה של כל מה שעוד יכול לקרות"
      />

      {liveNow && (
        <div className="alert-accent-soft rounded-2xl p-3 mb-3 text-sm font-bold text-ink">
          ⏳ יש משחק על הדשא ממש עכשיו — מה שרואים כאן עוד לא כולל אותו, והתמונה
          תתעדכן כשתיכנס התוצאה.
        </div>
      )}

      {(myForms.length > 1 || (!owned && selectedFormId && myForms.length > 0)) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {myForms.map((f) => (
            <button
              key={f.formId}
              onClick={() => setPickedForm(f.formId)}
              className={`chip-duo ${selectedFormId === f.formId ? "active" : ""}`}
              aria-pressed={selectedFormId === f.formId}
            >
              ⚽ {f.formName}
            </button>
          ))}
        </div>
      )}

      {/* Any-form browser (feature: analysis for a form that isn't mine) */}
      {otherForms.length > 0 && (
        <label className="flex flex-col gap-1 mb-3">
          <span className="text-2xs text-ink-muted font-extrabold">
            🔎 סקרנות בריאה — ניתוח של כל טופס בתחרות
          </span>
          <select
            value={owned ? "" : selectedFormId || ""}
            onChange={(e) =>
              setPickedForm(e.target.value || myForms[0]?.formId || null)
            }
            className="input-duo input-duo-sm"
          >
            <option value="">{myForms.length > 0 ? "הטופס שלי" : "בחרו טופס…"}</option>
            {otherForms.map((f) => (
              <option key={f.formId} value={f.formId}>
                #{f.rank} · {f.formName} · {f.totalPoints} נק׳
              </option>
            ))}
          </select>
        </label>
      )}

      {!selectedFormId ? (
        <EmptyState
          icon="📝"
          title="אין טופס בתחרות"
          description="העמוד הזה מספר מה מצב הטופס שלך בתחרות — ובלי טופס שהוגש, אין מה לספר. אפשר עדיין לבחור למעלה טופס אחר ולהציץ בניתוח שלו."
        />
      ) : (
        <>
          <VerdictSection
            formId={selectedFormId}
            formData={allPredictions?.[selectedFormId]}
            cert={cert}
            agg={analysis.agg}
            targetFormIndex={targetFormIndex}
            target={primaryTarget}
            aliveSet={aliveSet}
            owned={owned}
            refining={analysis.running && !!analysis.agg}
            failed={analysis.failed}
            retry={analysis.retry}
          />

          <RootForSection
            watchMatches={watchMatches}
            agg={analysis.agg}
            targetFormIndex={targetFormIndex}
            targetKey={primaryTarget?.key ?? "none"}
            predictedAdvancers={predictedAdvancers}
            owned={owned}
          />

          {/* Head-to-head: only while viewing one of MY forms */}
          {owned && (
            <HeadToHeadSection
              myFormId={selectedFormId}
              cert={cert}
              candidates={submittedForms}
              rivalFormId={rivalFormId}
              onPickRival={setRivalPick}
              agg={analysis.agg}
              targetFormIndex={targetFormIndex}
              watchMatches={watchMatches}
              predictedAdvancers={predictedAdvancers}
              running={analysis.running}
              failed={analysis.failed}
              retry={analysis.retry}
            />
          )}
        </>
      )}

      <OutlookSection
        allPredictions={allPredictions}
        agg={analysis.agg}
        watchMatches={watchMatches}
      />

      <p className="text-xs text-ink-muted font-medium text-center mt-4 mb-2">
        כל מה שכתוב כאן הוא הערכה — לא הבטחה, לא הימור, ולא תחליף לצפייה
        במשחקים. הטבלה האמיתית נקבעת רק על הדשא. ⚽
      </p>
    </div>
  );
}
