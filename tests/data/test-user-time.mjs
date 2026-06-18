// Tests for src/utils/userTime.ts — localized match time/date display.
//
// The schedule stores Israel-local strings; getMatchKickoffUTC turns them into
// an absolute UTC instant; userTime renders that instant in the VIEWER's
// timezone. These tests pin two things:
//   1. The Israel invariant — for tz "Asia/Jerusalem" every helper reproduces
//      the legacy Israel-anchored matchTime helpers EXACTLY (so the feature is
//      a no-op for users in Israel).
//   2. Correct localization for other timezones, including date-line crossing.
//
// All assertions pass an EXPLICIT tz so they're deterministic regardless of the
// host process timezone (CI runs in UTC).

import {
  getUserTimeZone,
  isIsraelTimeZone,
  formatMatchClock,
  formatClockFromMs,
  getMatchDateKey,
  dateKeyForNow,
  formatMatchDateNumeric,
  formatMatchDateShort,
  formatLongDateHe,
} from "/home/user/Beeri-World-Cup/src/utils/userTime.js";
import {
  getMatchKickoffUTC,
  getMatchIsraelDateKey,
  formatIsraelDateLabel,
} from "/home/user/Beeri-World-Cup/src/utils/matchTime.js";
import { ALL_MATCHES } from "/home/user/Beeri-World-Cup/src/data/matches.js";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const IL = "Asia/Jerusalem";
const NY = "America/New_York";
const TOKYO = "Asia/Tokyo";
const HONOLULU = "Pacific/Honolulu";

console.log("=== USER TIME (localized display) TESTS ===\n");

// ---- 1. Israel invariant: identical to legacy helpers for EVERY match ----
console.log("--- 1. Israel invariant across all 104 matches ---");
{
  let clockOk = true, shortOk = true, numericOk = true, keyOk = true;
  for (const m of ALL_MATCHES) {
    if (m.time && formatMatchClock(m, IL) !== m.time) {
      clockOk = false;
      console.error(`  clock ${m.id}: ${formatMatchClock(m, IL)} !== ${m.time}`);
    }
    if (m.date && formatMatchDateShort(m, IL) !== m.date) {
      shortOk = false;
      console.error(`  short ${m.id}: ${formatMatchDateShort(m, IL)} !== ${m.date}`);
    }
    if (formatMatchDateNumeric(m, IL) !== formatIsraelDateLabel(m)) {
      numericOk = false;
      console.error(`  numeric ${m.id}: ${formatMatchDateNumeric(m, IL)} !== ${formatIsraelDateLabel(m)}`);
    }
    if (getMatchDateKey(m, IL) !== getMatchIsraelDateKey(m)) {
      keyOk = false;
      console.error(`  key ${m.id}: ${getMatchDateKey(m, IL)} !== ${getMatchIsraelDateKey(m)}`);
    }
  }
  assert(clockOk, "formatMatchClock(IL) === match.time for all matches");
  assert(shortOk, "formatMatchDateShort(IL) === match.date for all matches");
  assert(numericOk, "formatMatchDateNumeric(IL) === formatIsraelDateLabel for all matches");
  assert(keyOk, "getMatchDateKey(IL) === getMatchIsraelDateKey for all matches");
}

// ---- 2. Localized clock for the opener (Jun 11 22:00 Israel = 19:00 UTC) ----
console.log("--- 2. Opener clock across timezones ---");
{
  const opener = { date: "Jun 11", time: "22:00" };
  assert(formatMatchClock(opener, IL) === "22:00", "opener IL 22:00");
  assert(formatMatchClock(opener, NY) === "15:00", `opener NY 15:00 (got ${formatMatchClock(opener, NY)})`);
  assert(formatMatchClock(opener, TOKYO) === "04:00", `opener Tokyo 04:00 (got ${formatMatchClock(opener, TOKYO)})`);
  assert(formatMatchClock(opener, HONOLULU) === "09:00", `opener Honolulu 09:00 (got ${formatMatchClock(opener, HONOLULU)})`);
}

