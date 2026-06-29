// Regression tests for the "נקודות עליה" (advancing points) breakdown in the
// leaderboard form-detail view.
//
// Problem fixed: the old chips showed only the round total (e.g. "שלב ה-32:
// +54"), so a user couldn't tell that 54 = 27 correctly-predicted teams × 2
// points each. The block now renders, per round, the team COUNT and the
// per-team rate alongside the total, plus a header summary of total teams +
// total points.
//
// The team count is recovered by dividing the round total by a fixed per-team
// rate (ADVANCING_PTS_PER_TEAM), which is derived from POINTS so it can't drift
// from the scoring rules.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== ADVANCING POINTS BREAKDOWN TESTS ===\n");

const lb = readMigratedSrc("src/pages/Leaderboard.jsx");

// ---- Per-team rate is derived from POINTS (no hardcoded drift) ----
assert(/import \{ POINTS \} from "\.\.\/utils\/scoring"/.test(lb),
  "Leaderboard imports POINTS so the per-team rate stays tied to the rules table");
assert(/const ADVANCING_PTS_PER_TEAM[\s\S]*?R32: POINTS\.group\.advancing/.test(lb),
  "R32 advancing pick is valued at the group-stage rate (derived, not literal 2)");
assert(/R16: POINTS\.R32\.advancing/.test(lb),
  "R16 pick valued at the R32 rate");
assert(/F: POINTS\.SF\.advancing/.test(lb),
  "F pick valued at the SF rate");

// ---- Team count recovered from the round total via the per-team rate ----
assert(/ADVANCING_PTS_PER_TEAM\[round\]/.test(lb),
  "the display looks up the per-team rate per round");
assert(/Math\.round\(pts \/ perTeam\)/.test(lb),
  "team count = round total / per-team rate (so 54/2 = 27 teams)");
// Guard the division so a future zero rate can't produce Infinity/NaN.
assert(/perTeam \? Math\.round\(pts \/ perTeam\) : 0/.test(lb),
  "division is guarded against a zero per-team rate");

// ---- Per-round row shows count, the multiplication, and the total ----
assert(/קבוצה.*קבוצות|קבוצות[\s\S]*?קבוצה/.test(lb),
  "rows label the team count with singular/plural (קבוצה / קבוצות)");
assert(/r\.count === 1 \? "קבוצה" : "קבוצות"/.test(lb),
  "singular 'קבוצה' for exactly one team, plural otherwise");
assert(/<bdi>\{r\.perTeam\}<\/bdi> נק׳/.test(lb),
  "the per-team points rate is shown next to the count (the × multiplier)");
assert(/<bdi>\+\{r\.pts\}<\/bdi>/.test(lb),
  "the round total is still shown (+pts) as a badge");

// ---- Header summary: total teams + total points ----
assert(/const totalTeams = rows\.reduce/.test(lb),
  "a total team count across rounds is computed for the header");
assert(/const totalPts = rows\.reduce/.test(lb),
  "a total points sum across rounds is computed for the header");
assert(/ניחוש נכון.*ניחושים נכונים|ניחושים נכונים[\s\S]*?ניחוש נכון/.test(lb),
  "header summary pluralises the correct-guess count (ניחוש נכון / ניחושים נכונים)");

// ---- Numbers stay bidi-safe inside the RTL block ----
assert(/<bdi>\{r\.count\}<\/bdi>/.test(lb),
  "the team count is wrapped in <bdi> so the digit stays intact in RTL");
assert(/tabular-nums/.test(lb),
  "the points badge uses tabular-nums so totals line up");

// ---- Overflow / small-screen resilience ----
// The label+count cluster is allowed to wrap and the badge never shrinks away.
assert(/flex flex-wrap items-baseline[\s\S]*?min-w-0/.test(lb),
  "label+count cluster can wrap (flex-wrap) and shrink (min-w-0) on narrow screens");
assert(/badge-duo badge-duo-primary shrink-0/.test(lb),
  "the +pts badge is shrink-0 so it stays readable when the row is tight");

// ---- The old total-only chip phrasing is gone ----
assert(!/\{label\}: <bdi>\+\{pts\}<\/bdi>/.test(lb),
  "the old 'label: +pts' total-only chip markup is removed");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
