import { getMatchKickoffUTC } from "./matchTime";

// Window size for the home-page widget: matches kicking off in the next 24h.
export const UPCOMING_WINDOW_MS = 24 * 3600000;

/**
 * Pure selector for the home-page upcoming-matches widget.
 *
 * Returns the list of matches to show:
 *   - kickoff time strictly in the future
 *   - kickoff within the next 24 hours
 *   - no recorded result yet
 *
 * @param {Array} allMatches Array of match objects (from src/data/matches).
 * @param {Object} matchResults Map of matchId -> result (or null/undefined).
 * @param {number} now UTC millisecond timestamp to compare against.
 * @returns {Array} Matches to display, sorted ascending by kickoff.
 */
export function selectUpcomingMatches(allMatches, matchResults, now) {
  if (!Array.isArray(allMatches)) return [];
  const windowEnd = now + UPCOMING_WINDOW_MS;
  const candidates = [];
  for (const match of allMatches) {
    const kickoff = getMatchKickoffUTC(match);
    if (kickoff === null) continue;
    if (kickoff <= now) continue;
    if (kickoff > windowEnd) continue;
    if (matchResults && matchResults[match.id]) continue;
    candidates.push({ match, kickoff });
  }
  candidates.sort((a, b) => a.kickoff - b.kickoff);
  return candidates.map(({ match }) => match);
}
