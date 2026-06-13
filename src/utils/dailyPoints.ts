// Per-day points for a single form — powers the home-page "הניקוד שלך"
// strip ("היום צברת 9 נק׳").
//
// Parity rule: this must agree with the leaderboard's match-points math or
// users will diff the two numbers within an hour. It therefore iterates the
// OFFICIAL results map and calls calculateMatchPoints with the exact same
// arguments calculateFullScore uses (stage from the result, predTeams /
// actualTeams from the form / actual brackets) — only filtered to matches
// whose ISRAEL calendar date matches the requested key, so the 04:00 game
// from the US night session lands on the right day.
//
// Advancing/champion/top-scorer bonuses are deliberately excluded: they are
// not "earned on a day" in any way a user would recognize.

import { calculateMatchPoints } from "./scoring";
import { getMatchById } from "../data/matches";
import { getMatchIsraelDateKey } from "./matchTime";

export function computeDailyFormPoints({
  formMatches,
  results,
  dateKey,
  predBracket,
  actualBracket,
}: {
  formMatches: Record<string, any>;
  results: Record<string, any>;
  dateKey: string;
  predBracket?: Record<string, any>;
  actualBracket?: Record<string, any>;
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
    if (!match || getMatchIsraelDateKey(match) !== dateKey) continue;
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
// sv-SE gives ISO format; the timezone does the IDT conversion.
export function israelDateKeyForNow(nowMs: number) {
  return new Date(nowMs).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jerusalem",
  });
}
