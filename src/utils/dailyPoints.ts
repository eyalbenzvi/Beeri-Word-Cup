// Rolling-window points for a single form — powers the home-page "הניקוד שלך"
// strip ("24 השעות האחרונות: +9 נק׳").
//
// Why a rolling 24h window (not a calendar "today"): a calendar day resets at
// midnight, so a user opening the app at 01:00 saw "today: +0" even though
// matches had just finished — confusing. A rolling [now-24h, now] window keeps
// last night's haul visible all morning and never resets mid-conversation.
//
// Parity rule: this must agree with the leaderboard's match-points math or
// users will diff the two numbers within an hour. It therefore iterates the
// OFFICIAL results map and calls calculateMatchPoints with the exact same
// arguments calculateFullScore uses (stage from the result, predTeams /
// actualTeams from the form / actual brackets) — only filtered to matches
// whose kickoff instant falls inside the requested window.
//
// The window is anchored on the absolute kickoff instant (getMatchKickoffUTC),
// so it is timezone-independent: "the last 24 hours" is the same wall-clock
// span for every viewer, no tz bucketing required.
//
// Advancing/champion/top-scorer bonuses are deliberately excluded: they are
// not "earned in a window" in any way a user would recognize.

import { calculateMatchPoints } from "./scoring";
import { getMatchById } from "../data/matches";
import { getMatchKickoffUTC } from "./matchTime";

export function computeWindowFormPoints({
  formMatches,
  results,
  fromMs,
  toMs,
  predBracket,
  actualBracket,
}: {
  formMatches: Record<string, any>;
  results: Record<string, any>;
  // Inclusive window bounds in absolute ms (e.g. [Date.now() - 24h, Date.now()]).
  fromMs: number;
  toMs: number;
  predBracket?: Record<string, any>;
  actualBracket?: Record<string, any>;
}) {
  let points = 0;
  let exactCount = 0;
  let outcomeCount = 0;
  let playedCount = 0;
  if (!results || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { points, exactCount, outcomeCount, playedCount };
  }
  for (const [matchId, actual] of Object.entries(results)) {
    const actualAny = actual as any;
    if (!actualAny || actualAny.homeScore == null || actualAny.awayScore == null) continue;
    const match = getMatchById(matchId);
    const kickoff = getMatchKickoffUTC(match);
    if (kickoff == null || kickoff < fromMs || kickoff > toMs) continue;
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
