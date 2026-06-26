// Unit tests for the admin Forms-table metric registry + pure derivations
// (src/utils/formMetrics.ts). Verifies the 19-metric catalogue, the three
// bracket-derived families the scored form doesn't expose (advancing-team
// counts per round, correct-matchup counts per stage, exact-position team
// counts per stage), the flat value mapping, and the sort with its
// deterministic tiebreak.

import {
  FORM_METRICS,
  FORM_METRIC_KEYS,
  FORM_METRIC_MAP,
  MAX_SELECTED_METRICS,
  ADVANCING_ROUNDS,
  EXACT_STAGES,
  EXACT_POS_STAGES,
  computeAdvancingCounts,
  computeMatchupHitsByStage,
  computeExactPositionTeamsByStage,
  computeFormMetricValues,
  sortFormMetricRows,
} from "/home/user/Beeri-World-Cup/src/utils/formMetrics.js";
import {
  calculateFullScore,
  POINTS,
} from "/home/user/Beeri-World-Cup/src/utils/scoring.js";

let passed = 0,
  failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else {
    failed++;
    failures.push(m);
    console.error("  FAIL: " + m);
  }
}
function eq(a, b, m) {
  assert(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

console.log("=== FORM METRICS (admin טפסים table) TESTS ===\n");

// --- 1. Registry shape ---
eq(FORM_METRICS.length, 19, "registry has all 19 metrics");
eq(MAX_SELECTED_METRICS, 3, "cap is 3 metrics");
eq(new Set(FORM_METRIC_KEYS).size, 19, "all metric keys are unique");
eq(
  FORM_METRICS.filter((m) => m.family === "general").length,
  4,
  "4 general metrics",
);
eq(
  FORM_METRICS.filter((m) => m.family === "advancing").length,
  5,
  "5 advancing (teams-per-stage) metrics",
);
eq(
  FORM_METRICS.filter((m) => m.family === "exact").length,
  6,
  "6 exact-matchup-per-stage metrics (incl. 3rd-place)",
);
eq(
  FORM_METRICS.filter((m) => m.family === "exactPos").length,
  4,
  "4 exact-position-team metrics (R32..SF, no final / 3rd)",
);
eq(FORM_METRIC_MAP.rank.dir, "asc", "rank sorts ascending (lower is better)");
assert(
  FORM_METRICS.filter((m) => m.key !== "rank").every((m) => m.dir === "desc"),
  "every non-rank metric sorts descending (more is better)",
);
// The six per-stage exact metrics must cover exactly the EXACT_STAGES set.
assert(
  EXACT_STAGES.length === 6 &&
    ["R32", "R16", "QF", "SF", "F", "3RD"].every((s) => EXACT_STAGES.includes(s)),
  "EXACT_STAGES covers the five knockout rounds + 3RD",
);
assert(
  ADVANCING_ROUNDS.length === 5 &&
    ["R32", "R16", "QF", "SF", "F"].every((r) => ADVANCING_ROUNDS.includes(r)),
  "ADVANCING_ROUNDS covers R32..F",
);
// The exact-position family deliberately stops at SF (no F / 3RD).
assert(
  EXACT_POS_STAGES.length === 4 &&
    ["R32", "R16", "QF", "SF"].every((s) => EXACT_POS_STAGES.includes(s)) &&
    !EXACT_POS_STAGES.includes("F") &&
    !EXACT_POS_STAGES.includes("3RD"),
  "EXACT_POS_STAGES = R32..SF only (final + 3rd excluded)",
);

// --- 2. computeAdvancingCounts: intersection of predicted vs actual ---
{
  const pred = {
    R32: ["BRA", "ARG", "FRA", "GER"],
    R16: ["BRA", "ARG"],
    QF: ["BRA"],
    SF: ["BRA"],
    F: ["BRA"],
  };
  const actual = {
    R32: ["BRA", "ARG", "ESP"], // BRA, ARG correct (FRA/GER wrong)
    R16: ["BRA", "ESP"], // BRA correct
    QF: [], // not determined yet → 0 for everyone
    SF: ["ESP"], // BRA wrong
    F: ["BRA"], // BRA correct
  };
  const c = computeAdvancingCounts(pred, actual);
  eq(c.R32, 2, "R32 advancing count = correct intersections");
  eq(c.R16, 1, "R16 advancing count");
  eq(c.QF, 0, "QF count is 0 when no actual advancers are determined");
  eq(c.SF, 0, "SF count when prediction misses");
  eq(c.F, 1, "F advancing count");
}
// Missing/empty inputs never throw and yield zeros.
{
  const c = computeAdvancingCounts(null, null);
  assert(
    ADVANCING_ROUNDS.every((r) => c[r] === 0),
    "null inputs → all-zero advancing counts",
  );
}
// Duplicate predicted team is not double-counted beyond actual membership.
{
  const c = computeAdvancingCounts(
    { R32: ["BRA", "BRA"] },
    { R32: ["BRA"] },
  );
  eq(c.R32, 2, "predicted duplicates each count if actual contains them (set membership)");
}

// --- 3. computeMatchupHitsByStage: correct team-identity per knockout match ---
// "משחק מדויק" = the form predicted the right two teams (ordered home/away,
// same test the Stats/Results panels use), counted only for determined slots.
{
  const actualBracket = {
    "R32-1": { home: "A", away: "B" }, // determined
    "R32-2": { home: "C", away: "D" }, // determined
    "R32-3": { home: "E", away: null }, // NOT determined (away missing)
    "R32-4": { home: "G", away: "H" }, // determined, but form has no pred
    "R16-1": { home: "A", away: "C" },
    "QF-1": { home: null, away: null }, // not determined
    "F-1": { home: "A", away: "Z" },
    "3RD-1": { home: "M", away: "N" },
  };
  const predBracket = {
    "R32-1": { home: "A", away: "B" }, // exact ✓
    "R32-2": { home: "D", away: "C" }, // swapped → ordered test fails ✗
    "R32-3": { home: "E", away: "F" }, // actual undetermined → not counted
    "R16-1": { home: "A", away: "C" }, // ✓
    "F-1": { home: "A", away: "Z" }, // ✓
    "3RD-1": { home: "M", away: "X" }, // away wrong ✗
  };
  const m = computeMatchupHitsByStage(predBracket, actualBracket);
  eq(m.R32, 1, "R32: only the exactly-matched pairing counts");
  eq(m.R16, 1, "R16 matchup hit");
  eq(m.QF, 0, "QF undetermined → 0");
  eq(m.SF, 0, "SF absent → 0");
  eq(m.F, 1, "final matchup hit");
  eq(m["3RD"], 0, "3rd-place: wrong away team → no hit");
  assert(!("group" in m), "no group bucket in the per-stage matchup map");
}
// Swapped home/away does NOT count (ordered comparison, mirrors scoring).
{
  const m = computeMatchupHitsByStage(
    { "R32-1": { home: "B", away: "A" } },
    { "R32-1": { home: "A", away: "B" } },
  );
  eq(m.R32, 0, "swapped pairing is not a matchup hit (ordered slots)");
}
assert(
  EXACT_STAGES.every((s) => computeMatchupHitsByStage(null, null)[s] === 0),
  "null brackets → all-zero matchup buckets",
);
assert(
  EXACT_STAGES.every((s) => computeMatchupHitsByStage({}, undefined)[s] === 0),
  "undefined actual bracket → all-zero matchup buckets",
);

// --- 3b. computeExactPositionTeamsByStage: teams in the correct bracket slot ---
// "קבוצה מדויקת" = the form placed the team in the SAME slot (match + side).
// Slot-level: a fully-correct match contributes 2, a half-correct match 1.
{
  const actualBracket = {
    "R32-1": { home: "A", away: "B" }, // both determined
    "R32-2": { home: "C", away: "D" },
    "R32-3": { home: "E", away: null }, // away not determined
    "R16-1": { home: "A", away: "C" },
    "QF-1": { home: "A", away: "C" },
    "SF-1": { home: "A", away: "C" },
    "F-1": { home: "A", away: "C" }, // final excluded from this family
    "3RD-1": { home: "X", away: "Y" }, // 3rd excluded
  };
  const predBracket = {
    "R32-1": { home: "A", away: "B" }, // both correct → +2
    "R32-2": { home: "C", away: "Z" }, // home correct only → +1
    "R32-3": { home: "E", away: "Q" }, // home correct (+1); away undetermined
    "R16-1": { home: "Q", away: "C" }, // away correct only → +1
    "QF-1": { home: "A", away: "C" }, // both → +2
    "SF-1": { home: "Z", away: "Z" }, // none → 0
    "F-1": { home: "A", away: "C" }, // ignored (not in family)
    "3RD-1": { home: "X", away: "Y" }, // ignored
  };
  const p = computeExactPositionTeamsByStage(predBracket, actualBracket);
  eq(p.R32, 4, "R32 exact-position teams: 2 + 1 + 1 across the three matches");
  eq(p.R16, 1, "R16 exact-position teams: away slot only");
  eq(p.QF, 2, "QF exact-position teams: both slots");
  eq(p.SF, 0, "SF exact-position teams: none correct");
  assert(!("F" in p), "final is not part of the exact-position family");
  assert(!("3RD" in p), "3rd-place is not part of the exact-position family");
}
// Swapped home/away counts ZERO exact positions (each team in the wrong slot).
{
  const p = computeExactPositionTeamsByStage(
    { "R32-1": { home: "B", away: "A" } },
    { "R32-1": { home: "A", away: "B" } },
  );
  eq(p.R32, 0, "swapped sides → no team is in its exact slot");
}
assert(
  EXACT_POS_STAGES.every((s) => computeExactPositionTeamsByStage(null, null)[s] === 0),
  "null brackets → all-zero exact-position buckets",
);

// --- 4. computeFormMetricValues flattening ---
{
  const values = computeFormMetricValues(
    { rank: 7, totalPoints: 123, exactScoreCount: 9, outcomeCount: 20 },
    { R32: 8, R16: 4, QF: 2, SF: 1, F: 1 },
    { R32: 3, R16: 2, QF: 1, SF: 0, F: 1, "3RD": 0 },
    { R32: 6, R16: 3, QF: 1, SF: 0 },
  );
  eq(values.rank, 7, "rank value");
  eq(values.points, 123, "points value");
  eq(values.exactTotal, 9, "exactTotal value");
  eq(values.outcomeTotal, 20, "outcomeTotal value");
  eq(values.teamsR32, 8, "teamsR32 value");
  eq(values.teamsF, 1, "teamsF value");
  eq(values.exactR16, 2, "exactR16 value");
  eq(values.exact3RD, 0, "exact3RD value");
  eq(values.posR32, 6, "posR32 value");
  eq(values.posR16, 3, "posR16 value");
  eq(values.posSF, 0, "posSF value");
  // Every registry key must resolve to a number (no undefined columns).
  assert(
    FORM_METRIC_KEYS.every((k) => typeof values[k] === "number"),
    "every registry key produces a numeric value",
  );
}

// --- 5. sortFormMetricRows: direction + deterministic tiebreak ---
{
  const rows = [
    { formId: "b", rank: 2, values: { points: 10 } },
    { formId: "a", rank: 1, values: { points: 10 } }, // tie on points → rank wins
    { formId: "c", rank: 3, values: { points: 25 } },
  ];
  const desc = sortFormMetricRows(rows, "points", "desc");
  eq(desc[0].formId, "c", "desc: highest points first");
  eq(desc[1].formId, "a", "tie broken by official rank (a rank1 before b rank2)");
  eq(desc[2].formId, "b", "tie: lower rank ahead");

  const asc = sortFormMetricRows(rows, "points", "asc");
  eq(asc[0].formId, "a", "asc: lowest points first, tie by rank");
  eq(asc[2].formId, "c", "asc: highest points last");

  // Pure: input array is not mutated.
  eq(rows[0].formId, "b", "sort does not mutate the input array");
}
// Identical metric AND rank → stable formId tiebreak.
{
  const rows = [
    { formId: "z", rank: 5, values: { v: 1 } },
    { formId: "a", rank: 5, values: { v: 1 } },
  ];
  const out = sortFormMetricRows(rows, "v", "desc");
  eq(out[0].formId, "a", "final tiebreak is formId asc");
}

// --- 6. Cross-check vs the real scoring engine ---
// Lock the "count vs points" relationship: the advancing COUNT this table
// shows, multiplied by the per-stage advancing point value the scorer uses,
// must equal the advancingPoints calculateFullScore produces from the SAME
// predicted/actual advancing sets. If POINTS or the scoring loop ever change,
// this fails instead of the table silently drifting from the leaderboard.
{
  const predAdvancing = {
    R32: ["A", "B", "C"],
    R16: ["A", "B"],
    QF: ["A"],
    SF: ["A"],
    F: ["A"],
  };
  const actualAdvancing = {
    R32: ["A", "B", "X"], // 2 correct
    R16: ["A", "Y"], // 1 correct
    QF: ["A"], // 1 correct
    SF: ["Z"], // 0 correct
    F: ["A"], // 1 correct
  };
  // Round → the stage whose `advancing` value scores it (mirrors scoring.ts).
  const PARENT = { R32: "group", R16: "R32", QF: "R16", SF: "QF", F: "SF" };

  const counts = computeAdvancingCounts(predAdvancing, actualAdvancing);
  const score = calculateFullScore(
    { advancing: predAdvancing },
    {}, // no match results — isolate the advancing contribution
    actualAdvancing,
    { champion: null, topScorers: [] },
    {},
    {},
  );

  for (const round of ADVANCING_ROUNDS) {
    const value = POINTS[PARENT[round]].advancing;
    eq(
      counts[round] * value,
      score.advancingPoints[round] || 0,
      `${round}: count×${value} matches scoring advancingPoints`,
    );
  }
  // Sanity: the fixture actually exercises non-zero and zero rounds.
  eq(counts.R32, 2, "cross-check fixture: R32 count");
  eq(counts.SF, 0, "cross-check fixture: SF count (miss)");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
