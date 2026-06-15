// Regression tests for the live rank-impact projection (#2).
//
// Locks the approach: a hypothetical built from real results + current live
// scores, scored through the SAME leaderboard pipeline, compared to the current
// rank — and only shown while a live match has a score.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== LIVE RANK IMPACT REGRESSION TESTS ===\n");

assert(existsMigratedSrc("src/components/LiveRankImpact.jsx"), "LiveRankImpact component exists");
const c = readMigratedSrc("src/components/LiveRankImpact.jsx");

// Reuses the live-score + leaderboard infrastructure.
assert(/useLiveScores/.test(c), "uses the live-scores hook");
assert(/useUpcomingMatches/.test(c), "uses the upcoming-matches selector for isLive");
assert(/m\.isLive/.test(c), "filters to live matches");
assert((c.match(/useLeaderboardComputed/g) || []).length >= 2, "computes BOTH current and hypothetical standings via the shared pipeline");

// Hypothetical = real results + live scores treated as final.
assert(/const out: Record<string, any> = \{ \.\.\.results \}/.test(c), "hypothetical starts from the real results");
assert(/homeScore: s\.homeScore, awayScore: s\.awayScore, played: true/.test(c), "live score injected as a played result");
assert(/entry\.advancingTeam = home|advancingTeam = away/.test(c), "decisive knockout gets a provisional advancing side");

// Projection = current rank vs hypothetical rank for the user's best form.
assert(/best\.rank - hypoEntry\.rank/.test(c), "delta = current rank − projected rank");
assert(/livePoints/.test(c), "shows provisional points from the live matches");

// Guards: nothing to show without a live score or without forms.
assert(/scoredLiveCount === 0 \|\| !impact/.test(c), "renders nothing without a scored live match or user forms");
assert(/לא סופי/.test(c), "labels the projection as provisional");

// All hooks run before the early return (React hook-order safety).
const earlyReturnIdx = c.indexOf("if (scoredLiveCount === 0");
assert(earlyReturnIdx > c.lastIndexOf("useLeaderboardComputed"), "early return comes after all hook calls");

// Wired into the locked home, below the live card.
const home = readMigratedSrc("src/pages/Home.jsx");
assert(/<LiveNowCard \/>[\s\S]{0,60}<LiveRankImpact \/>/.test(home), "LiveRankImpact renders under the live card on home");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
