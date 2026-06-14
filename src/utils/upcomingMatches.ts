import { getMatchKickoffUTC, israelHour, nextIsraelHourUTC } from "./matchTime";

// Window size for the home-page widget: matches kicking off in the next 24h.
export const UPCOMING_WINDOW_MS = 24 * 3600000;

// How long after kickoff a match without a recorded result keeps showing as
// "live". Covers 90' + extra time + penalties + delays with margin; also
// caps the degenerate case where a result is never entered (otherwise the
// match would stay on the home page forever).
export const LIVE_WINDOW_MS = 4 * 3600000;

// Estimated wall-clock duration from kickoff to the final whistle, used to
// anchor "4 hours from the match's END". Set to 2.5h so it covers a knockout
// that runs to extra time + penalties (90' + breaks + 30' ET + shootout ≈
// 2.5h) — over-estimating only makes a match linger slightly longer, whereas
// under-estimating would drop it BEFORE the promised 4h-after-end, which is
// the failure mode to avoid. A regular match just lingers ~45 min extra.
export const MATCH_DURATION_MS = 2.5 * 3600000;

// How long a FINISHED match (one with a recorded result) keeps showing on the
// home page, measured from its estimated end. The product rule: a match that
// ended stays visible for 4 hours so people coming back can still see the
// result and whether they scored — positioned above the upcoming matches.
export const FINISHED_WINDOW_MS = 4 * 3600000;

// Morning catch-up cutoff (Israel local hour). The primary audience is people
// waking up who missed overnight matches: a finished match must NEVER drop off
// before this hour. So if the plain 4h window would close before noon (i.e.
// while people are asleep or just waking), the match instead stays until noon.
// Daytime/evening matches whose window closes after noon are unaffected.
export const MORNING_CUTOFF_HOUR = 12;

/**
 * When a finished match should disappear from the home page.
 *
 * Base: estimated end (kickoff + MATCH_DURATION_MS) + FINISHED_WINDOW_MS.
 * Morning override: if that base falls before MORNING_CUTOFF_HOUR Israel time,
 * push it to that day's cutoff — so overnight results survive into the morning
 * for users who slept through them, rather than vanishing at 06:00-07:00.
 */
export function finishedExpiryUTC(kickoff) {
  const base = kickoff + MATCH_DURATION_MS + FINISHED_WINDOW_MS;
  if (israelHour(base) < MORNING_CUTOFF_HOUR) {
    return nextIsraelHourUTC(base, MORNING_CUTOFF_HOUR);
  }
  return base;
}

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

/**
 * Pure selector for the home-page "recently finished" widget.
 *
 * Returns matches that HAVE a recorded result and whose estimated end falls
 * within the last FINISHED_WINDOW_MS — i.e. they ended at most ~4 hours ago.
 * Each is returned as a shallow copy flagged `isFinished: true` with the
 * official `result` attached, sorted most-recent-first (latest kickoff first)
 * so the freshest result sits at the top.
 *
 * Disappearance is governed by finishedExpiryUTC: 4 hours from the estimated
 * end, but never before noon Israel time, so overnight results stay up for
 * morning-risers (the primary audience). The lower bound is simply kickoff, so
 * a result recorded at the final whistle moves the match straight from the
 * live card into this section with no gap. Source match objects are never
 * mutated.
 *
 * @param {Array} allMatches Array of match objects (from src/data/matches).
 * @param {Object} matchResults Map of matchId -> result (or null/undefined).
 * @param {number} now UTC millisecond timestamp to compare against.
 * @returns {Array} Finished matches to display, most-recent-first.
 */
export function selectRecentlyFinishedMatches(allMatches, matchResults, now) {
  if (!Array.isArray(allMatches) || !matchResults) return [];
  const candidates = [];
  for (const match of allMatches) {
    const result = matchResults[match.id];
    if (!result) continue;
    const kickoff = getMatchKickoffUTC(match);
    if (kickoff === null) continue;
    if (kickoff > now) continue; // not started yet (defensive)
    if (now > finishedExpiryUTC(kickoff)) continue; // window (incl. morning) closed
    candidates.push({ match: { ...match, isFinished: true, result }, kickoff });
  }
  candidates.sort((a, b) => b.kickoff - a.kickoff);
  return candidates.map(({ match }) => match);
}
