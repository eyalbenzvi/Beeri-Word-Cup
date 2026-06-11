// Chronological view of the full tournament schedule: all 104 matches in
// kickoff order, grouped by Israel calendar day. Used by the Results page
// "סדר כרונולוגי" view mode.
import { ALL_MATCHES } from "../data/matches";
import {
  getMatchKickoffUTC,
  getMatchIsraelDateKey,
  formatIsraelDateLabel,
} from "./matchTime";

const WEEKDAY_LABELS = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "שבת",
];

// Some knockout rows lack a kickoff time; fall back to Israel-day midday so
// they still sort onto the right calendar day, with FIFA number as tiebreak.
export function getMatchSortTime(match) {
  const kickoff = getMatchKickoffUTC(match);
  if (kickoff !== null) return kickoff;
  const dateKey = getMatchIsraelDateKey(match);
  return dateKey ? Date.parse(`${dateKey}T12:00:00Z`) : Number.MAX_SAFE_INTEGER;
}

export function buildChronologicalDays(matches) {
  const sorted = [...matches].sort(
    (a, b) =>
      getMatchSortTime(a) - getMatchSortTime(b) || a.fifaMatch - b.fifaMatch
  );
  const days = [];
  for (const match of sorted) {
    const key = getMatchIsraelDateKey(match);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.matches.push(match);
    } else {
      const weekday = WEEKDAY_LABELS[new Date(`${key}T00:00:00Z`).getUTCDay()];
      days.push({
        key,
        label: `${weekday} · ${formatIsraelDateLabel(match)}`,
        matches: [match],
      });
    }
  }
  return days;
}

// Static schedule — computed once at module load.
export const CHRONOLOGICAL_DAYS = buildChronologicalDays(ALL_MATCHES);
