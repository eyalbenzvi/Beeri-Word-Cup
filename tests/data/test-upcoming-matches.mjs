// Tests for src/utils/upcomingMatches.js (pure selector).
// Verifies the home-page widget's rule: show all yet-to-happen matches
// whose kickoff falls within the next 24 hours, plus kicked-off matches
// without a recorded result (marked isLive) for up to LIVE_WINDOW_MS.

import {
  selectUpcomingMatches,
  selectRecentlyFinishedMatches,
  finishedExpiryUTC,
  UPCOMING_WINDOW_MS,
  LIVE_WINDOW_MS,
  MATCH_DURATION_MS,
  FINISHED_WINDOW_MS,
  MORNING_CUTOFF_HOUR,
} from "/home/user/Beeri-World-Cup/src/utils/upcomingMatches.js";
import { israelHour } from "/home/user/Beeri-World-Cup/src/utils/matchTime.js";
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

// ---- 3. After first match starts: shown as live + next 24h of matches ----
console.log("--- 3. After first match kicks off ---");
{
  const firstMatch = groupMatches.find(m => m.date === "Jun 11");
  const now = getMatchKickoffUTC(firstMatch) + 60_000; // 1 min after kickoff
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  // Opener has no result yet -> stays visible as live. Window ends
  // Jun 12 22:01 Israel: covers match 2 (Jun 12 05:00) and match 3
  // (Jun 12 22:00) but not Jun 13 04:00.
  assert(result.length === 3, `Live opener + two upcoming, got ${result.length}`);
  assert(result[0].id === firstMatch.id, `Opener first, got ${result[0]?.id}`);
  assert(result[0].isLive === true, "Opener marked isLive");
  assert(result.slice(1).every(m => m.date === "Jun 12" && !m.isLive),
    "Remaining are Jun 12 upcoming (not live)");
  // Once a result is recorded the opener drops off.
  const withResult = selectUpcomingMatches(
    ALL_MATCHES, { [firstMatch.id]: { homeScore: 1, awayScore: 0 } }, now);
  assert(withResult.length === 2 && !withResult.some(m => m.id === firstMatch.id),
    "Opener removed once result recorded");
}

