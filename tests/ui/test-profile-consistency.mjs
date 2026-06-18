// Regression lock: Profile page must derive form state from the same sources
// the rest of the app uses. Previously Profile read a stored-but-never-written
// `form.champion` field (always null) and computed a custom rank that
// disagreed with Leaderboard when two forms were tied.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== PROFILE CONSISTENCY TESTS ===\n");

const profile = readMigratedSrc("src/pages/Profile.jsx", "utf8");
const adminTools = readMigratedSrc("src/components/AdminToolsTab.jsx", "utf8");
const hook = readMigratedSrc("src/hooks/useLeaderboardComputed.js", "utf8");

// --- 1. Profile uses computed champion (parity with FormList/AllForms/Leaderboard) ---
assert(
  /getCachedChampion\(form\.matches/.test(profile),
  "Profile derives champion from form.matches (not stored form.champion)",
);
assert(
  !/form\.champion/.test(profile),
  "Profile no longer references the stale form.champion field",
);
assert(
  /getCachedChampion/.test(profile) &&
    /from ["']\.\.\/utils\/bracketCache["']/.test(profile),
  "Profile imports getCachedChampion from bracketCache",
);

// --- 2. Profile uses rankedLeaderboard (parity with Leaderboard page) ---
assert(
  /rankedLeaderboard/.test(profile),
  "Profile reads rankedLeaderboard from useLeaderboardComputed",
);
assert(
  !/leaderboard\.indexOf\([^)]*\)\s*\+\s*1/.test(profile),
  "Profile no longer computes a custom indexOf-based rank",
);
assert(
  /lbEntry\.rank/.test(profile),
  "Profile reads rank from the shared rankedLeaderboard entry",
);

// --- 3. AdminToolsTab CSV export derives champion from matches ---
// Previously emitted `pred.champion` which was always empty.
assert(
  /getCachedChampion\(pred\.matches/.test(adminTools),
  "Admin CSV export derives champion from matches",
);
assert(
  !/pred\.champion/.test(adminTools),
  "Admin CSV export no longer reads stale pred.champion",
);

// --- 4. Shared hook exports rankedLeaderboard ---
assert(
  /rankedLeaderboard/.test(hook),
  "useLeaderboardComputed exports rankedLeaderboard",
);
// Dense-ranking (and its compareTiebreaker tie handling) lives in the shared
// scoring core, which the hook composes via assignDenseRanks.
const core = readMigratedSrc("src/utils/leaderboardCore.js", "utf8");
assert(
  /assignDenseRanks/.test(hook),
  "useLeaderboardComputed builds rankedLeaderboard via the shared assignDenseRanks",
);
assert(
  /compareTiebreaker/.test(core),
  "shared rank core uses compareTiebreaker for tied forms",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
