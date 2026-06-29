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
      // A live knockout match whose feeder slot hasn't resolved yet has no real
      // teams — skip it rather than score a matchup with undefined teams.
      if (isKo && (!home || !away)) continue;
      // `stage` matters: scoring multiplies points by round (scoring.ts reads
      // actual.stage || "group"), so a live knockout match scored without it
      // would be valued as a group game and skew the projection.
      const entry: any = { stage: m.stage, homeScore: s.homeScore, awayScore: s.awayScore, played: true };
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

  // One projection row per form the signed-in user owns (not just the best),
  // ordered by current rank so the strongest form leads.
  const impacts = useMemo(() => {
    if (!user?.id) return [];
    const mine = current.rankedLeaderboard
      .filter((e) => e.userId === user.id)
      .sort((a, b) => a.rank - b.rank);
    const rows = [];
    for (const entry of mine) {
      const hypoEntry = hypo.rankedLeaderboard.find((e) => e.formId === entry.formId);
      if (!hypoEntry) continue;
      // Provisional points this form picks up if the live matches ended now.
      // Use the TOTAL-points delta (hypothetical minus current), not just the
      // per-match outcome/exact points: a decisive live knockout (or group)
      // game also flips advancing predictions, so the form gains the advancing
      // bonus on top of the match score (e.g. Brazil winning a R32 game earns
      // הכרעה+תוצאה AND the "advanced to R16" points). Summing matchScores alone
      // dropped that advancing bonus and under-reported the projected gain.
      const livePoints = (hypoEntry.totalPoints || 0) - (entry.totalPoints || 0);
      rows.push({
        formId: entry.formId,
        formName: entry.formName,
        currentRank: entry.rank,
        projectedRank: hypoEntry.rank,
        delta: entry.rank - hypoEntry.rank, // positive = climbing
        livePoints,
      });
    }
    return rows;
  }, [user?.id, current.rankedLeaderboard, hypo.rankedLeaderboard]);

  if (scoredLiveCount === 0 || impacts.length === 0) return null;

  return (
    <div className="alert-accent-soft w-full text-right mb-3">
      <div className="text-xs font-extrabold text-accent-text mb-1">
        📡 אם המשחקים החיים ייגמרו עכשיו
      </div>
      <div className="flex flex-col gap-1">
        {impacts.map(({ formId, formName, projectedRank, delta, livePoints }) => (
          <div
            key={formId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-ink"
          >
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
        ))}
      </div>
      <div className="text-xs text-ink-light font-medium mt-1">ניחוש זמני — לא סופי עד שריקת הסיום</div>
    </div>
  );
}