// ---- 3. Date-line crossing: same instant, different calendar day ----
console.log("--- 3. Date-line crossing ---");
{
  const opener = { date: "Jun 11", time: "22:00" };
  assert(getMatchDateKey(opener, IL) === "2026-06-11", "opener day IL = Jun 11");
  assert(getMatchDateKey(opener, TOKYO) === "2026-06-12", `opener day Tokyo = Jun 12 (got ${getMatchDateKey(opener, TOKYO)})`);
  assert(getMatchDateKey(opener, NY) === "2026-06-11", "opener day NY = Jun 11");
  assert(formatMatchDateNumeric(opener, IL) === "11.6", "numeric IL = 11.6");
  assert(formatMatchDateNumeric(opener, TOKYO) === "12.6", `numeric Tokyo = 12.6 (got ${formatMatchDateNumeric(opener, TOKYO)})`);
  assert(formatMatchDateShort(opener, TOKYO) === "Jun 12", `short Tokyo = Jun 12 (got ${formatMatchDateShort(opener, TOKYO)})`);
}

// ---- 4. Midnight handling (h23 -> "00:00", never "24:00") ----
console.log("--- 4. Midnight clock ---");
{
  // Jul 1 00:00 Israel = Jun 30 21:00 UTC
  const midnight = { date: "Jul 1", time: "00:00" };
  assert(formatMatchClock(midnight, IL) === "00:00", `IL midnight = 00:00 (got ${formatMatchClock(midnight, IL)})`);
  assert(getMatchDateKey(midnight, IL) === "2026-07-01", "IL midnight day = Jul 1");
  // Half-hour kickoff preserved
  assert(formatMatchClock({ date: "Jun 28", time: "02:30" }, IL) === "02:30", "02:30 preserved");
}

// ---- 5. dateKeyForNow + formatClockFromMs for arbitrary instants ----
console.log("--- 5. Arbitrary-instant helpers ---");
{
  // 21:30 UTC = 00:30 next day in Israel
  const ms = Date.UTC(2026, 5, 12, 21, 30);
  assert(dateKeyForNow(ms, IL) === "2026-06-13", "21:30 UTC -> Jun 13 Israel");
  assert(dateKeyForNow(ms, "UTC") === "2026-06-12", "21:30 UTC -> Jun 12 UTC");
  assert(formatClockFromMs(ms, IL) === "00:30", `clockFromMs IL 00:30 (got ${formatClockFromMs(ms, IL)})`);
  assert(formatClockFromMs(ms, "UTC") === "21:30", "clockFromMs UTC 21:30");
}

// ---- 6. Fallback when a match has no parseable kickoff ----
console.log("--- 6. No-kickoff fallback ---");
{
  const noTime = { date: "Jun 28" }; // date but no time -> getMatchKickoffUTC null
  assert(getMatchKickoffUTC(noTime) === null, "precondition: no kickoff instant");
  assert(formatMatchClock(noTime, TOKYO) === "", "no-time clock falls back to empty");
  assert(formatMatchDateShort(noTime, TOKYO) === "Jun 28", "no-time short falls back to raw date");
  assert(getMatchDateKey(noTime, TOKYO) === "2026-06-28", "no-time key falls back to Israel key");
  assert(formatMatchDateNumeric(noTime, TOKYO) === "28.6", "no-time numeric falls back to Israel label");
  // Totally empty match degrades without throwing
  assert(formatMatchClock({}, TOKYO) === "", "empty match clock -> empty string");
  assert(getMatchDateKey({}, TOKYO) === null, "empty match key -> null");
}

