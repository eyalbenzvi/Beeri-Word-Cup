// Unit + wiring tests for the achievements feature (#9).
//   - computeAchievements / longestExactStreak: pure projections of a scored form.
//   - Leaderboard form detail renders the earned badges.

import { computeAchievements, longestExactStreak } from "../../src/utils/achievements.ts";
import { ALL_MATCHES } from "../../src/data/matches.ts";
import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}
const ids = (list) => list.map((a) => a.id);

console.log("=== ACHIEVEMENTS TESTS ===\n");

// ---- empty / null ----------------------------------------------------------
assert(computeAchievements(null).length === 0, "null form → no achievements");
assert(computeAchievements({}).length === 0, "empty form → no achievements");

// ---- exact-score tiers are mutually exclusive (highest only) ---------------
assert(ids(computeAchievements({ exactScoreCount: 1 })).includes("first-hit"), "1 exact → first-hit");
{
  const a = ids(computeAchievements({ exactScoreCount: 7 }));
  assert(a.includes("sharpshooter") && !a.includes("first-hit"), "7 exact → sharpshooter only (no lower tier)");
}
{
  const a = ids(computeAchievements({ exactScoreCount: 12 }));
  assert(a.includes("exact-machine") && !a.includes("sharpshooter"), "12 exact → exact-machine only");
}

// ---- bonus / count / points badges -----------------------------------------
assert(ids(computeAchievements({ outcomeCount: 25 })).includes("outcome-master"), "25 outcomes → outcome-master");
assert(ids(computeAchievements({ correctChampion: true })).includes("champion-caller"), "correct champion badge");
assert(ids(computeAchievements({ correctTopScorer: true })).includes("golden-boot"), "correct top scorer badge");
assert(ids(computeAchievements({ advancingPoints: { R16: 6 } })).includes("knockout-prophet"), "knockout advancing points badge");
{
  const a = ids(computeAchievements({ totalPoints: 250 }));
  assert(a.includes("double-century") && !a.includes("centurion"), "250 pts → double-century only");
}
assert(ids(computeAchievements({ totalPoints: 120 })).includes("centurion"), "120 pts → centurion");

// ---- streak detection uses chronological (fifaMatch) order -----------------
{
  // Pick three consecutive matches by fifaMatch order, mark them exact, and a
  // gap match in between that's only an outcome → streak should be 3 then reset.
  const chrono = [...ALL_MATCHES].sort((a, b) => (a.fifaMatch || 0) - (b.fifaMatch || 0));
  const matchScores = {};
  matchScores[chrono[0].id] = { exactPoints: 3 };
  matchScores[chrono[1].id] = { exactPoints: 3 };
  matchScores[chrono[2].id] = { exactPoints: 3 };
  matchScores[chrono[3].id] = { exactPoints: 0, outcomePoints: 1 }; // breaks streak
  matchScores[chrono[4].id] = { exactPoints: 3 };
  assert(longestExactStreak(matchScores) === 3, "longest streak counts the 3 consecutive exacts");
  assert(ids(computeAchievements({ matchScores })).includes("hot-streak"), "3-streak earns hot-streak badge");
}
{
  // Unplayed matches between two exacts must NOT break the streak.
  const chrono = [...ALL_MATCHES].sort((a, b) => (a.fifaMatch || 0) - (b.fifaMatch || 0));
  const matchScores = {};
  matchScores[chrono[0].id] = { exactPoints: 3 };
  // chrono[1] not present (not played) — should be skipped, not a break
  matchScores[chrono[2].id] = { exactPoints: 3 };
  assert(longestExactStreak(matchScores) === 2, "unplayed matches are skipped, not streak-breakers");
}

// ---- wiring ----------------------------------------------------------------
assert(existsMigratedSrc("src/components/AchievementBadges.jsx"), "AchievementBadges component exists");
const lb = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/AchievementBadges/.test(lb), "Leaderboard form detail renders AchievementBadges");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
