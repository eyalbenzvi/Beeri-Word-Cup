import { getMatchKickoffUTC } from "./matchTime";

// Window size for the home-page widget: matches kicking off in the next 24h.
export const UPCOMING_WINDOW_MS = 24 * 3600000;

// How long after kickoff a match without a recorded result keeps showing as
// "live". Covers 90' + extra time + penalties + delays with margin; also
// caps the degenerate case where a result is never entered (otherwise the
// match would stay on the home page forever).
export const LIVE_WINDOW_MS = 4 * 3600000;

/**
 * Pure selector for the home-page upcoming-matches widget.
 *
 * Returns the list of matches to show:
 *   - live: kickoff already passed (up to LIVE_WINDOW_MS ago) and no
 *     recorded result yet — returned with `isLive: true`
 *   - upcoming: kickoff within the next 24 hours and no recorded result
 *
 * @param {Array} allMatches Array of match objects (from src/data/matches).
 * @param {Object} matchResults Map of matchId -> result (or null/undefined).
 * @param {number} now UTC millisecond timestamp to compare against.
 * @returns {Array} Matches to display, sorted ascending by kickoff.
 */
export function selectUpcomingMatches(allMatches, matchResults, now) {
  if (!Array.isArray(allMatches)) return [];
  const windowEnd = now + UPCOMING_WINDOW_MS;
  const liveStart = now - LIVE_WINDOW_MS;
  const candidates = [];
  for (const match of allMatches) {
    const kickoff = getMatchKickoffUTC(match);
    if (kickoff === null) continue;
    if (kickoff > windowEnd) continue;
    if (matchResults && matchResults[match.id]) continue;
    if (kickoff <= now) {
      // Already kicked off: show as live until a result is recorded,
      // but not beyond the live window.
      if (kickoff <= liveStart) continue;
      candidates.push({ match: { ...match, isLive: true }, kickoff });
    } else {
      candidates.push({ match, kickoff });
    }
  }
  candidates.sort((a, b) => a.kickoff - b.kickoff);
  return candidates.map(({ match }) => match);
}