// ---- 4. Busy day: all of its matches inside the window ----
console.log("--- 4. Busy day within window ---");
{
  // Jun 14 has 01:00, 04:00, 07:00, 20:00, 23:00 Israel.
  // Now = Jun 14 00:30 Israel -> window ends Jun 15 00:30 Israel.
  // All five Jun 14 matches are inside; Jun 15 02:00 is not.
  // Jun 13 22:00 kicked off 2.5h ago with no result -> shows as live.
  const now = Date.UTC(2026, 5, 13, 21, 30, 0); // Jun 14 00:30 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 6, `Live Jun 13 match + five Jun 14, got ${result.length}`);
  assert(result[0].date === "Jun 13" && result[0].isLive === true,
    "Jun 13 22:00 still listed as live (no result yet)");
  const upcoming = result.filter(m => !m.isLive);
  assert(upcoming.length === 5, `Five upcoming Jun 14 matches, got ${upcoming.length}`);
  const dates = new Set(upcoming.map(m => m.date));
  assert(dates.size === 1 && dates.has("Jun 14"), `All upcoming Jun 14, got ${[...dates].join(",")}`);
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
  // Jun 14 20:00 + 23:00 kicked off without results -> live. Upcoming inside:
  // Jun 15 02:00, 05:00, 19:00, 22:00. Outside: Jun 16 01:00 Israel
  // (= Jun 15 22:00 UTC > window end Jun 15 20:30 UTC).
  const now = Date.UTC(2026, 5, 14, 20, 30, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length === 6, `Two live + four upcoming, got ${result.length}`);
  const live = result.filter(m => m.isLive);
  assert(live.length === 2 && live.every(m => m.date === "Jun 14"),
    `Jun 14 20:00 + 23:00 shown as live, got ${live.map(m => m.id).join(",")}`);
  const upcoming = result.filter(m => !m.isLive);
  assert(upcoming.length === 4, `Four upcoming, got ${upcoming.length}`);
  const dates = new Set(upcoming.map(m => m.date));
  assert(dates.size === 1 && dates.has("Jun 15"), `All upcoming Jun 15, got ${[...dates].join(",")}`);
  // With results recorded for the kicked-off matches, only upcoming remain.
  const results = {};
  for (const m of live) results[m.id] = { homeScore: 0, awayScore: 0 };
  const afterResults = selectUpcomingMatches(ALL_MATCHES, results, now);
  assert(afterResults.length === 4 && afterResults[0].date === "Jun 15",
    `Live matches drop once results recorded, got ${afterResults.length}`);
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
  // At exact kickoff, the match is considered started -> shown as live.
  const atKickoff = selectUpcomingMatches(ALL_MATCHES, {}, kickoff);
  const liveEntry = atKickoff.find(m => m.id === firstMatch.id);
  assert(liveEntry && liveEntry.isLive === true, "Match live at exact kickoff");
  // One millisecond before kickoff -> included as upcoming (not live).
  const justBefore = selectUpcomingMatches(ALL_MATCHES, {}, kickoff - 1);
  const upcomingEntry = justBefore.find(m => m.id === firstMatch.id);
  assert(upcomingEntry && !upcomingEntry.isLive, "Included (not live) one ms before kickoff");
  // Exactly 24 hours before kickoff -> included (window is inclusive).
  const atEdge = selectUpcomingMatches(ALL_MATCHES, {}, kickoff - UPCOMING_WINDOW_MS);
  assert(atEdge.some(m => m.id === firstMatch.id), "Included exactly 24h before kickoff");
  // 24 hours + 1ms before kickoff -> excluded.
  const pastEdge = selectUpcomingMatches(ALL_MATCHES, {}, kickoff - UPCOMING_WINDOW_MS - 1);
  assert(!pastEdge.some(m => m.id === firstMatch.id), "Excluded just outside 24h window");
  // Just inside the live window -> still live; at/after its edge -> dropped.
  const lateButLive = selectUpcomingMatches(ALL_MATCHES, {}, kickoff + LIVE_WINDOW_MS - 1);
  assert(lateButLive.some(m => m.id === firstMatch.id && m.isLive),
    "Still live just inside LIVE_WINDOW_MS");
  const liveExpired = selectUpcomingMatches(ALL_MATCHES, {}, kickoff + LIVE_WINDOW_MS);
  assert(!liveExpired.some(m => m.id === firstMatch.id),
    "Dropped at LIVE_WINDOW_MS even without a result");
  // A recorded result removes the match immediately, even mid-game.
  const midGame = selectUpcomingMatches(
    ALL_MATCHES, { [firstMatch.id]: { homeScore: 2, awayScore: 0 } }, kickoff + 60_000);
  assert(!midGame.some(m => m.id === firstMatch.id), "Result recorded -> removed even while live");
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
  // After 3rd place kicked off (no result yet) — it shows as live, plus the final.
  const afterThird = Date.UTC(2026, 6, 18, 22, 0); // Jul 19 01:00 Israel
  const result3 = selectUpcomingMatches(ALL_MATCHES, allExceptFinal, afterThird);
  assert(result3.length === 2, `Live 3rd place + final, got ${result3.length}`);
  assert(result3[0].id === "3RD-1" && result3[0].isLive === true,
    `Expected live 3RD-1 first, got ${result3[0]?.id}`);
  assert(result3[1].id === "F-1" && !result3[1].isLive,
    `Expected upcoming F-1 second, got ${result3[1]?.id}`);
  // Once the 3rd-place result is in, only the final remains.
  const withThird = { ...allExceptFinal, "3RD-1": { homeScore: 1, awayScore: 0 } };
  const result4 = selectUpcomingMatches(ALL_MATCHES, withThird, afterThird);
  assert(result4.length === 1 && result4[0].id === "F-1",
    `Only final once 3rd-place result recorded, got ${result4.map(m => m.id).join(",")}`);
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

// ---- 16. Matches past the live window never returned, even without results ----
console.log("--- 16. Matches beyond live window excluded ---");
{
  // "Now" = Jun 14 12:00 Israel (= Jun 14 09:00 UTC).
  // Past same-day matches: Jun 14 01:00, 04:00, 07:00 Israel — all kicked
  // off more than LIVE_WINDOW_MS ago, so even with no recorded result they
  // must not appear (no stale "live" entries).
  const now = Date.UTC(2026, 5, 14, 9, 0, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  for (const m of result) {
    assert(getMatchKickoffUTC(m) > now, `Kickoff in future: ${m.id}`);
    assert(!m.isLive, `Not marked live: ${m.id}`);
  }
  assert(result.length >= 2, `Jun 14 afternoon+: expected >=2 matches, got ${result.length}`);
}

// ---- 17. Live matches: marked, sorted first, source objects untouched ----
console.log("--- 17. Live match invariants ---");
{
  // Now = Jun 14 21:00 Israel (= Jun 14 18:00 UTC): the 20:00 match is live.
  const now = Date.UTC(2026, 5, 14, 18, 0, 0);
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  const live = result.filter(m => m.isLive);
  assert(live.length === 1, `One live match at Jun 14 21:00, got ${live.length}`);
  assert(live[0].date === "Jun 14" && live[0].time === "20:00",
    `Live match is Jun 14 20:00, got ${live[0]?.date} ${live[0]?.time}`);
  // Live entries sort before upcoming ones (ascending kickoff covers it).
  assert(result[0].isLive === true, "Live match listed first");
  for (let i = 1; i < result.length; i++) {
    assert(!result[i].isLive, `Only first entry live, ${result[i].id} is not`);
  }
  // The selector must not mutate the canonical match objects.
  const source = ALL_MATCHES.find(m => m.id === live[0].id);
  assert(source && source.isLive === undefined,
    "Source match object not mutated with isLive");
  // Upcoming (future) entries keep reference identity with the source data.
  const future = result.find(m => !m.isLive);
  assert(ALL_MATCHES.includes(future), "Future matches returned by reference");
}

// ====================================================================
//   RECENTLY-FINISHED SELECTOR (selectRecentlyFinishedMatches)
// ====================================================================

// ---- 18. Constants ----
console.log("--- 18. Recently-finished constants ---");
assert(FINISHED_WINDOW_MS === 4 * 3600000, "Finished window is 4 hours");
assert(MATCH_DURATION_MS === 2.5 * 3600000,
  "Estimated match duration is 2.5h (covers knockout ET + penalties)");

// ---- 19. Invalid inputs ----
console.log("--- 19. Recently-finished invalid inputs ---");
assert(selectRecentlyFinishedMatches([], {}, 0).length === 0, "Empty matches -> []");
assert(selectRecentlyFinishedMatches(null, {}, 0).length === 0, "Null matches -> []");
assert(selectRecentlyFinishedMatches(ALL_MATCHES, null, 0).length === 0, "Null results -> []");
assert(selectRecentlyFinishedMatches(ALL_MATCHES, {}, 0).length === 0, "No results -> []");

// ---- 20. Only matches WITH a result appear ----
console.log("--- 20. Requires a recorded result ---");
{
  const first = groupMatches[0]; // Jun 11 22:00 Israel
  const kickoff = getMatchKickoffUTC(first);
  const now = kickoff + 2 * 3600000; // 2h after kickoff (~full time)
  // No result -> never appears as finished (it's "live" instead).
  assert(selectRecentlyFinishedMatches(ALL_MATCHES, {}, now).length === 0,
    "Match without result does not appear as finished");
  // With a result -> appears.
  const res = { [first.id]: { homeScore: 2, awayScore: 1 } };
  const finished = selectRecentlyFinishedMatches(ALL_MATCHES, res, now);
  assert(finished.length === 1 && finished[0].id === first.id,
    "Match with result appears as finished");
  assert(finished[0].isFinished === true, "Returned match flagged isFinished");
  assert(finished[0].result && finished[0].result.homeScore === 2,
    "Official result attached to the returned match");
}

// ---- 21. Window boundaries (via finishedExpiryUTC) ----
console.log("--- 21. Finished window boundaries ---");
{
  const first = groupMatches[0];
  const kickoff = getMatchKickoffUTC(first);
  const res = { [first.id]: { homeScore: 0, awayScore: 0 } };
  const expiresAt = finishedExpiryUTC(kickoff);
  // Right at the result moment (mid-game write) it shows immediately.
  assert(selectRecentlyFinishedMatches(ALL_MATCHES, res, kickoff + 60_000).length === 1,
    "Shows from kickoff onward once a result exists (no gap with live card)");
  // Just inside the window -> still shown.
  assert(selectRecentlyFinishedMatches(ALL_MATCHES, res, expiresAt - 1).some(m => m.id === first.id),
    "Still shown 1ms before window close");
  // Exactly at the edge -> still shown (inclusive).
  assert(selectRecentlyFinishedMatches(ALL_MATCHES, res, expiresAt).some(m => m.id === first.id),
    "Shown exactly at window edge");
  // Past the edge -> dropped.
  assert(!selectRecentlyFinishedMatches(ALL_MATCHES, res, expiresAt + 1).some(m => m.id === first.id),
    "Dropped just past the window");
}

// ---- 21b. Morning catch-up: overnight matches survive until noon ----
console.log("--- 21b. Morning catch-up (overnight -> noon) ---");
{
  assert(MORNING_CUTOFF_HOUR === 12, "Morning cutoff is noon Israel");

  // A match kicking off at 01:00 Israel (deep night). End ~03:00, plain 4h
  // window would close ~07:00 — right as people wake. The rule keeps it to noon.
  const nightKickoff = Date.UTC(2026, 5, 14, 1 - 3, 0); // Jun 14 01:00 Israel
  const expiry = finishedExpiryUTC(nightKickoff);
  assert(israelHour(expiry) === 12, `Overnight match expires at noon Israel, got hour ${israelHour(expiry)}`);
  const plain4h = nightKickoff + MATCH_DURATION_MS + FINISHED_WINDOW_MS;
  assert(expiry > plain4h, "Expiry extended beyond the plain 4h window");

  const res = { ["night"]: { homeScore: 1, awayScore: 0 } };
  const matches = [{ id: "night", date: "Jun 14", time: "01:00", stage: "group", homeTeam: "X", awayTeam: "Y" }];
  // 08:00 Israel (morning riser): still visible.
  const at8 = Date.UTC(2026, 5, 14, 8 - 3, 0);
  assert(selectRecentlyFinishedMatches(matches, res, at8).length === 1,
    "Overnight result still visible at 08:00 (morning riser)");
  // 11:59 Israel: still visible.
  const at1159 = Date.UTC(2026, 5, 14, 12 - 3, 0) - 60_000;
  assert(selectRecentlyFinishedMatches(matches, res, at1159).length === 1,
    "Overnight result visible just before noon");
  // 12:01 Israel: gone.
  const at1201 = Date.UTC(2026, 5, 14, 12 - 3, 0) + 60_000;
  assert(selectRecentlyFinishedMatches(matches, res, at1201).length === 0,
    "Overnight result drops off just after noon");
}

// ---- 21c. Daytime matches keep the plain 4h window (no morning push) ----
console.log("--- 21c. Daytime matches: plain 4h ---");
{
  // Kickoff 14:00 Israel -> end ~16:00 -> 4h window closes ~20:00 (after noon),
  // so no morning override; it must NOT be stretched to next-day noon.
  const dayKickoff = Date.UTC(2026, 5, 14, 14 - 3, 0); // Jun 14 14:00 Israel
  const expiry = finishedExpiryUTC(dayKickoff);
  assert(expiry === dayKickoff + MATCH_DURATION_MS + FINISHED_WINDOW_MS,
    "Daytime match uses the plain 4h window (no morning extension)");
  assert(israelHour(expiry) === 20, `Daytime expiry stays at ~20:00, got ${israelHour(expiry)}`);
}

// ---- 22. Defensive: future match with a (stray) result is ignored ----
console.log("--- 22. Future match ignored ---");
{
  const first = groupMatches[0];
  const kickoff = getMatchKickoffUTC(first);
  const res = { [first.id]: { homeScore: 1, awayScore: 0 } };
  assert(selectRecentlyFinishedMatches(ALL_MATCHES, res, kickoff - 60_000).length === 0,
    "Result on a not-yet-started match is not shown as finished");
}

// ---- 23. Most-recent-first ordering ----
console.log("--- 23. Ordering (most recent first) ---");
{
  // Three Jun 14 matches with results; now just after the latest.
  const early = ALL_MATCHES.find(m => m.date === "Jun 14" && m.time === "01:00");
  const mid = ALL_MATCHES.find(m => m.date === "Jun 14" && m.time === "04:00");
  const late = ALL_MATCHES.find(m => m.date === "Jun 14" && m.time === "07:00");
  assert(early && mid && late, "Found three Jun 14 fixtures for ordering test");
  const res = {
    [early.id]: { homeScore: 1, awayScore: 0 },
    [mid.id]: { homeScore: 2, awayScore: 2 },
    [late.id]: { homeScore: 0, awayScore: 1 },
  };
  // At the latest kickoff: late just kicked off (kickoff <= now), and the
  // earliest (01:00) is exactly at its 6h window edge (01:00 + 6h = 07:00),
  // so all three are inclusive.
  const now = getMatchKickoffUTC(late); // Jun 14 07:00 Israel
  const finished = selectRecentlyFinishedMatches(ALL_MATCHES, res, now);
  assert(finished.length === 3, `Three finished matches, got ${finished.length}`);
  assert(finished[0].id === late.id && finished[2].id === early.id,
    `Latest first, earliest last — got ${finished.map(m => m.time).join(",")}`);
}

// ---- 24. Source objects not mutated ----
console.log("--- 24. No mutation of source data ---");
{
  const first = groupMatches[0];
  const kickoff = getMatchKickoffUTC(first);
  const res = { [first.id]: { homeScore: 1, awayScore: 1 } };
  selectRecentlyFinishedMatches(ALL_MATCHES, res, kickoff + 3600000);
  const source = ALL_MATCHES.find(m => m.id === first.id);
  assert(source.isFinished === undefined && source.result === undefined,
    "Canonical match object not mutated with isFinished/result");
}

// ---- 25. Live + finished are disjoint by construction ----
console.log("--- 25. Live and finished are disjoint ---");
{
  // A match with a result is finished (not live); without a result it's live.
  const first = groupMatches[0];
  const kickoff = getMatchKickoffUTC(first);
  const now = kickoff + 90 * 60000; // 90 min in
  const res = { [first.id]: { homeScore: 3, awayScore: 1 } };
  const live = selectUpcomingMatches(ALL_MATCHES, res, now);
  const finished = selectRecentlyFinishedMatches(ALL_MATCHES, res, now);
  assert(!live.some(m => m.id === first.id), "With result: absent from live selector");
  assert(finished.some(m => m.id === first.id), "With result: present in finished selector");
}

// ---- 26. Unresolved knockout tie stays LIVE, not finished ----
console.log("--- 26. Unresolved knockout tie keeps showing live ---");
{
  const ko = knockoutMatches.find((m) => getMatchKickoffUTC(m) !== null);
  const kickoff = getMatchKickoffUTC(ko);
  const now = kickoff + 100 * 60000; // ~100 min in (extra time)
  // 90' recorded as a tie, but no advancing team yet (still being decided).
  const res = { [ko.id]: { homeScore: 1, awayScore: 1, stage: ko.stage, played: true } };
  assert(selectUpcomingMatches(ALL_MATCHES, res, now).some((m) => m.id === ko.id && m.isLive), "Unresolved KO tie: still LIVE");
  assert(!selectRecentlyFinishedMatches(ALL_MATCHES, res, now).some((m) => m.id === ko.id), "Unresolved KO tie: NOT in finished");

  // Once the advancing team is recorded it becomes final -> finished, not live.
  const resolved = { [ko.id]: { ...res[ko.id], advancingTeam: ko.homeTeam || "ARG" } };
  assert(!selectUpcomingMatches(ALL_MATCHES, resolved, now).some((m) => m.id === ko.id), "Resolved KO tie: leaves live");
  assert(selectRecentlyFinishedMatches(ALL_MATCHES, resolved, now).some((m) => m.id === ko.id), "Resolved KO tie: appears in finished");

  // A decisive knockout (no tie) is final immediately.
  const decisive = { [ko.id]: { homeScore: 2, awayScore: 1, stage: ko.stage, played: true } };
  assert(!selectUpcomingMatches(ALL_MATCHES, decisive, now).some((m) => m.id === ko.id), "Decisive KO: not live");
  assert(selectRecentlyFinishedMatches(ALL_MATCHES, decisive, now).some((m) => m.id === ko.id), "Decisive KO: finished");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  - " + f));
  process.exit(1);
}
