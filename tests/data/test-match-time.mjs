// Tests for src/utils/matchTime.js
// Verifies parsing of the schedule's Israel-local "Jun 14" / "22:00" format
// into UTC millisecond timestamps and day keys.

import {
  getMatchKickoffUTC,
  getMatchIsraelDateKey,
  formatIsraelDateLabel,
} from "/home/user/Beeri-World-Cup/src/utils/matchTime.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== MATCH TIME PARSING TESTS ===\n");

// ---- 1. Basic conversion (Israel -> UTC) ----
console.log("--- 1. Basic conversion ---");
{
  // Jun 11 22:00 Israel (IDT, UTC+3) -> Jun 11 19:00 UTC
  const kickoff = getMatchKickoffUTC({ date: "Jun 11", time: "22:00" });
  const expected = Date.UTC(2026, 5, 11, 19, 0, 0);
  assert(kickoff === expected, `Jun 11 22:00 IDT -> UTC: got ${kickoff}, expected ${expected}`);
}
{
  // Midday: Jun 14 12:00 Israel -> Jun 14 09:00 UTC
  const kickoff = getMatchKickoffUTC({ date: "Jun 14", time: "12:00" });
  const expected = Date.UTC(2026, 5, 14, 9, 0, 0);
  assert(kickoff === expected, "Jun 14 12:00 IDT -> UTC");
}
{
  // Early morning: Jun 14 01:00 Israel -> Jun 13 22:00 UTC (previous UTC day)
  const kickoff = getMatchKickoffUTC({ date: "Jun 14", time: "01:00" });
  const expected = Date.UTC(2026, 5, 13, 22, 0, 0);
  assert(kickoff === expected, `Jun 14 01:00 IDT crosses UTC midnight: got ${kickoff}, expected ${expected}`);
}

// ---- 2. All minute variants ----
console.log("--- 2. Minute handling ---");
{
  const k = getMatchKickoffUTC({ date: "Jun 28", time: "02:30" });
  const expected = Date.UTC(2026, 5, 27, 23, 30, 0);
  assert(k === expected, "02:30 -> correct minutes");
}
{
  const k = getMatchKickoffUTC({ date: "Jun 14", time: "04:30" });
  const expected = Date.UTC(2026, 5, 14, 1, 30, 0);
  assert(k === expected, "04:30 preserves minutes");
}

// ---- 3. July matches ----
console.log("--- 3. July matches ---");
{
  const k = getMatchKickoffUTC({ date: "Jul 19", time: "22:00" });
  const expected = Date.UTC(2026, 6, 19, 19, 0, 0);
  assert(k === expected, "Jul 19 final");
}
{
  const k = getMatchKickoffUTC({ date: "Jul 1", time: "00:00" });
  const expected = Date.UTC(2026, 5, 30, 21, 0, 0);
  assert(k === expected, "Jul 1 00:00 -> Jun 30 21:00 UTC");
}

// ---- 4. Invalid/missing data returns null ----
console.log("--- 4. Invalid inputs ---");
assert(getMatchKickoffUTC(null) === null, "null match -> null");
assert(getMatchKickoffUTC(undefined) === null, "undefined match -> null");
assert(getMatchKickoffUTC({}) === null, "empty match -> null");
assert(getMatchKickoffUTC({ date: "Jun 14" }) === null, "no time -> null");
assert(getMatchKickoffUTC({ time: "22:00" }) === null, "no date -> null");
assert(getMatchKickoffUTC({ date: "", time: "22:00" }) === null, "empty date -> null");
assert(getMatchKickoffUTC({ date: "Jun 14", time: "" }) === null, "empty time -> null");
assert(getMatchKickoffUTC({ date: "Foo 14", time: "22:00" }) === null, "bad month -> null");
assert(getMatchKickoffUTC({ date: "Jun", time: "22:00" }) === null, "no day part -> null");
assert(getMatchKickoffUTC({ date: "Jun 14", time: "25:00" }) === null, "hour out of range -> null");
assert(getMatchKickoffUTC({ date: "Jun 14", time: "12:75" }) === null, "minute out of range -> null");
assert(getMatchKickoffUTC({ date: "Jun 14", time: "12" }) === null, "malformed time -> null");
assert(getMatchKickoffUTC({ date: "Jun -1", time: "12:00" }) === null, "negative day -> null");
assert(getMatchKickoffUTC({ date: "Jun 32", time: "12:00" }) === null, "day > 31 -> null");
assert(getMatchKickoffUTC({ date: "Jun abc", time: "12:00" }) === null, "non-numeric day -> null");

