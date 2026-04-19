// Tests for src/utils/upcomingMatches.js (pure selector).
// Verifies the home-page widget's rule: show all yet-to-happen matches on
// the same Israel-calendar day as the earliest upcoming match.

import { selectUpcomingMatches } from "/home/user/Beeri-World-Cup/src/utils/upcomingMatches.js";
import {
  groupMatches,
  knockoutMatches,
  ALL_MATCHES,
} from "/home/user/Beeri-World-Cup/src/data/matches.js";
import { getMatchKickoffUTC } from "/home/user/Beeri-World-Cup/src/utils/matchTime.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== UPCOMING MATCHES SELECTOR TESTS ===\n");

// Helper: time before a given Israel date/time (in UTC ms)
function hoursBeforeMatch(match, hoursBack) {
  return getMatchKickoffUTC(match) - hoursBack * 3600000;
}

// ---- 1. Empty/invalid inputs ----
console.log("--- 1. Empty / invalid inputs ---");
assert(
  selectUpcomingMatches([], {}, Date.UTC(2026, 5, 11, 0, 0)).length === 0,
  "Empty match list -> []"
);
assert(
  selectUpcomingMatches(null, {}, 0).length === 0,
  "Null matches -> []"
);
assert(
  selectUpcomingMatches(undefined, null, 0).length === 0,
  "Undefined matches -> []"
);
assert(
  selectUpcomingMatches([{ id: "x" }], {}, 0).length === 0,
  "Matches without date/time ignored"
);

// ---- 2. Before tournament starts: first day is Jun 11 ----
console.log("--- 2. Before tournament ---");
{
  const now = Date.UTC(2026, 5, 1, 0, 0); // Jun 1, way before kickoff
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length > 0, "At least one upcoming match");
  assert(result[0].id === "group-A-1", `First upcoming is Jun 11 A match, got ${result[0].id}`);
  // Jun 11 in the schedule has only one match (match 1: MEX vs RSA at 22:00 Israel)
  assert(result.length === 1, `Only 1 match on Jun 11, got ${result.length}`);
}

// ---- 3. After first match starts: next day's matches shown ----
console.log("--- 3. After first match kicks off ---");
{
  const firstMatch = groupMatches.find(m => m.date === "Jun 11");
  const now = getMatchKickoffUTC(firstMatch) + 60_000; // 1 min after kickoff
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  // Next match is group-A-2 (fifaMatch 2): Jun 12 05:00 Israel - same Israel day as more matches
  // Jun 12 has: match 2 (05:00) and match 3 (22:00). Both on Jun 12 Israel.
  assert(result.length >= 2, `Jun 12 should have multiple matches, got ${result.length}`);
  // All returned matches should be on Jun 12
  const dates = new Set(result.map(m => m.date));
  assert(dates.size === 1 && dates.has("Jun 12"), `All should be Jun 12, got ${[...dates].join(",")}`);
}

// ---- 4. Same Israel day grouping, multiple matches ----
console.log("--- 4. Same-day grouping ---");
{
  // Jun 14 has match 5 (04:00), match 6 (07:00), match 10 (20:00), match 11 (23:00)
  // All on Jun 14 Israel. Also Jun 14 01:00 belongs to Jun 14 Israel.
  // Query just before Jun 14 01:00 Israel -> should show all Jun 14 matches.
  const now = Date.UTC(2026, 5, 13, 21, 30, 0); // Jun 14 00:30 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  const jun14 = result.filter(m => m.date === "Jun 14");
  assert(jun14.length === result.length, `All results should be Jun 14, got mix: ${result.map(m=>m.date).join(",")}`);
  // There should be multiple Jun 14 matches
  assert(result.length >= 4, `Jun 14 should have >= 4 matches, got ${result.length}`);
}

