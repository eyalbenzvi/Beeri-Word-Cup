// "מה צפוי בטורניר" — the shared tournament outlook: champion odds (verbal,
// with how many pool forms picked each team) + the key match of the window.
// Champion odds come FREE from the existing server-computed scenarioRun doc
// (already subscribed by every client); no new computation here. Per the
// domain review, there is deliberately NO "most likely final" (generic,
// usually wrong) — the pool-specific pick counts are the social hook.

import { useMemo } from "react";
import { getTeamFlagName } from "../../utils/teamDisplay";
import { getCachedChampion } from "../../utils/bracketCache";
import { normalizeStatus } from "../../utils/helpers";
import { chanceLabel, formatChance, pickKeyMatch } from "../../utils/analysisVerdict";
import { useScenarioData } from "../../hooks/useScenarioRun";
import type { PersonalAnalysisAggregate } from "../../utils/personalAnalysis";
import type { WatchMatch } from "../../utils/analysisWindow";

const MAX_CHAMPION_ROWS = 5;

export default function OutlookSection({
  allPredictions,
  agg,
  watchMatches,
}: {
  allPredictions: Record<string, any>;
  agg: PersonalAnalysisAggregate | null;
  watchMatches: WatchMatch[];
}) {
  // The scenarioRun subscription lives HERE (not in the page) on purpose:
  // this component only mounts after the page's flag/lock gates pass, so a
  // pre-lock or unreleased deep link never opens a doomed subscription
  // (permission-denied → Sentry noise on every visit).
  const { state } = useScenarioData();
  const run = state.result;
  const runLoading = state.loading;
  // How many submitted forms picked each champion (pool-crowd view).
  const pickCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of Object.values(allPredictions || {})) {
      const pred = p as any;
      if (normalizeStatus(pred?.status) !== "submitted") continue;
      const champ = getCachedChampion(pred.matches || {});
      if (champ) counts[champ] = (counts[champ] || 0) + 1;
    }
    return counts;
  }, [allPredictions]);

  const champions = useMemo(() => {
    if (!run?.champions?.length) return [];
    return run.champions.slice(0, MAX_CHAMPION_ROWS).map((c) => ({
      code: c.code,
      prob: c.prob,
      picks: pickCounts[c.code] || 0,
    }));
  }, [run, pickCounts]);

  const keyMatch = useMemo(() => {
    if (!agg) return null;
    const km = pickKeyMatch(agg.watch);
    if (!km) return null;
    const wm = watchMatches.find((w) => w.id === km.matchId);
    return wm || null;
  }, [agg, watchMatches]);

  const maxProb = champions.reduce((m, c) => Math.max(m, c.prob), 0.0001);

  const generatedAt = run?.meta?.generatedAt
    ? new Date(run.meta.generatedAt).toLocaleString("he-IL", {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="card-duo mb-4">
      <h3 className="text-base font-extrabold text-ink mb-0.5">🔮 מה צפוי בטורניר</h3>
      <p className="text-xs text-ink-muted font-medium mb-3">
        אותה תמונה לכולם — מסימולציה של המשך הטורניר
      </p>

      {keyMatch && (
        <div className="alert-primary-soft rounded-2xl p-3 mb-3">
          <div className="text-2xs text-ink-muted font-extrabold mb-0.5">
            משחק המפתח של הימים הקרובים
          </div>
          <div className="text-sm font-extrabold text-ink">
            {getTeamFlagName(keyMatch.home)} <span className="text-ink-muted">נגד</span>{" "}
            {getTeamFlagName(keyMatch.away)} — התוצאה שלו יכולה לטלטל את הטבלה יותר
            מכל משחק אחר 🌪️
          </div>
        </div>
      )}

      {runLoading ? (
        <p className="text-sm text-ink-muted font-bold py-3 text-center animate-pulse">
          טוען תחזית…
        </p>
      ) : champions.length === 0 ? (
        <p className="text-sm text-ink-muted font-medium py-3 text-center">
          עוד אין תחזית לטורניר — היא תחושב אוטומטית אחרי התוצאה הבאה.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="text-sm font-extrabold text-ink mb-1">מי תיקח את זה?</div>
          {champions.map((c) => (
            <div key={c.code} className="relative rounded-xl overflow-hidden bg-bg-soft">
              <span
                className="absolute inset-y-0 right-0 bg-primary/15"
                style={{ width: `${(c.prob / maxProb) * 100}%` }}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm font-extrabold text-ink">{getTeamFlagName(c.code)}</span>
                <span className="text-xs font-bold text-ink-muted text-left">
                  {formatChance(chanceLabel(c.prob))}
                  {c.picks > 0 && (
                    <span className="block text-2xs text-ink-light">
                      {c.picks === 1 ? (
                        "טופס אחד בחר בה"
                      ) : (
                        <>
                          <bdi>{c.picks}</bdi> טפסים בחרו בה
                        </>
                      )}
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {generatedAt && (
        <p className="text-3xs text-ink-light font-bold mt-3 text-center">
          עודכן: <bdi>{generatedAt}</bdi> · מודל Elo — הערכה, לא הימור
        </p>
      )}
    </div>
  );
}
