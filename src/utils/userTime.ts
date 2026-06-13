// Localized match time/date display, anchored to the absolute kickoff instant
// (getMatchKickoffUTC) and rendered in the VIEWER's own timezone.
//
// Why this exists: the schedule in data/matches.ts stores every kickoff as
// Israel local time ("Jun 14" / "22:00"). getMatchKickoffUTC turns that into a
// timezone-independent UTC instant. From that instant we render the clock and
// calendar date in ANY timezone via Intl. The viewer's timezone is
// auto-detected from the device — there is no manual override.
//
// Core invariant (locked by tests): for tz === "Asia/Jerusalem" every helper
// here reproduces the legacy Israel-anchored helpers in matchTime.ts EXACTLY,
// so switching to localized display is a no-op for users physically in Israel.
//
// Fallback discipline: a match with no resolvable kickoff instant (date+time
// don't parse — defensive, every shipped match currently has both) is rendered
// from its raw schedule strings, so nothing crashes for a future placeholder
// row.

import {
  getMatchKickoffUTC,
  getMatchIsraelDateKey,
  formatIsraelDateLabel,
} from "./matchTime";

export const FALLBACK_TZ = "Asia/Jerusalem";

// The device timezone is stable for the lifetime of the session; resolving it
// constructs an Intl.DateTimeFormat, so cache it — these helpers run per match
// card across the Predict / Results / Upcoming lists.
let cachedTz: string | null = null;

/** Auto-detected IANA timezone of the device, e.g. "Asia/Jerusalem". */
export function getUserTimeZone(): string {
  if (cachedTz) return cachedTz;
  try {
    cachedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ;
  } catch {
    cachedTz = FALLBACK_TZ;
  }
  return cachedTz;
}

/** True when the viewer's clock is Israel time (display is identical to legacy). */
export function isIsraelTimeZone(tz: string = getUserTimeZone()): boolean {
  return tz === FALLBACK_TZ;
}

// One formatter cache keyed by `${tz}|${kind}`. Intl.DateTimeFormat
// construction is comparatively expensive, so each (timezone, format) pair is
// built lazily once and reused.
const NUMERIC_PARTS_OPTS: Intl.DateTimeFormatOptions = {
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};
const SHORT_DATE_OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const LONG_DATE_HE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function cachedFormatter(
  tz: string,
  kind: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${tz}|${kind}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { timeZone: tz, ...options });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

// Extract numeric date/time fields for an instant in a timezone. Returns null
// if any expected part is missing/non-numeric, so callers fall back to raw
// schedule strings rather than rendering "NaN".
function partsAt(ms: number, tz: string): DateParts | null {
  const parts = cachedFormatter(tz, "parts", "en-US", NUMERIC_PARTS_OPTS).formatToParts(
    new Date(ms),
  );
  const pick = (type: string) => {
    const p = parts.find((x) => x.type === type);
    return p ? parseInt(p.value, 10) : NaN;
  };
  const result = {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  };
  for (const v of Object.values(result)) {
    if (!Number.isFinite(v)) return null;
  }
  return result;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Resolve the localized parts for a match, or null when it has no usable
// kickoff instant (callers then fall back to the raw schedule strings).
function matchParts(match, tz: string): DateParts | null {
  const ms = getMatchKickoffUTC(match);
  if (ms == null) return null;
  return partsAt(ms, tz);
}

/**
 * "22:00" (24-hour) clock for a match, in the viewer's timezone.
 * Falls back to the raw schedule string when the match has no kickoff instant.
 */
export function formatMatchClock(match, tz: string = getUserTimeZone()): string {
  const p = matchParts(match, tz);
  if (!p) return match?.time || "";
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "22:00" clock for an arbitrary instant, in the viewer's timezone. */
export function formatClockFromMs(ms: number, tz: string = getUserTimeZone()): string {
  const p = partsAt(ms, tz);
  if (!p) return "";
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * "2026-06-14" calendar-day key for a match, in the viewer's timezone.
 * Generalises getMatchIsraelDateKey — used for day grouping + "today" tests.
 */
export function getMatchDateKey(match, tz: string = getUserTimeZone()): string | null {
  const p = matchParts(match, tz);
  if (!p) return getMatchIsraelDateKey(match);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * "2026-06-14" calendar-day key for an arbitrary instant, in the viewer's
 * timezone. Generalises israelDateKeyForNow.
 */
export function dateKeyForNow(nowMs: number, tz: string = getUserTimeZone()): string {
  const p = partsAt(nowMs, tz);
  if (!p) return "";
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * Hebrew-friendly numeric date "14.6" for a match, in the viewer's timezone.
 * Generalises formatIsraelDateLabel.
 */
export function formatMatchDateNumeric(match, tz: string = getUserTimeZone()): string {
  const p = matchParts(match, tz);
  if (!p) return formatIsraelDateLabel(match);
  return `${p.day}.${p.month}`;
}

/**
 * English "Jun 14"-style short date — matches the raw schedule format used in
 * the MatchCard / Upcoming / Admin meta rows. Falls back to the raw string.
 */
export function formatMatchDateShort(match, tz: string = getUserTimeZone()): string {
  const ms = getMatchKickoffUTC(match);
  if (ms == null) return match?.date || "";
  return cachedFormatter(tz, "short", "en-US", SHORT_DATE_OPTS).format(new Date(ms));
}

/** Long Hebrew date "11 ביוני 2026" for an arbitrary instant (kickoff footer). */
export function formatLongDateHe(ms: number, tz: string = getUserTimeZone()): string {
  return cachedFormatter(tz, "longHe", "he-IL", LONG_DATE_HE_OPTS).format(new Date(ms));
}
