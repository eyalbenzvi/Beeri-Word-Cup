// Regression tests for the head-to-head form comparison feature (#3).
//
// Logic-heavy parts (scoring, ranking) are covered elsewhere; this locks the
// wiring: the component exists, self-computes from the shared pipeline, defaults
// the opponent to the leader, and is reachable from the Leaderboard form detail.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== FORM COMPARISON REGRESSION TESTS ===\n");

assert(existsMigratedSrc("src/components/FormComparison.jsx"), "FormComparison component exists");
const c = readMigratedSrc("src/components/FormComparison.jsx");

// Self-computes from the same pipeline as the leaderboard (so numbers agree).
assert(/useLeaderboardComputed/.test(c), "comparison uses the shared leaderboard pipeline");

// Opponent defaults to the leader (skipping self), with the user's best as an option.
assert(/rankedLeaderboard\.find\(\(e\) => e\.formId !== formAId\)/.test(c), "default opponent is the leader (not self)");
assert(/e\.userId === user\.id && e\.formId !== formAId/.test(c), "user's own best form offered as an opponent");

// Per-match tally compares points per played match.
assert(/aWins\+\+|aWins \+/.test(c) && /bWins/.test(c), "per-match win tally computed");
assert(/scoredA\?\.matchScores\?\.\[id\]/.test(c), "uses per-match scores for the breakdown");

// Renders top-line stat comparisons + a match list.
assert(/StatCell/.test(c), "renders stat-by-stat comparison cells");
assert(/max-h-72 overflow-y-auto/.test(c), "per-match list is scrollable");

// Wiring into the Leaderboard form detail.
const lb = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/FormComparison formAId=\{selectedForm\}/.test(lb), "form detail renders FormComparison for the open form");
assert(/setComparing/.test(lb), "compare toggle state exists");
assert(/settings\.predictionsLocked && rankedLeaderboard\.length > 1/.test(lb), "compare button only when locked + there is an opponent");
assert(/setComparing\(false\)/.test(lb), "comparison resets when the form/detail changes or closes");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