// ---- 5. Ordering sanity ----
console.log("--- 5. Ordering sanity ---");
{
  const k1 = getMatchKickoffUTC({ date: "Jun 14", time: "22:00" });
  const k2 = getMatchKickoffUTC({ date: "Jun 15", time: "01:00" });
  assert(k1 < k2, "22:00 before next-day 01:00 chronologically");
}
{
  const k1 = getMatchKickoffUTC({ date: "Jun 14", time: "04:00" });
  const k2 = getMatchKickoffUTC({ date: "Jun 14", time: "22:00" });
  assert(k1 < k2, "same-day 04:00 before 22:00");
}
{
  // Tournament span
  const k1 = getMatchKickoffUTC({ date: "Jun 11", time: "22:00" });
  const k2 = getMatchKickoffUTC({ date: "Jul 19", time: "22:00" });
  assert(k1 < k2, "kickoff before final");
  const days = (k2 - k1) / 86400000;
  assert(days === 38, `tournament lasts 38 days, got ${days}`);
}

// ---- 6. DST non-transition during tournament ----
console.log("--- 6. DST assumption (IDT stable throughout Jun 11 - Jul 19) ---");
{
  // If offset changed mid-tournament, identical nominal times on different
  // dates would have unexpected UTC spacing. Verify same-time matches on
  // consecutive days differ by exactly 24h.
  const a = getMatchKickoffUTC({ date: "Jun 14", time: "22:00" });
  const b = getMatchKickoffUTC({ date: "Jun 15", time: "22:00" });
  assert(b - a === 86400000, "Consecutive days 22:00: exactly 24h apart");
  const c = getMatchKickoffUTC({ date: "Jul 4", time: "22:00" });
  const d = getMatchKickoffUTC({ date: "Jul 5", time: "22:00" });
  assert(d - c === 86400000, "July days 22:00: exactly 24h apart");
}

// ---- 7. Israel date keys ----
console.log("--- 7. Israel date keys ---");
assert(getMatchIsraelDateKey({ date: "Jun 11" }) === "2026-06-11", "Jun 11 -> 2026-06-11");
assert(getMatchIsraelDateKey({ date: "Jun 1" }) === "2026-06-01", "Jun 1 -> zero-padded");
assert(getMatchIsraelDateKey({ date: "Jul 19" }) === "2026-07-19", "Jul 19");
assert(getMatchIsraelDateKey({ date: "Jul 4" }) === "2026-07-04", "Jul 4 -> zero-padded");
assert(getMatchIsraelDateKey(null) === null, "null -> null");
assert(getMatchIsraelDateKey({}) === null, "empty -> null");
assert(getMatchIsraelDateKey({ date: "" }) === null, "empty date -> null");
assert(getMatchIsraelDateKey({ date: "Foo 14" }) === null, "bad month -> null");
assert(getMatchIsraelDateKey({ date: "Jun" }) === null, "missing day -> null");

// ---- 8. Same Israel day despite UTC day boundary ----
console.log("--- 8. Same-day grouping across UTC midnight ---");
{
  // Both are Jun 14 Israel: 04:00 and 22:00
  const early = { date: "Jun 14", time: "04:00" };
  const late = { date: "Jun 14", time: "22:00" };
  assert(
    getMatchIsraelDateKey(early) === getMatchIsraelDateKey(late),
    "Same-day early + late share Israel key"
  );
  // But cross-day (Jun 14 22:00 vs Jun 15 01:00) are different
  const nextEarly = { date: "Jun 15", time: "01:00" };
  assert(
    getMatchIsraelDateKey(late) !== getMatchIsraelDateKey(nextEarly),
    "Late + next-day early have different Israel keys"
  );
}

