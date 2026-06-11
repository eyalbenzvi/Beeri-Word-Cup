// Tests for src/utils/upcomingMatches.js (pure selector).
// Verifies the home-page widget's rule: show all yet-to-happen matches
// whose kickoff falls within the next 24 hours.

import {
  selectUpcomingMatches,
  UPCOMING_WINDOW_MS,
} from "/home/user/Beeri-World-Cup/src/utils/upcomingMatches.js";
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

// ---- 0. Window constant ----
console.log("--- 0. Window constant ---");
assert(UPCOMING_WINDOW_MS === 24 * 3600000, "Window is 24 hours");

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

// ---- 2. Long before tournament: nothing within 24 hours ----
console.log("--- 2. Before tournament ---");
{
  const now = Date.UTC(2026, 5, 1, 0, 0); // Jun 1, way before kickoff
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 0, `No matches within 24h on Jun 1, got ${result.length}`);
}
{
  // Jun 11 00:00 Israel (= Jun 10 21:00 UTC): window ends Jun 12 00:00 Israel,
  // covering only match 1 (Jun 11 22:00 Israel).
  const now = Date.UTC(2026, 5, 10, 21, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 1, `Only opening match within 24h, got ${result.length}`);
  assert(result[0].id === "group-A-1", `First upcoming is opener, got ${result[0]?.id}`);
}

// ---- 3. After first match starts: next 24h of matches shown ----
console.log("--- 3. After first match kicks off ---");
{
  const firstMatch = groupMatches.find(m => m.date === "Jun 11");
  const now = getMatchKickoffUTC(firstMatch) + 60_000; // 1 min after kickoff
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  // Window ends Jun 12 22:01 Israel. Covers match 2 (Jun 12 05:00) and
  // match 3 (Jun 12 22:00) but not Jun 13 04:00.
  assert(result.length === 2, `Two matches within 24h, got ${result.length}`);
  const dates = new Set(result.map(m => m.date));
  assert(dates.size === 1 && dates.has("Jun 12"), `Both on Jun 12, got ${[...dates].join(",")}`);
}

// ---- 4. Busy day: all of its matches inside the window ----
console.log("--- 4. Busy day within window ---");
{
  // Jun 14 has 01:00, 04:00, 07:00, 20:00, 23:00 Israel.
  // Now = Jun 14 00:30 Israel -> window ends Jun 15 00:30 Israel.
  // All five Jun 14 matches are inside; Jun 15 02:00 is not.
  const now = Date.UTC(2026, 5, 13, 21, 30, 0); // Jun 14 00:30 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 5, `Five Jun 14 matches within 24h, got ${result.length}`);
  const dates = new Set(result.map(m => m.date));
  assert(dates.size === 1 && dates.has("Jun 14"), `All Jun 14, got ${[...dates].join(",")}`);
}

// ---- 5. Window spans two Israel calendar days ----
console.log("--- 5. Window spans two days ---");
{
  // Now = Jun 14 12:00 Israel (= Jun 14 09:00 UTC) -> window ends Jun 15 12:00.
  // Inside: Jun 14 20:00 + 23:00, Jun 15 02:00 + 05:00. Outside: Jun 15 19:00.
  const now = Date.UTC(2026, 5, 14, 9, 0, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 4, `Four matches within 24h, got ${result.length}`);
  const dates = new Set(result.map(m => m.date));
  assert(dates.has("Jun 14") && dates.has("Jun 15"), `Spans Jun 14+15, got ${[...dates].join(",")}`);
  for (const m of result) {
    const k = getMatchKickoffUTC(m);
    assert(k > now && k <= now + UPCOMING_WINDOW_MS, `${m.id} inside window`);
  }
}

// ---- 6. Late evening: rolls into the next day's matches ----
console.log("--- 6. Late-evening rollover ---");
{
  // Now = Jun 14 23:30 Israel (= Jun 14 20:30 UTC) -> window ends Jun 15 23:30.
  // Jun 14 23:00 already kicked off. Inside: Jun 15 02:00, 05:00, 19:00, 22:00.
  // Outside: Jun 16 01:00 Israel (= Jun 15 22:00 UTC > window end Jun 15
  // 20:30 UTC).
  const now = Date.UTC(2026, 5, 14, 20, 30, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 4, `Four matches within 24h, got ${result.length}`);
  assert(result[0].date === "Jun 15", `First upcoming is Jun 15, got ${result[0]?.date}`);
  const dates = new Set(result.map(m => m.date));
  assert(dates.size === 1 && dates.has("Jun 15"), `All Jun 15, got ${[...dates].join(",")}`);
}

// ---- 7. matchResults excludes matches ----
console.log("--- 7. matchResults excludes matches ---");
{
  // Jun 11 12:00 Israel (= Jun 11 09:00 UTC): window covers match 1
  // (Jun 11 22:00) and match 2 (Jun 12 05:00).
  const now = Date.UTC(2026, 5, 11, 9, 0);
  const withoutResults = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(withoutResults.length === 2, `Sanity: 2 matches in window, got ${withoutResults.length}`);
  const firstId = withoutResults[0].id;
  const results = { [firstId]: { homeScore: 0, awayScore: 0 } };
  const withResults = selectUpcomingMatches(ALL_MATCHES, results, now);
  assert(withResults.length === 1, "Match with recorded result dropped");
  assert(!withResults.some(m => m.id === firstId), "Opener excluded once result recorded");
}

