import { getMatchIsraelDateKey, getMatchKickoffUTC } from "./matchTime";

/**
 * Pure selector for the home-page upcoming-matches widget.
 *
 * Returns the list of matches to show:
 *   - kickoff time strictly in the future
 *   - no recorded result yet
 *   - on the same Israel-calendar day as the earliest such match
 *
 * @param {Array} allMatches Array of match objects (from src/data/matches).
 * @param {Object} matchResults Map of matchId -> result (or null/undefined).
 * @param {number} now UTC millisecond timestamp to compare against.
 * @returns {Array} Matches to display, sorted ascending by kickoff.
 */
export function selectUpcomingMatches(allMatches, matchResults, now) {
  if (!Array.isArray(allMatches)) return [];
  const candidates = [];
  for (const match of allMatches) {
    const kickoff = getMatchKickoffUTC(match);
    if (kickoff === null) continue;
    if (kickoff <= now) continue;
    if (matchResults && matchResults[match.id]) continue;
    candidates.push({ match, kickoff });
  }
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => a.kickoff - b.kickoff);
  const firstDateKey = getMatchIsraelDateKey(candidates[0].match);
  return candidates
    .filter(({ match }) => getMatchIsraelDateKey(match) === firstDateKey)
    .map(({ match }) => match);
}
