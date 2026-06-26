// Unit tests for the admin Forms-table metric registry + pure derivations
// (src/utils/formMetrics.ts). Verifies the 15-metric catalogue, the two
// derivations the scored form doesn't expose (advancing-team counts per round,
// exact-score hits per stage), the flat value mapping, and the sort with its
// deterministic tiebreak.

import {
  FORM_METRICS,
  FORM_METRIC_KEYS,
  FORM_METRIC_MAP,
  MAX_SELECTED_METRICS,
  ADVANCING_ROUNDS,
  EXACT_STAGES,
  computeAdvancingCounts,
  computeExactByStage,
  computeFormMetricValues,
  sortFormMetricRows,
} from "/home/user/Beeri-World-Cup/src/utils/formMetrics.js";

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
eq(FORM_METRICS.length, 15, "registry has all 15 metrics");
eq(MAX_SELECTED_METRICS, 3, "cap is 3 metrics");
eq(new Set(FORM_METRIC_KEYS).size, 15, "all metric keys are unique");
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
  "6 exact-per-stage metrics (incl. 3rd-place)",
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

// --- 3. computeExactByStage: bucket exact hits by stage ---
{
  const matchScores = {
    "GROUP-1": { exactPoints: 3, outcomePoints: 1 }, // group exact (not a column)
    "R32-1": { exactPoints: 3 }, // counts R32
    "R32-2": { exactPoints: 0, outcomePoints: 3 }, // outcome only → not exact
    "R16-1": { exactPoints: 3 },
    "R16-2": { exactPoints: 3 },
    "QF-1": { exactPoints: 0 },
    "F-1": { exactPoints: 3 },
    "3RD-1": { exactPoints: 3 },
  };
  const stageOf = (id) => id.split("-")[0].replace("GROUP", "group");
  const e = computeExactByStage(matchScores, stageOf);
  eq(e.R32, 1, "one exact hit in R32");
  eq(e.R16, 2, "two exact hits in R16");
  eq(e.QF, 0, "no exact hits in QF");
  eq(e.SF, 0, "no exact hits in SF");
  eq(e.F, 1, "one exact hit in final");
  eq(e["3RD"], 1, "one exact hit in 3rd-place match");
  // Group-stage exacts are intentionally NOT in the per-stage breakdown.
  assert(!("group" in e), "group stage is excluded from per-stage exact buckets");
}
assert(
  EXACT_STAGES.every((s) => computeExactByStage(null, () => "F")[s] === 0),
  "null matchScores → all-zero exact buckets",
);

// --- 4. computeFormMetricValues flattening ---
{
  const values = computeFormMetricValues(
    { rank: 7, totalPoints: 123, exactScoreCount: 9, outcomeCount: 20 },
    { R32: 8, R16: 4, QF: 2, SF: 1, F: 1 },
    { R32: 3, R16: 2, QF: 1, SF: 0, F: 1, "3RD": 0 },
  );
  eq(values.rank, 7, "rank value");
  eq(values.points, 123, "points value");
  eq(values.exactTotal, 9, "exactTotal value");
  eq(values.outcomeTotal, 20, "outcomeTotal value");
  eq(values.teamsR32, 8, "teamsR32 value");
  eq(values.teamsF, 1, "teamsF value");
  eq(values.exactR16, 2, "exactR16 value");
  eq(values.exact3RD, 0, "exact3RD value");
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
