// Utilities for parsing match dates/times (stored as Israel local time)
// and converting them to UTC timestamps for comparison with Date.now().
//
// Match schedule format:
//   date: "Jun 14"  // English month abbrev + day in Israel calendar
//   time: "22:00"   // 24-hour Israel local time
//
// All June/July 2026 match times are IDT (UTC+3). No DST transitions fall
// inside the tournament window, so a fixed offset is safe.

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const ISRAEL_OFFSET_HOURS = 3; // IDT during June-July
const TOURNAMENT_YEAR = 2026;

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Parse a match schedule date/time into a UTC millisecond timestamp.
 * Returns null if the match lacks date/time (e.g. placeholder knockout rows).
 */
export function getMatchKickoffUTC(match) {
  if (!match || !match.date || !match.time) return null;
  const parts = match.date.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const monthIdx = MONTHS[parts[0]];
  if (monthIdx === undefined) return null;
  const day = parseInt(parts[1], 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;

  const timeParts = match.time.trim().split(":");
  if (timeParts.length !== 2) return null;
  const hour = parseInt(timeParts[0], 10);
  const minute = parseInt(timeParts[1], 10);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  // Construct UTC timestamp by subtracting the Israel offset.
  return Date.UTC(TOURNAMENT_YEAR, monthIdx, day, hour - ISRAEL_OFFSET_HOURS, minute, 0, 0);
}

/**
 * Build an Israel-calendar date key for a match, e.g. "2026-06-14".
 * Used for grouping matches that fall on the same Israel day regardless
 * of whether the UTC timestamp crosses midnight.
 */
export function getMatchIsraelDateKey(match) {
  if (!match || !match.date) return null;
  const parts = match.date.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const monthIdx = MONTHS[parts[0]];
  if (monthIdx === undefined) return null;
  const day = parseInt(parts[1], 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return `${TOURNAMENT_YEAR}-${pad2(monthIdx + 1)}-${pad2(day)}`;
}

/**
 * Human-readable Israel date label from a match (Hebrew-friendly numeric form).
 * Example: { date: "Jun 14" } -> "14.6"
 */
export function formatIsraelDateLabel(match) {
  if (!match || !match.date) return "";
  const parts = match.date.trim().split(/\s+/);
  if (parts.length !== 2) return "";
  const monthIdx = MONTHS[parts[0]];
  if (monthIdx === undefined) return "";
  const day = parseInt(parts[1], 10);
  if (!Number.isFinite(day)) return "";
  return `${day}.${monthIdx + 1}`;
}
