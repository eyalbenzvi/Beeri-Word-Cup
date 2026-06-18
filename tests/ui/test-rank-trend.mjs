// Unit + wiring tests for the rank-trend feature (#6).
//   - rankHistory: dedupe/cap logic via an injected fake storage.
//   - Leaderboard records history and renders the sparkline in the form detail.

import { recordRanks, getRankHistory } from "../../src/utils/rankHistory.ts";
import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== RANK TREND TESTS ===\n");

// Fake localStorage-like object.
function fakeStore() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), _map: map };
}

const DAY = 24 * 3600 * 1000;

// ---- first point is always recorded ----------------------------------------
{
  const s = fakeStore();
  recordRanks([{ formId: "f1", rank: 10 }], 1000, s);
  assert(getRankHistory("f1", s).length === 1, "first point recorded");
  assert(getRankHistory("f1", s)[0].rank === 10, "records the rank value");
}

// ---- unchanged rank within a day is NOT duplicated -------------------------
{
  const s = fakeStore();
  recordRanks([{ formId: "f1", rank: 10 }], 1000, s);
  recordRanks([{ formId: "f1", rank: 10 }], 1000 + 3600 * 1000, s); // +1h, same rank
  assert(getRankHistory("f1", s).length === 1, "stable rank within a day is not re-recorded");
}

// ---- rank change is recorded immediately -----------------------------------
{
  const s = fakeStore();
  recordRanks([{ formId: "f1", rank: 10 }], 1000, s);
  recordRanks([{ formId: "f1", rank: 7 }], 2000, s);
  const h = getRankHistory("f1", s);
  assert(h.length === 2 && h[1].rank === 7, "rank movement appends a new point");
}

// ---- stable rank across a day boundary records one daily point -------------
{
  const s = fakeStore();
  recordRanks([{ formId: "f1", rank: 5 }], 1000, s);
  recordRanks([{ formId: "f1", rank: 5 }], 1000 + DAY + 1, s); // next day, same rank
  assert(getRankHistory("f1", s).length === 2, "stable rank still gets one point per day");
}

// ---- multiple forms tracked independently ----------------------------------
{
  const s = fakeStore();
  recordRanks([{ formId: "a", rank: 1 }, { formId: "b", rank: 2 }], 1000, s);
  assert(getRankHistory("a", s).length === 1 && getRankHistory("b", s).length === 1, "each form has its own series");
}

// ---- no storage → safe no-op -----------------------------------------------
assert(Object.keys(recordRanks([{ formId: "x", rank: 1 }], 1000, null)).length === 0, "null storage is a safe no-op");
assert(getRankHistory("x", null).length === 0, "getRankHistory with null storage returns []");

// ---- wiring ----------------------------------------------------------------
assert(existsMigratedSrc("src/components/RankTrendSparkline.jsx"), "RankTrendSparkline component exists");
const spark = readMigratedSrc("src/components/RankTrendSparkline.jsx");
assert(/history\.length < 2/.test(spark), "sparkline needs at least two points");
const lb = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/recordRanks\(rankedLeaderboard\.map/.test(lb), "Leaderboard records all form ranks");
assert(/if \(embedded \|\| rankedLeaderboard\.length === 0\) return;/.test(lb), "recording skipped in embedded mode / no forms");
assert(/RankTrendSparkline formId=\{selectedForm\}/.test(lb), "form detail renders the rank trend");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
