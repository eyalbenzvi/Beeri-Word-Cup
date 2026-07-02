/**
 * Watch-match selection for the competition-analysis "root-for" guide.
 *
 * Pure — no React, no Firebase, worker-safe.
 *
 * Rules (per the product spec):
 *   - Only matches in the NEXT 48 HOURS are considered (a match that already
 *     kicked off but has no recorded result — i.e. live right now — still
 *     counts: rooting mid-match is the whole point).
 *   - If no match falls inside the window, fall back to the NEXT MATCHDAY:
 *     all unplayed matches sharing the earliest upcoming Israel calendar day.
 *   - A knockout match qualifies only when its ACTUAL matchup is already
 *     known (both bracket slots resolved from real results) — otherwise the
 *     sim seats different teams in different runs and the advice can't name
 *     a team. Group matches always have fixed teams.
 */

import { getMatchKickoffUTC, getMatchIsraelDateKey } from "./matchTime";
import { isScoreValid } from "./helpers";
import { isUnresolvedKnockoutTie } from "./resultBreakdown";

export const WATCH_WINDOW_MS = 48 * 3600000;
// A match that kicked off within the last 3h with no result is treated as
// live/unresolved and stays watchable (covers extra time + shootout).
export const WATCH_LIVE_GRACE_MS = 3 * 3600000;

// Which round a match's winner advances INTO — tournament structure, shared
// by the root-for cards and the page's against-heart detection.
export const NEXT_ROUND: Record<string, string> = {
  R32: "R16",
  R16: "QF",
  QF: "SF",
  SF: "F",
};

// A match counts as DECIDED only when it has a final result. A knockout
// entry tied at 90' with no advancingTeam yet (extra time / shootout in
// progress) is NOT final — that is the highest-drama rooting moment and it
// must stay on the watch list. Mirrors upcomingMatches.hasFinalResult.
function hasFinalResult(result: any, isKnockout: boolean): boolean {
  if (!isScoreValid(result)) return false;
  return !isUnresolvedKnockoutTie(result, isKnockout);
}

export type WatchMatch = {
  id: string;
  stage: string;
  kickoffUTC: number;
  // Resolved fixture teams (group: fixed; knockout: from the actual bracket).
  home: string;
  away: string;
};

// `actualBracket` = calcBracketTeams(results) — passed in (not computed here)
// so callers can reuse the bracket cache and this module stays dependency-lean.
export function selectWatchMatches(
  allMatches: any[],
  results: Record<string, any>,
  actualBracket: Record<string, any>,
  now: number,
): WatchMatch[] {
  const candidates: WatchMatch[] = [];
  for (const m of allMatches) {
    const isKO = !!m.stage && m.stage !== "group";
    if (hasFinalResult(results?.[m.id], isKO)) continue; // decided
    const kickoff = getMatchKickoffUTC(m);
    if (kickoff == null) continue;
    if (kickoff < now - WATCH_LIVE_GRACE_MS) continue; // stale placeholder
    const teams = isKO
      ? actualBracket?.[m.id] || {}
      : { home: m.homeTeam, away: m.awayTeam };
    if (!teams.home || !teams.away) continue; // matchup not determined yet
    candidates.push({
      id: m.id,
      stage: m.stage || "group",
      kickoffUTC: kickoff,
      home: teams.home,
      away: teams.away,
    });
  }
  candidates.sort((a, b) => a.kickoffUTC - b.kickoffUTC);

  const inWindow = candidates.filter((c) => c.kickoffUTC <= now + WATCH_WINDOW_MS);
  if (inWindow.length > 0) return inWindow;

  // Fallback: the next matchday — every candidate sharing the earliest
  // upcoming Israel calendar day.
  if (candidates.length === 0) return [];
  const byId: Record<string, any> = {};
  for (const m of allMatches) byId[m.id] = m;
  const firstKey = getMatchIsraelDateKey(byId[candidates[0].id]);
  if (!firstKey) return [candidates[0]];
  return candidates.filter((c) => getMatchIsraelDateKey(byId[c.id]) === firstKey);
}