// ---- 9. Formatting ----
console.log("--- 9. Hebrew date label ---");
assert(formatIsraelDateLabel({ date: "Jun 14" }) === "14.6", "Jun 14 -> 14.6");
assert(formatIsraelDateLabel({ date: "Jul 4" }) === "4.7", "Jul 4 -> 4.7");
assert(formatIsraelDateLabel({ date: "Jun 1" }) === "1.6", "Jun 1 -> 1.6");
assert(formatIsraelDateLabel({ date: "Jul 19" }) === "19.7", "Jul 19 -> 19.7");
assert(formatIsraelDateLabel(null) === "", "null -> empty");
assert(formatIsraelDateLabel({}) === "", "empty -> empty");
assert(formatIsraelDateLabel({ date: "Foo 14" }) === "", "bad month -> empty");

// ---- 10. TZ independence ----
console.log("--- 10. Timezone independence of host environment ---");
{
  // The functions must produce the same UTC timestamp regardless of the
  // process TZ. We can't reset TZ mid-process, but we can at least verify
  // that the computed UTC values match Date.UTC() — which is TZ-agnostic.
  const k = getMatchKickoffUTC({ date: "Jun 14", time: "22:00" });
  // 22:00 IDT == 19:00 UTC
  const reference = new Date(Date.UTC(2026, 5, 14, 19, 0, 0)).getTime();
  assert(k === reference, "Result equals TZ-independent Date.UTC");
}

// ---- 11. Full tournament coverage ----
console.log("--- 11. All scheduled matches parse ---");
{
  const { ALL_MATCHES } = await import("/home/user/Beeri-World-Cup/src/data/matches.js");
  let nullCount = 0, parsed = 0;
  const seenDateKeys = new Set();
  for (const m of ALL_MATCHES) {
    const k = getMatchKickoffUTC(m);
    if (m.date && m.time) {
      assert(k !== null, `Match ${m.id}: should parse (${m.date} ${m.time})`);
      if (k !== null) parsed++;
      const key = getMatchIsraelDateKey(m);
      if (key) seenDateKeys.add(key);
    } else {
      if (k === null) nullCount++;
    }
  }
  assert(parsed >= 72, `At least 72 group matches parsed, got ${parsed}`);
  // All group-stage matches fall on Jun 11 - Jun 27 Israel calendar
  assert(seenDateKeys.size >= 15, `At least 15 distinct calendar days: got ${seenDateKeys.size}`);
  // No date before Jun 11 or after Jul 19
  for (const key of seenDateKeys) {
    assert(key >= "2026-06-11" && key <= "2026-07-19", `Date ${key} within tournament window`);
  }
}

// ---- 12. Specific kickoff regression: Paraguay vs Turkey (Group D, FIFA #31) ----
// Real kickoff: Jun 19 2026, 20:00 PDT (Levi's Stadium, San Francisco Bay Area)
// = 03:00 UTC Jun 20 = 06:00 Israel (IDT, UTC+3). Guards against the prior
// off-by-one-hour error (was 07:00).
console.log("--- 12. Paraguay vs Turkey kickoff (FIFA #31) ---");
{
  const { ALL_MATCHES } = await import("/home/user/Beeri-World-Cup/src/data/matches.js");
  const parTur = ALL_MATCHES.find(
    (m) =>
      m.group === "D" &&
      ((m.homeTeam === "TUR" && m.awayTeam === "PAR") ||
        (m.homeTeam === "PAR" && m.awayTeam === "TUR"))
  );
  assert(parTur, "Group D Paraguay-Turkey match exists");
  if (parTur) {
    assert(parTur.fifaMatch === 31, `PAR-TUR is FIFA #31, got ${parTur.fifaMatch}`);
    assert(parTur.date === "Jun 20", `PAR-TUR date Jun 20, got ${parTur.date}`);
    assert(parTur.time === "06:00", `PAR-TUR time 06:00 Israel, got ${parTur.time}`);
    // And the absolute UTC instant: 03:00 UTC Jun 20
    const k = getMatchKickoffUTC(parTur);
    assert(k === Date.UTC(2026, 5, 20, 3, 0, 0), `PAR-TUR kickoff == 03:00 UTC Jun 20, got ${k}`);
  }
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  - " + f));
  process.exit(1);
}
