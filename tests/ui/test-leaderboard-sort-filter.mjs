// Regression tests for leaderboard sort & filter controls (#7).
//
// The board can be re-ordered by official rank / exact-score count / correct-
// outcome count, and narrowed to the signed-in user's own forms — all while
// each row keeps its OFFICIAL rank badge. These assertions lock the wiring.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== LEADERBOARD SORT & FILTER REGRESSION TESTS ===\n");

const lb = readMigratedSrc("src/pages/Leaderboard.jsx");

// State
assert(/sortBy/.test(lb) && /setSortBy/.test(lb), "sortBy state exists");
assert(/mineOnly/.test(lb) && /setMineOnly/.test(lb), "mineOnly state exists");
assert(/useState<"rank" \| "exact" \| "outcome">\("rank"\)/.test(lb), "default sort is official rank");

// Derived displayed list applies mine-only + sort on top of search filter.
assert(/const displayedLeaderboard = useMemo/.test(lb), "displayedLeaderboard memo exists");
assert(/mineOnly && user\?\.id/.test(lb), "mineOnly narrows to the current user's forms");
assert(
  /\[\.\.\.list\]\.sort\(\(a, b\) => \(b\[metric\]/.test(lb),
  "sorting clones the list (no mutation) and sorts by the chosen metric",
);
assert(/\|\| a\.rank - b\.rank/.test(lb), "sort tie-breaks by official rank for a stable order");

// Sorting must NOT recompute the rank badge — the row still shows entry.rank.
assert(/currentRank = entry\.rank/.test(lb), "rows keep their official rank badge regardless of sort");

// Controls UI
assert(/aria-pressed=\{sortBy === opt\.id\}/.test(lb), "sort chips expose aria-pressed");
assert(/aria-pressed=\{mineOnly\}/.test(lb), "mine-only toggle exposes aria-pressed");
assert(/שלי בלבד/.test(lb), "mine-only control is labelled");

// Changing sort/filter resets pagination so the user sees the top of the new order.
assert(
  (lb.match(/setShowCount\(PAGE_SIZE\)/g) || []).length >= 3,
  "sort/filter changes reset pagination to the first page",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
