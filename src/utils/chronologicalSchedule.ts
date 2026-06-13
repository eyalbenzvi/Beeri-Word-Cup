// Chronological view of the full tournament schedule: all 104 matches in
// kickoff order, grouped by the VIEWER's calendar day. Used by the Results
// page "סדר כרונולוגי" view mode.
//
// Grouping follows the viewer's timezone (auto-detected) so a match's day
// header always agrees with the localized kickoff time shown on its card. For
// users physically in Israel this is identical to the previous Israel-day
// grouping (see the tz invariant in userTime.ts).
import { ALL_MATCHES } from "../data/matches";
import { getMatchKickoffUTC, getMatchIsraelDateKey } from "./matchTime";
import {
  getMatchDateKey,
  formatMatchDateNumeric,
  getUserTimeZone,
} from "./userTime";

const WEEKDAY_LABELS = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "שבת",
];

// Some knockout rows lack a kickoff time; fall back to day-midday so they
// still sort onto the right calendar day, with FIFA number as tiebreak.
export function getMatchSortTime(match) {
  const kickoff = getMatchKickoffUTC(match);
  if (kickoff !== null) return kickoff;
  const dateKey = getMatchIsraelDateKey(match);
  return dateKey ? Date.parse(`${dateKey}T12:00:00Z`) : Number.MAX_SAFE_INTEGER;
}

export function buildChronologicalDays(matches, tz: string = getUserTimeZone()) {
  const sorted = [...matches].sort(
    (a, b) =>
      getMatchSortTime(a) - getMatchSortTime(b) || a.fifaMatch - b.fifaMatch
  );
  const days = [];
  for (const match of sorted) {
    const key = getMatchDateKey(match, tz);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.matches.push(match);
    } else {
      // Weekday derives from the YYYY-MM-DD key via UTC midnight, so it's
      // independent of the host process timezone yet matches the grouped day.
      const weekday = WEEKDAY_LABELS[new Date(`${key}T00:00:00Z`).getUTCDay()];
      days.push({
        key,
        label: `${weekday} · ${formatMatchDateNumeric(match, tz)}`,
        matches: [match],
      });
    }
  }
  return days;
}

// Static schedule — computed once at module load in the viewer's timezone.
export const CHRONOLOGICAL_DAYS = buildChronologicalDays(ALL_MATCHES);
