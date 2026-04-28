// Behavioral test: the hoisted rankedLeaderboard logic assigns equal ranks
// to tied forms ("1,1,3" dense-with-gaps), and Leaderboard + Profile both
// consume that same array so a form's position never differs between the
// two pages.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { compareTiebreaker } from "../../src/utils/scoring.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== RANK CONSISTENCY TESTS ===\n");

// Mirror the rank-assignment loop in useLeaderboardComputed.js so we can
// exercise it without a React environment.
function assignRanks(leaderboard) {
  const out = [];
  let currentRank = 1;
  for (let i = 0; i < leaderboard.length; i++) {
    if (i > 0) {
      const prev = leaderboard[i - 1];
      if (
        leaderboard[i].totalPoints !== prev.totalPoints ||
        compareTiebreaker(leaderboard[i], prev) !== 0
      ) {
        currentRank = i + 1;
      }
    }
    out.push({ ...leaderboard[i], rank: currentRank });
  }
  return out;
}

// --- 1. Two forms with identical totals AND identical tiebreakers share a rank ---
{
  const input = [
    { formId: "a", totalPoints: 10, exactScoreCount: 2, outcomeCount: 5 },
    { formId: "b", totalPoints: 10, exactScoreCount: 2, outcomeCount: 5 },
    { formId: "c", totalPoints: 8,  exactScoreCount: 1, outcomeCount: 4 },
  ];
  const ranked = assignRanks(input);
  assert(ranked[0].rank === 1, "Leader has rank 1");
  assert(ranked[1].rank === 1, "Fully tied form shares rank 1");
  assert(ranked[2].rank === 3, "Next form skips to rank 3 (dense-with-gaps)");
}

// --- 2. A tie-breaker difference separates the two forms ---
{
  const input = [
    { formId: "a", totalPoints: 10, exactScoreCount: 3, outcomeCount: 5 },
    { formId: "b", totalPoints: 10, exactScoreCount: 2, outcomeCount: 5 },
  ];
  const ranked = assignRanks(input);
  assert(ranked[0].rank === 1, "Higher exact count takes rank 1");
  assert(ranked[1].rank === 2, "Lower exact count gets rank 2 (not tied)");
}

// --- 3. Empty / single-entry safety ---
assert(assignRanks([]).length === 0, "Empty leaderboard → empty ranks");
{
  const ranked = assignRanks([{ formId: "solo", totalPoints: 0, exactScoreCount: 0, outcomeCount: 0 }]);
  assert(ranked[0].rank === 1, "Single entry gets rank 1");
}

// --- 4. Both Profile and Leaderboard read from the same rankedLeaderboard
// destructured off useLeaderboardComputed, so positions cannot drift. ---
const profile = readMigratedSrc("src/pages/Profile.jsx", "utf8");
const leaderboard = readMigratedSrc("src/pages/Leaderboard.jsx", "utf8");
assert(
  /useLeaderboardComputed[\s\S]*?rankedLeaderboard/.test(profile),
  "Profile destructures rankedLeaderboard from the shared hook",
);
assert(
  /useLeaderboardComputed[\s\S]*?rankedLeaderboard/.test(leaderboard),
  "Leaderboard destructures rankedLeaderboard from the shared hook",
);
assert(
  !/const rankedLeaderboard = useMemo/.test(leaderboard),
  "Leaderboard no longer owns its own rank useMemo (hoisted into hook)",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
