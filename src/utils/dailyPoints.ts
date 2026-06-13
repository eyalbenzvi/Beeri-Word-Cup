// Per-day points for a single form — powers the home-page "הניקוד שלך"
// strip ("היום צברת 9 נק׳").
//
// Parity rule: this must agree with the leaderboard's match-points math or
// users will diff the two numbers within an hour. It therefore iterates the
// OFFICIAL results map and calls calculateMatchPoints with the exact same
// arguments calculateFullScore uses (stage from the result, predTeams /
// actualTeams from the form / actual brackets) — only filtered to matches
// whose calendar date (in the VIEWER's timezone) matches the requested key,
// so the late-night US session lands on the day the viewer experienced it.
// The caller must compute `dateKey` with the SAME `tz` it passes here.
//
// Advancing/champion/top-scorer bonuses are deliberately excluded: they are
// not "earned on a day" in any way a user would recognize.

import { calculateMatchPoints } from "./scoring";
import { getMatchById } from "../data/matches";
import { getMatchDateKey, dateKeyForNow } from "./userTime";

export function computeDailyFormPoints({
  formMatches,
  results,
  dateKey,
  predBracket,
  actualBracket,
  tz,
}: {
  formMatches: Record<string, any>;
  results: Record<string, any>;
  dateKey: string;
  predBracket?: Record<string, any>;
  actualBracket?: Record<string, any>;
  // Required: must be the SAME timezone used to derive `dateKey`, so the
  // day-key filter below can't silently disagree with the requested day.
  tz: string;
}) {
  let points = 0;
  let exactCount = 0;
  let outcomeCount = 0;
  let playedCount = 0;
  if (!results || !dateKey) {
    return { points, exactCount, outcomeCount, playedCount };
  }
  for (const [matchId, actual] of Object.entries(results)) {
    const actualAny = actual as any;
    if (!actualAny || actualAny.homeScore == null || actualAny.awayScore == null) continue;
    const match = getMatchById(matchId);
    if (!match || getMatchDateKey(match, tz) !== dateKey) continue;
    playedCount++;
    const stage = actualAny.stage || "group";
    const result = calculateMatchPoints(
      formMatches?.[matchId],
      actualAny,
      stage,
      predBracket?.[matchId] || null,
      actualBracket?.[matchId] || null,
    );
    points += result.points;
    if (result.exactPoints > 0) exactCount++;
    else if (result.outcomePoints > 0) outcomeCount++;
  }
  return { points, exactCount, outcomeCount, playedCount };
}

// Israel-calendar date key for an arbitrary timestamp ("2026-06-12").
// Retained as the Israel-anchored helper; app UI uses dateKeyForNow (viewer's
// timezone) instead. Kept in terms of the generic helper so the two cannot
// drift.
export function israelDateKeyForNow(nowMs: number) {
  return dateKeyForNow(nowMs, "Asia/Jerusalem");
}