// ---- 5. After all Jun 14 matches end, roll to Jun 15 ----
console.log("--- 5. Day rollover (Israel time) ---");
{
  // Last Jun 14 match is Jun 14 23:00 Israel.
  // Jun 15 01:00 Israel = start of next Israel day.
  // Between them (say Jun 14 23:30 Israel, which is Jun 14 20:30 UTC):
  //   - Jun 14 23:00 already kicked off -> excluded
  //   - Jun 15 01:00 not yet -> candidate
  // So the returned day should be Jun 15, not Jun 14.
  const now = Date.UTC(2026, 5, 14, 20, 30, 0); // Jun 14 23:30 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  if (result.length > 0) {
    assert(result[0].date === "Jun 15", `First upcoming after all Jun 14 done: expected Jun 15, got ${result[0].date}`);
    const dates = new Set(result.map(m => m.date));
    assert(dates.size === 1, `All on same day, got: ${[...dates].join(",")}`);
  }
}

// ---- 6. Across calendar midnight (Israel date key stays consistent) ----
console.log("--- 6. Early-morning matches counted on their Israel date ---");
{
  // Jun 14 04:00 Israel is Jun 14 by Israel calendar, but Jun 14 01:00 UTC.
  // Query just before it, asking for the match's day.
  const now = Date.UTC(2026, 5, 14, 0, 0, 0); // Jun 14 03:00 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  // Should include Jun 14 04:00 Israel onwards, all Jun 14 matches
  const dates = new Set(result.map(m => m.date));
  assert(dates.has("Jun 14"), "Includes Jun 14 matches");
  assert(dates.size === 1, `Single day cluster: got ${[...dates].join(",")}`);
}

// ---- 7. matchResults excludes matches ----
console.log("--- 7. matchResults excludes matches ---");
{
  const now = Date.UTC(2026, 5, 1, 0, 0);
  const withoutResults = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(withoutResults.length === 1, "Sanity: Jun 11 single match without results");
  const firstId = withoutResults[0].id;
  const results = { [firstId]: { homeScore: 0, awayScore: 0 } };
  const withResults = selectUpcomingMatches(ALL_MATCHES, results, now);
  // Since Jun 11 now has result, next day's matches shown instead
  assert(withResults.length > 0, "Next day matches returned");
  assert(!withResults.some(m => m.id === firstId), "Jun 11 match excluded once result recorded");
  assert(withResults[0].date === "Jun 12", `Rolls to Jun 12, got ${withResults[0].date}`);
}

// ---- 8. Sort order (ascending by kickoff) ----
console.log("--- 8. Sort order ---");
{
  const now = Date.UTC(2026, 5, 13, 21, 0, 0); // Jun 14 00:00 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  for (let i = 1; i < result.length; i++) {
    const prev = getMatchKickoffUTC(result[i - 1]);
    const curr = getMatchKickoffUTC(result[i]);
    assert(prev <= curr, `Order: ${result[i-1].id} (${prev}) must come before ${result[i].id} (${curr})`);
  }
}

// ---- 9. After tournament ends ----
console.log("--- 9. After tournament ---");
{
  const now = Date.UTC(2027, 0, 1, 0, 0); // Jan 2027
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 0, `Post-tournament: expected [], got ${result.length}`);
}

// ---- 10. All results recorded -> empty ----
console.log("--- 10. All results recorded ---");
{
  const results = {};
  for (const m of ALL_MATCHES) {
    results[m.id] = { homeScore: 0, awayScore: 0 };
  }
  const now = Date.UTC(2026, 5, 1, 0, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, results, now);
  assert(result.length === 0, "All results recorded -> empty");
}

// ---- 11. Exactly at kickoff: match is NOT upcoming ----
console.log("--- 11. Boundary: exactly at kickoff ---");
{
  const firstMatch = groupMatches[0]; // Jun 11 22:00 Israel
  const exactly = getMatchKickoffUTC(firstMatch);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, exactly);
  // At exact kickoff, the match is considered started -> excluded
  assert(!result.some(m => m.id === firstMatch.id), "Match excluded at exact kickoff");
  // One millisecond before kickoff -> included
  const justBefore = selectUpcomingMatches(ALL_MATCHES, {}, exactly - 1);
  assert(justBefore.some(m => m.id === firstMatch.id), "Included one ms before kickoff");
}