// ---- 8. Sort order (ascending by kickoff) ----
console.log("--- 8. Sort order ---");
{
  const now = Date.UTC(2026, 5, 13, 21, 0, 0); // Jun 14 00:00 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length > 1, "Multiple matches to order");
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
  const now = Date.UTC(2026, 5, 11, 9, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, results, now);
  assert(result.length === 0, "All results recorded -> empty");
}

// ---- 11. Boundary: exactly at kickoff / exactly at window edge ----
console.log("--- 11. Boundaries ---");
{
  const firstMatch = groupMatches[0]; // Jun 11 22:00 Israel
  const kickoff = getMatchKickoffUTC(firstMatch);
  // At exact kickoff, the match is considered started -> excluded.
  const atKickoff = selectUpcomingMatches(ALL_MATCHES, {}, kickoff);
  assert(!atKickoff.some(m => m.id === firstMatch.id), "Match excluded at exact kickoff");
  // One millisecond before kickoff -> included.
  const justBefore = selectUpcomingMatches(ALL_MATCHES, {}, kickoff - 1);
  assert(justBefore.some(m => m.id === firstMatch.id), "Included one ms before kickoff");
  // Exactly 24 hours before kickoff -> included (window is inclusive).
  const atEdge = selectUpcomingMatches(ALL_MATCHES, {}, kickoff - UPCOMING_WINDOW_MS);
  assert(atEdge.some(m => m.id === firstMatch.id), "Included exactly 24h before kickoff");
  // 24 hours + 1ms before kickoff -> excluded.
  const pastEdge = selectUpcomingMatches(ALL_MATCHES, {}, kickoff - UPCOMING_WINDOW_MS - 1);
  assert(!pastEdge.some(m => m.id === firstMatch.id), "Excluded just outside 24h window");
}

// ---- 12. Knockout matches appear in schedule ----
console.log("--- 12. Knockout matches participate ---");
{
  // First R32 match is Jun 28 22:00 Israel (= Jun 28 19:00 UTC).
  // Now = Jun 28 03:00 Israel (= Jun 28 00:00 UTC), all group results in.
  const allGroupResults = {};
  for (const m of groupMatches) {
    allGroupResults[m.id] = { homeScore: 1, awayScore: 0 };
  }
  const now = Date.UTC(2026, 5, 28, 0, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, allGroupResults, now);
  assert(result.length > 0, "Knockout matches appear when group is complete");
  assert(result.every(m => m.stage !== "group"), "All returned are knockout");
  assert(result.some(m => m.id === "R32-1"), "Includes first R32 match");
  for (const m of result) {
    const k = getMatchKickoffUTC(m);
    assert(k > now && k <= now + UPCOMING_WINDOW_MS, `${m.id} inside 24h window`);
  }
}

// ---- 13. Tournament end day (Jul 19) ----
console.log("--- 13. Final day ---");
{
  // 3rd place: Jul 19 00:00 Israel (= Jul 18 21:00 UTC).
  // Final:     Jul 19 22:00 Israel (= Jul 19 19:00 UTC).
  // Now = Jul 18 23:00 Israel (= Jul 18 20:00 UTC): both within 24h.
  const now = Date.UTC(2026, 6, 18, 20, 0);
  const allExceptFinal = {};
  for (const m of ALL_MATCHES) {
    if (m.id === "F-1" || m.id === "3RD-1") continue;
    allExceptFinal[m.id] = { homeScore: 0, awayScore: 0 };
  }
  const result = selectUpcomingMatches(ALL_MATCHES, allExceptFinal, now);
  assert(result.length === 2, `3rd place + final within 24h, got ${result.length}`);
  for (const m of result) {
    assert(m.date === "Jul 19", `All Jul 19: ${m.id} has ${m.date}`);
  }
  // Earlier in the day (Jul 18 18:00 Israel) the final is >24h away — only
  // the 3rd-place match shows.
  const earlier = Date.UTC(2026, 6, 18, 15, 0);
  const result2 = selectUpcomingMatches(ALL_MATCHES, allExceptFinal, earlier);
  assert(result2.length === 1, `Only 3rd place within 24h, got ${result2.length}`);
  assert(result2[0].id === "3RD-1", `Expected 3RD-1, got ${result2[0]?.id}`);
  // After 3rd place kicked off — only the final remains.
  const afterThird = Date.UTC(2026, 6, 18, 22, 0); // Jul 19 01:00 Israel
  const result3 = selectUpcomingMatches(ALL_MATCHES, allExceptFinal, afterThird);
  assert(result3.length === 1, `Only final upcoming, got ${result3.length}`);
  assert(result3[0].id === "F-1", `Expected F-1, got ${result3[0]?.id}`);
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
  const result = selectUpcomingMatches(fake, {}, Date.UTC(2026, 5, 14, 9, 0, 0));
  assert(result.length === 1 && result[0].id === "ok", "Broken entry filtered");
}

// ---- 16. Past-kickoff matches never returned, even inside the day ----
console.log("--- 16. Past-kickoff matches excluded ---");
{
  // "Now" = Jun 14 12:00 Israel (= Jun 14 09:00 UTC).
  // Past same-day matches: Jun 14 01:00, 04:00, 07:00 Israel.
  const now = Date.UTC(2026, 5, 14, 9, 0, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  for (const m of result) {
    assert(getMatchKickoffUTC(m) > now, `Kickoff in future: ${m.id}`);
  }
  assert(result.length >= 2, `Jun 14 afternoon+: expected >=2 matches, got ${result.length}`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  - " + f));
  process.exit(1);
}