// ---- 6b. No "NaN" leaks across timezones for any real match ----
console.log("--- 6b. No NaN in localized output ---");
{
  let clean = true;
  for (const m of ALL_MATCHES) {
    for (const tz of [IL, NY, TOKYO, HONOLULU, "UTC"]) {
      const clock = formatMatchClock(m, tz);
      const key = getMatchDateKey(m, tz);
      const numeric = formatMatchDateNumeric(m, tz);
      const short = formatMatchDateShort(m, tz);
      if ([clock, key, numeric, short].some((s) => typeof s === "string" && s.includes("NaN"))) {
        clean = false;
        console.error(`  NaN leak ${m.id} @ ${tz}: ${clock} | ${key} | ${numeric} | ${short}`);
      }
    }
  }
  assert(clean, "no NaN in clock/key/numeric/short for any match in any timezone");
}

// ---- 7. Long Hebrew kickoff date (footer) ----
console.log("--- 7. Long Hebrew date ---");
{
  const KICKOFF = Date.UTC(2026, 5, 11, 19, 0, 0); // Jun 11 22:00 Israel
  assert(formatLongDateHe(KICKOFF, IL) === "11 ביוני 2026", `IL long date (got ${formatLongDateHe(KICKOFF, IL)})`);
  assert(formatLongDateHe(KICKOFF, TOKYO) === "12 ביוני 2026", `Tokyo long date = 12 ביוני (got ${formatLongDateHe(KICKOFF, TOKYO)})`);
}

// ---- 8. getUserTimeZone / isIsraelTimeZone ----
console.log("--- 8. Timezone detection helpers ---");
{
  const tz = getUserTimeZone();
  assert(typeof tz === "string" && tz.length > 0, "getUserTimeZone returns a non-empty string");
  assert(isIsraelTimeZone("Asia/Jerusalem") === true, "isIsraelTimeZone true for Asia/Jerusalem");
  assert(isIsraelTimeZone("America/New_York") === false, "isIsraelTimeZone false for NY");

  // Regression (Sentry RangeError "Invalid time zone specified: Etc/Unknown"):
  // whatever getUserTimeZone returns must be usable as a `timeZone` option, so
  // every downstream Intl.DateTimeFormat construction in this module can never
  // throw — even on devices whose resolvedOptions() reports an unusable zone.
  let tzThrew = false;
  try { new Intl.DateTimeFormat("he-IL", { timeZone: tz }); } catch { tzThrew = true; }
  assert(!tzThrew, "getUserTimeZone() result is always a usable Intl timeZone (never Etc/Unknown)");
}

// ---- 9. Static wiring: display surfaces use userTime helpers ----
console.log("--- 9. Display surfaces import userTime ---");
{
  const surfaces = [
    ["src/components/MatchCard.jsx", /formatMatchClock|formatMatchDateShort/],
    ["src/components/UpcomingMatches.jsx", /formatMatchClock|formatMatchDateShort|formatMatchDateNumeric/],
    ["src/pages/Results.jsx", /formatMatchClock|formatMatchDateShort/],
    ["src/components/LiveNowCard.jsx", /formatMatchClock|getMatchDateKey|dateKeyForNow/],
    ["src/components/AdminResultsTab.jsx", /formatMatchClock|formatMatchDateShort/],
    // ScoreStrip dropped its userTime usage when its day-points strip moved to a
    // timezone-independent rolling 24h window (no tz/date-key bucketing). See
    // dailyPoints.computeWindowFormPoints.
    ["src/utils/exportFormExcel.js", /formatMatchClock|formatMatchDateShort/],
    ["src/components/KickoffFooter.jsx", /formatClockFromMs|formatLongDateHe/],
  ];
  for (const [path, pattern] of surfaces) {
    const src = readMigratedSrc(path);
    assert(pattern.test(src), `${path} uses userTime helper (${pattern})`);
    assert(/from ['"][^'"]*userTime['"]/.test(src), `${path} imports from userTime`);
  }
  // Regression: the raw "date · time" join is gone from display surfaces.
  const matchCard = readMigratedSrc("src/components/MatchCard.jsx");
  assert(!/\[match\.date, match\.time, match\.venue\]/.test(matchCard),
    "MatchCard no longer joins raw match.date/match.time");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
