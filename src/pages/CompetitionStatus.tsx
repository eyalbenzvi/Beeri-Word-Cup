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

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import PageHeader from "../components/PageHeader";
import VerdictSection from "../components/competitionStatus/VerdictSection";
import RootForSection, { NEXT_ROUND } from "../components/competitionStatus/RootForSection";
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
import { useScenarioData } from "../hooks/useScenarioRun";
import { computePoolCertainty } from "../utils/poolCertainty";
import { selectWatchMatches } from "../utils/analysisWindow";
import { pickPrimaryTarget, targetProbs } from "../utils/analysisVerdict";
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
  const scenario = useScenarioData();

  // The viewer's submitted forms, leaderboard-ordered.
  const cert = useMemo(
    () => computePoolCertainty(results, allPredictions, actualBonuses),
    [results, allPredictions, actualBonuses],
  );
  const myForms = useMemo(
    () =>
      cert.forms.filter(
        (f) =>
          user &&
          f.userId === user.id &&
          normalizeStatus(allPredictions?.[f.formId]?.status) === "submitted",
      ),
    [cert, user, allPredictions],
  );

  const [pickedForm, setPickedForm] = useState<string | null>(null);
  const urlForm = typeof params?.form === "string" ? params.form : null;
  const selectedFormId =
    [pickedForm, urlForm].find((fid) => fid && myForms.some((f) => f.formId === fid)) ||
    myForms[0]?.formId ||
    null;

  // Watch matches: next 48h (or next matchday), matchup already known.
  const watchMatches = useMemo(
    () => selectWatchMatches(ALL_MATCHES, results, getCachedBracket(results, true), Date.now()),
    [results],
  );
  const workerWatch = useMemo(
    () => watchMatches.map((w) => ({ id: w.id, isKnockout: w.stage !== "group" })),
    [watchMatches],
  );
  const targetFormIds = useMemo(() => myForms.map((f) => f.formId), [myForms]);

  const analysis = usePersonalAnalysis({
    allPredictions,
    results,
    actualBonuses,
    targetFormIds,
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

  const primaryTargetKey = useMemo(() => {
    if (!analysis.agg || targetFormIndex < 0 || !selectedFormId) return "none" as const;
    const my = cert.byFormId[selectedFormId];
    if (!my || analysis.agg.simCount === 0) return "none" as const;
    return pickPrimaryTarget({
      currentRank: my.rank,
      nForms: cert.nForms,
      probs: targetProbs(analysis.agg, targetFormIndex),
      aliveForFirst: my.aliveForFirst,
    }).key;
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
    () => watchMatches.some((w) => w.kickoffUTC <= Date.now()),
    [watchMatches],
  );

  // ── Gates ──
  // Settings not server-confirmed yet: we don't KNOW whether this user is
  // released, so show a neutral loader — never the "not opened for you"
  // message off a stale/default cache.
  if (!confirmed) {
    return (
      <div className="text-center py-16 text-ink-muted font-bold">
        <div className="text-5xl animate-bounce">⚽</div>
        <div className="text-sm mt-3">טוען…</div>
      </div>
    );
  }

  if (!visible) {
    return (
      <EmptyState
        icon="🔭"
        title="העמוד הזה עוד לא נפתח עבורך"
        description="ניתוח התחרות משוחרר בהדרגה. שווה לחכות — זה טוב."
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
          ⏳ יש משחק על הדשא ממש עכשיו — התמונה כאן מעודכנת לרגע שריקת הפתיחה,
          ותתרענן כשתיכנס תוצאה.
        </div>
      )}

      {myForms.length === 0 ? (
        <EmptyState
          icon="📝"
          title="אין טופס בתחרות"
          description="העמוד הזה מספר איך הטופס שלך מסתדר — ובלי טופס שהוגש, אין מה לספר."
        />
      ) : (
        <>
          {myForms.length > 1 && (
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

          {selectedFormId && (
            <VerdictSection
              formId={selectedFormId}
              formData={allPredictions?.[selectedFormId]}
              cert={cert}
              agg={analysis.agg}
              targetFormIndex={targetFormIndex}
              aliveSet={aliveSet}
              refining={analysis.running && !!analysis.agg}
              failed={analysis.failed}
              retry={analysis.retry}
            />
          )}

          <RootForSection
            watchMatches={watchMatches}
            agg={analysis.agg}
            targetFormIndex={targetFormIndex}
            targetKey={primaryTargetKey}
            predictedAdvancers={predictedAdvancers}
          />
        </>
      )}

      <OutlookSection
        run={scenario.state.result}
        runLoading={scenario.state.loading}
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
