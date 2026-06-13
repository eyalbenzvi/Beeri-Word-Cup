// Tests for the Results tab chronological view mode ("סדר כרונולוגי").
//
// Feature: the Results page has a view-mode toggle. The default keeps the
// stage/group navigation; the chronological mode lists all 104 matches in
// kickoff order, grouped by Israel calendar day with day headers.
//
// Two layers:
//   1. Runtime — buildChronologicalDays/CHRONOLOGICAL_DAYS ordering invariants.
//   2. Static  — Results.tsx wires the toggle and both render branches.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import {
  CHRONOLOGICAL_DAYS,
  buildChronologicalDays,
  getMatchSortTime,
} from "../../src/utils/chronologicalSchedule.js";
import { ALL_MATCHES, groupMatches } from "../../src/data/matches.js";
import { getMatchIsraelDateKey } from "../../src/utils/matchTime.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== RESULTS CHRONOLOGICAL VIEW TESTS ===\n");

// ---- 1. Runtime: schedule invariants ----
console.log("--- 1. Schedule invariants ---");

// buildChronologicalDays is now timezone-parameterized (grouping follows the
// viewer's calendar day). The canonical invariants below describe Israel-day
// grouping — what a viewer in Israel sees — so they pin an EXPLICIT tz and are
// deterministic regardless of the CI host timezone (which is UTC). A separate
// block exercises a different timezone.
const ilDays = buildChronologicalDays(ALL_MATCHES, "Asia/Jerusalem");

// CHRONOLOGICAL_DAYS (the static export, in the device timezone) must remain a
// well-formed schedule: coverage + non-decreasing kickoff order are
// timezone-agnostic so they hold in any host timezone.
const staticFlat = CHRONOLOGICAL_DAYS.flatMap((d) => d.matches);
assert(
  staticFlat.length === ALL_MATCHES.length,
  `static schedule covers all matches (got ${staticFlat.length}, want ${ALL_MATCHES.length})`,
);

const flat = ilDays.flatMap((d) => d.matches);
assert(
  flat.length === ALL_MATCHES.length,
  `chronological view covers all matches (got ${flat.length}, want ${ALL_MATCHES.length})`,
);
assert(
  new Set(flat.map((m) => m.id)).size === ALL_MATCHES.length,
  "no match appears twice",
);

// Kickoff order is non-decreasing across the whole flattened list.
let ordered = true;
for (let i = 1; i < flat.length; i++) {
  if (getMatchSortTime(flat[i]) < getMatchSortTime(flat[i - 1])) {
    ordered = false;
    console.error(`  out of order: ${flat[i - 1].id} -> ${flat[i].id}`);
  }
}
assert(ordered, "matches sorted by kickoff time (non-decreasing)");

// The grouping must follow Israel calendar days, not raw UTC dates: match 8
// (Jun 13 22:00 Israel) kicks off before matches 5-7 (Jun 14) even though
// its UTC timestamp is already Jun 13 19:00.
const m8 = groupMatches.find((m) => m.fifaMatch === 8);
const m7 = groupMatches.find((m) => m.fifaMatch === 7);
assert(
  flat.indexOf(m8) < flat.indexOf(m7),
  "fifaMatch 8 (Jun 13 22:00) sorts before fifaMatch 7 (Jun 14 01:00) — kickoff order, not FIFA number order",
);

// Every match sits inside the day bucket matching its own Israel date key,
// and day keys are unique + ascending.
let bucketsConsistent = true;
for (const day of ilDays) {
  for (const match of day.matches) {
    if (getMatchIsraelDateKey(match) !== day.key) bucketsConsistent = false;
  }
}
assert(bucketsConsistent, "every match is bucketed under its own Israel date key");

const keys = ilDays.map((d) => d.key);
assert(new Set(keys).size === keys.length, "day keys are unique (no split days)");
assert(
  keys.every((k, i) => i === 0 || k > keys[i - 1]),
  "day keys ascend chronologically",
);

// First day is opening night (Jun 11), last is the final (Jul 19).
assert(keys[0] === "2026-06-11", `first day is 2026-06-11 (got ${keys[0]})`);
assert(
  keys[keys.length - 1] === "2026-07-19",
  `last day is 2026-07-19 (got ${keys[keys.length - 1]})`,
);

// Day labels carry a Hebrew weekday + numeric date.
assert(
  ilDays.every((d) => /^(יום [א-ת]+|שבת) · \d+\.\d+$/.test(d.label)),
  "day labels are 'weekday · d.m' formatted",
);
// 2026-06-13 is a Saturday — labelled "שבת", not "יום שבת".
const sat = ilDays.find((d) => d.key === "2026-06-13");
assert(sat && sat.label.startsWith("שבת"), "Saturday labelled שבת");

// buildChronologicalDays is a pure function of its (matches, tz) input.
assert(
  buildChronologicalDays(ALL_MATCHES, "Asia/Jerusalem").length === ilDays.length,
  "buildChronologicalDays reproduces the Israel schedule",
);

// ---- 1b. Grouping follows the VIEWER's timezone ----
console.log("--- 1b. Timezone-dependent grouping ---");
{
  // A viewer far east sees early-Israel matches shift to the next calendar
  // day. The opener (Jun 11 22:00 Israel = Jun 12 04:00 Tokyo) buckets on
  // Jun 12 for a Tokyo viewer.
  const tokyoDays = buildChronologicalDays(ALL_MATCHES, "Asia/Tokyo");
  const opener = groupMatches.find((m) => m.fifaMatch === 1);
  const tokyoOpenerDay = tokyoDays.find((d) => d.matches.includes(opener));
  assert(
    tokyoOpenerDay && tokyoOpenerDay.key === "2026-06-12",
    `opener buckets on Jun 12 for a Tokyo viewer (got ${tokyoOpenerDay && tokyoOpenerDay.key})`,
  );
  // The grouping genuinely differs from Israel grouping.
  assert(
    tokyoDays[0].key !== ilDays[0].key,
    "Tokyo first-day key differs from Israel first-day key",
  );
  // Still covers every match exactly once.
  const tokyoFlat = tokyoDays.flatMap((d) => d.matches);
  assert(
    tokyoFlat.length === ALL_MATCHES.length &&
      new Set(tokyoFlat.map((m) => m.id)).size === ALL_MATCHES.length,
    "Tokyo grouping still covers all matches once",
  );
}

// ---- 2. Static: Results page wiring ----
console.log("--- 2. Results page wiring ---");

const results = readMigratedSrc("src/pages/Results.jsx");

assert(
  /CHRONOLOGICAL_DAYS/.test(results) && /chronologicalSchedule/.test(results),
  "Results imports the chronological schedule util",
);
assert(/סדר כרונולוגי/.test(results), "toggle offers 'סדר כרונולוגי'");
assert(/לפי שלבים/.test(results), "toggle offers 'לפי שלבים'");
assert(
  /aria-pressed=\{viewMode === "stages"\}/.test(results) &&
    /aria-pressed=\{viewMode === "chronological"\}/.test(results),
  "both toggle buttons expose aria-pressed state",
);
assert(
  /viewMode === "stages" \? \(/.test(results),
  "stage navigation renders only in stages mode",
);
assert(
  /useState\("stages"\)/.test(results),
  "stages view is the default mode",
);
// Chronological cards drop the per-card date (day header has it) and show
// stage context instead of the raw knockout label.
assert(
  /getStageContextLabel/.test(results) && /בית \$\{match\.group\}/.test(results),
  "chronological cards show stage context (בית X / stage name)",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
