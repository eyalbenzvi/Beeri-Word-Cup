// Performance benchmark for the retroactive rank-history graph (#6 v2).
//
// Worst realistic load: a large league (300 forms) deep into the tournament
// with every group match (72) played. computeFormRankHistory rebuilds the full
// per-form rank series by replaying results and ranking ALL forms at each
// cutoff, so this is the O(forms × matches²) hot path. We assert it stays well
// under a budget on the FIRST (uncached) build, and that a second call for any
// form is effectively free (cache hit).

import { computeFormRankHistory } from "/home/user/Beeri-World-Cup/src/utils/computeFormRankHistory.ts";
import { ALL_MATCHES } from "/home/user/Beeri-World-Cup/src/data/matches.ts";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== RANK HISTORY PERF ===\n");

const groupMatchIds = ALL_MATCHES.filter((m) => m.stage === "group").map((m) => m.id);
const N_FORMS = 300;

// Deterministic pseudo-random so the benchmark is stable run to run.
let seed = 12345;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function score() {
  return Math.floor(rnd() * 4); // 0..3
}

// Build a full results map (all group matches played) and N forms whose
// predictions vary, so ranks actually move between cutoffs.
const results = {};
for (const id of groupMatchIds) {
  results[id] = {
    homeScore: score(),
    awayScore: score(),
    stage: "group",
    played: true,
  };
}

const allPredictions = {};
for (let f = 0; f < N_FORMS; f++) {
  const matches = {};
  for (const id of groupMatchIds) {
    matches[id] = { homeScore: score(), awayScore: score() };
  }
  allPredictions[`form_${f}`] = {
    userId: `user_${f}`,
    formName: `Form ${f}`,
    status: "submitted",
    matches,
  };
}
const actualBonuses = { champion: null, topScorers: [] };

// ---- first (uncached) build --------------------------------------------------
const t0 = performance.now();
const hist = computeFormRankHistory("form_0", results, allPredictions, actualBonuses);
const firstMs = performance.now() - t0;

console.log(`  forms=${N_FORMS}  cutoffs=${groupMatchIds.length}  first build=${firstMs.toFixed(0)}ms`);
assert(hist.length === groupMatchIds.length, `series has one point per completed match (got ${hist.length})`);
assert(hist.every((p) => p.rank >= 1 && p.rank <= N_FORMS), "every rank is within [1, N]");
// Generous CI-safe budget. Locally this lands in the low hundreds of ms; the
// point is to catch an accidental order-of-magnitude regression (e.g. losing
// the bracket cache), not to micro-benchmark.
assert(firstMs < 4000, `first build under 4s budget (was ${firstMs.toFixed(0)}ms)`);

// ---- cached lookups (same results reference) --------------------------------
const t1 = performance.now();
for (let f = 0; f < N_FORMS; f++) {
  computeFormRankHistory(`form_${f}`, results, allPredictions, actualBonuses);
}
const cachedMs = performance.now() - t1;
console.log(`  ${N_FORMS} cached lookups=${cachedMs.toFixed(1)}ms`);
assert(cachedMs < firstMs, "all N cached lookups together cost less than one rebuild");

// ---- cache invalidates on a new results reference ---------------------------
const results2 = { ...results };
const t2 = performance.now();
computeFormRankHistory("form_0", results2, allPredictions, actualBonuses);
const rebuildMs = performance.now() - t2;
console.log(`  rebuild after new results ref=${rebuildMs.toFixed(0)}ms`);
assert(rebuildMs > cachedMs, "a fresh results reference triggers a real rebuild (not served stale)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
