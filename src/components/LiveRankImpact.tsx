// "אם המשחקים החיים ייגמרו עכשיו" — projects the signed-in user's rank under a
// hypothetical where every in-progress match is treated as final at its current
// live score (#2). Turns passive spectating into "this goal moves me up".
//
// Built entirely from existing pieces: useUpcomingMatches (isLive), useLiveScores
// (provisional scores), and TWO useLeaderboardComputed passes — one on the real
// results (current rank) and one on results-plus-live (projected rank). Both
// memoise/cache, and the live hook only polls while a match is live.

import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  useCurrentUser,
  useMatchResults,
  useAllPredictions,
  useUserDirectory,
  useActualBonuses,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { useUpcomingMatches } from "../hooks/useUpcomingMatches";
import { useLiveScores } from "../hooks/useLiveScores";

export default function LiveRankImpact() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUserDirectory();
  const actualBonuses = useActualBonuses();

  const matches = useUpcomingMatches(undefined);
  const liveMatches = useMemo(() => matches.filter((m) => m.isLive), [matches]);

  // Current standings (official results) + the bracket the live hook needs to
  // orient knockout scores.
  const current = useLeaderboardComputed(results, allPredictions, users, actualBonuses);
  const { scores: liveScores } = useLiveScores(liveMatches, current.actualBracket);

  // Results-plus-live hypothetical. Knockout games also carry a provisional
  // advancing side when decisive, so projected advancing points are sensible.
  const hypoResults = useMemo(() => {
    const out: Record<string, any> = { ...results };
    for (const m of liveMatches) {
      const s = liveScores[m.id];
      if (!s || s.homeScore == null || s.awayScore == null) continue;
      const isKo = m.stage !== "group";
      const home = isKo ? current.actualBracket[m.id]?.home : m.homeTeam;
      const away = isKo ? current.actualBracket[m.id]?.away : m.awayTeam;
      const entry: any = { homeScore: s.homeScore, awayScore: s.awayScore, played: true };
      if (isKo) {
        entry.homeTeam = home;
        entry.awayTeam = away;
        if (s.homeScore > s.awayScore) entry.advancingTeam = home;
        else if (s.awayScore > s.homeScore) entry.advancingTeam = away;
      }
      out[m.id] = entry;
    }
    return out;
  }, [results, liveMatches, liveScores, current.actualBracket]);

  const hypo = useLeaderboardComputed(hypoResults, allPredictions, users, actualBonuses);

  // Which live matches actually have a usable score (drives the empty guard).
  const scoredLiveCount = liveMatches.filter(
    (m) => liveScores[m.id]?.homeScore != null && liveScores[m.id]?.awayScore != null,
  ).length;

  const impact = useMemo(() => {
    if (!user?.id) return null;
    const mine = current.rankedLeaderboard.filter((e) => e.userId === user.id);
    if (mine.length === 0) return null;
    const best = mine.reduce((a, b) => (a.rank <= b.rank ? a : b));
    const hypoEntry = hypo.rankedLeaderboard.find((e) => e.formId === best.formId);
    if (!hypoEntry) return null;
    // Provisional points this form picks up from the live matches.
    let livePoints = 0;
    const hypoScored = hypo.scoredForms.find((e) => e.formId === best.formId);
    for (const m of liveMatches) {
      livePoints += hypoScored?.matchScores?.[m.id]?.points || 0;
    }
    return {
      formName: best.formName,
      currentRank: best.rank,
      projectedRank: hypoEntry.rank,
      delta: best.rank - hypoEntry.rank, // positive = climbing
      livePoints,
    };
  }, [user?.id, current.rankedLeaderboard, hypo.rankedLeaderboard, hypo.scoredForms, liveMatches]);

  if (scoredLiveCount === 0 || !impact) return null;

  const { formName, projectedRank, delta, livePoints } = impact;

  return (
    <div
      className="card-duo w-full text-right mb-3"
      style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-accent)" }}
    >
      <div className="text-xs font-extrabold text-accent-text mb-1">
        📡 אם המשחקים החיים ייגמרו עכשיו
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-ink">
        <span className="truncate">
          {formName}: מקום <span className="tabular-nums">{projectedRank}</span>
        </span>
        {delta > 0 && (
          <span className="inline-flex items-center gap-1 text-primary-dark">
            <TrendingUp size={16} aria-hidden="true" /> +{delta}
          </span>
        )}
        {delta < 0 && (
          <span className="inline-flex items-center gap-1 text-danger">
            <TrendingDown size={16} aria-hidden="true" /> {delta}
          </span>
        )}
        {delta === 0 && <span className="text-ink-muted">ללא שינוי בדירוג</span>}
        {livePoints > 0 && (
          <span className="text-accent-text">· צבירה צפויה +{livePoints} נק׳</span>
        )}
      </div>
      <div className="text-[11px] text-ink-light font-medium mt-1">ניחוש זמני — לא סופי עד שריקת הסיום</div>
    </div>
  );
}