// ---- 12. Knockout matches appear in schedule ----
console.log("--- 12. Knockout matches participate ---");
{
  // Around Jun 28 (first R32 day)
  const now = Date.UTC(2026, 5, 27, 0, 0); // Before first R32
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  // Depending on when it is, result could be group or knockout
  // Near Jun 28, only knockout should remain if all group done
  // For this test, just verify knockout matches can be surfaced
  // when group done + knockout upcoming
  const allGroupResults = {};
  for (const m of groupMatches) {
    allGroupResults[m.id] = { homeScore: 1, awayScore: 0 };
  }
  const result2 = selectUpcomingMatches(ALL_MATCHES, allGroupResults, now);
  assert(result2.length > 0, "Knockout matches appear when group is complete");
  assert(result2[0].stage !== "group", `First match should be knockout, got ${result2[0].stage}`);
  const dates = new Set(result2.map(m => m.date));
  assert(dates.size === 1, `Still single-day grouping: ${[...dates].join(",")}`);
}

// ---- 13. Tournament end day (Jul 19) ----
console.log("--- 13. Final day ---");
{
  // Jul 18 15:00 UTC = Jul 18 18:00 Israel. Both 3rd place (Jul 19 00:00
  // Israel) and Final (Jul 19 22:00 Israel) are still upcoming and fall on
  // the Jul 19 Israel calendar day, so they should cluster together.
  const now = Date.UTC(2026, 6, 18, 15, 0);
  const allExceptFinal = {};
  for (const m of ALL_MATCHES) {
    if (m.id === "F-1" || m.id === "3RD-1") continue;
    allExceptFinal[m.id] = { homeScore: 0, awayScore: 0 };
  }
  const result = selectUpcomingMatches(ALL_MATCHES, allExceptFinal, now);
  assert(result.length === 2, `Jul 19 has 2 matches (3rd + final), got ${result.length}`);
  for (const m of result) {
    assert(m.date === "Jul 19", `All Jul 19: ${m.id} has ${m.date}`);
  }
  // Sub-case: after 3rd place kicked off but final still ahead — only final.
  const afterThird = Date.UTC(2026, 6, 18, 22, 0); // Jul 19 01:00 Israel
  const result2 = selectUpcomingMatches(ALL_MATCHES, allExceptFinal, afterThird);
  assert(result2.length === 1, `Only final upcoming, got ${result2.length}`);
  assert(result2[0].id === "F-1", `Expected F-1, got ${result2[0].id}`);
}

// ---- 14. Stability: idempotent across repeated calls ----
console.log("--- 14. Idempotent ---");
{
  const now = Date.UTC(2026, 5, 12, 0, 0);
  const r1 = selectUpcomingMatches(ALL_MATCHES, {}, now);
  const r2 = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(r1.length === r2.length, "Idempotent length");
  for (let i = 0; i < r1.length; i++) {
    assert(r1[i].id === r2[i].id, `Idempotent id at ${i}`);
  }
}

// ---- 15. Edge — match missing time but with date ----
console.log("--- 15. Match missing time ignored ---");
{
  const fake = [
    { id: "broken", date: "Jun 14", stage: "group" }, // no time
    { id: "ok", date: "Jun 14", time: "22:00", stage: "group", homeTeam: "X", awayTeam: "Y" },
  ];
  const result = selectUpcomingMatches(fake, {}, Date.UTC(2026, 5, 1, 0, 0));
  assert(result.length === 1 && result[0].id === "ok", "Broken entry filtered");
}

// ---- 16. Day cluster includes matches whose kickoff is in the future AND same-day ----
console.log("--- 16. Cluster excludes past-kickoff same-day matches ---");
{
  // "Now" = Jun 14 12:00 Israel (= Jun 14 09:00 UTC).
  // Past same-day matches: Jun 14 04:00, 07:00 Israel.
  // Future same-day: Jun 14 20:00, 23:00 Israel.
  const now = Date.UTC(2026, 5, 14, 9, 0, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  // All returned must be Jun 14 AND kickoff > now
  for (const m of result) {
    assert(m.date === "Jun 14", `Same-day only: ${m.id} on ${m.date}`);
    assert(getMatchKickoffUTC(m) > now, `Kickoff in future: ${m.id}`);
  }
  // Should include the 20:00 and 23:00 matches
  assert(result.length >= 2, `Jun 14 afternoon+: expected >=2 matches, got ${result.length}`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  - " + f));
  process.exit(1);
}
