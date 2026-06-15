// Regression tests for the returning-visitor digest on the home page (#1).
//
// It must: keep its OWN snapshot (not reuse the Leaderboard's prevRanks),
// compute "new results" + "rank movement" since the last visit, hide itself
// when there's nothing to report, and sit at the top of the locked home.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== WELCOME-BACK DIGEST REGRESSION TESTS ===\n");

assert(existsMigratedSrc("src/components/WelcomeBackDigest.jsx"), "WelcomeBackDigest component exists");
const d = readMigratedSrc("src/components/WelcomeBackDigest.jsx");

// Own snapshot, NOT the leaderboard's prevRanks (semantics differ).
assert(/beeri:home:lastSeen/.test(d), "uses its own home-visit snapshot key");
assert(!/beeri:prevRanks/.test(d), "does NOT reuse the Leaderboard prevRanks snapshot");

// Deltas
assert(/resultsCount\s*-\s*prev\.resultsCount/.test(d), "computes new-results delta since last visit");
assert(/prev\.bestRank\s*-\s*bestRank|prev\.bestRank != null \? prev\.bestRank - bestRank/.test(d), "computes rank movement (prev - current)");

// Hide when there's nothing to report / first visit / guest.
assert(/if \(newResults === 0 && rankDelta === 0\) return null/.test(d), "renders nothing when no change");
assert(/!prev/.test(d), "shows nothing on the very first visit (no snapshot to compare)");
assert(/!user\?\.id/.test(d), "guests / form-less users see nothing");

// Snapshot is written on a delay so a refresh keeps the delta.
assert(/setTimeout/.test(d) && /WRITE_DELAY_MS/.test(d), "writes the new snapshot on a delay (refresh-safe)");

// Mounted at the top of the locked home, above the live card.
const home = readMigratedSrc("src/pages/Home.jsx");
assert(/<WelcomeBackDigest \/>[\s\S]{0,40}<LiveNowCard \/>/.test(home), "digest renders above LiveNowCard on the locked home");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
