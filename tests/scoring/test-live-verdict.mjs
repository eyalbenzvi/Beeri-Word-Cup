// Live-verdict engine tests (src/utils/liveScores.ts + dailyPoints.ts).
//
// The critical regression here: verdict points must equal what the real
// scoring engine (calculateMatchPoints / POINTS) would award if the live
// score became final — for EVERY stage. A hardcoded "+4" that's wrong in a
// quarter-final is the fastest way to lose the players' trust.

import {
  computeLiveVerdict,
  mapLiveEntriesToMatches,
  summarizeVerdicts,
  stabilizeScores,
} from "/home/user/Beeri-World-Cup/src/utils/liveScores.js";
import {
  calculateMatchPoints,
  POINTS,
} from "/home/user/Beeri-World-Cup/src/utils/scoring.js";
import {
  computeDailyFormPoints,
  israelDateKeyForNow,
} from "/home/user/Beeri-World-Cup/src/utils/dailyPoints.js";
import { groupMatches } from "/home/user/Beeri-World-Cup/src/data/matches.js";
import {
  getMatchIsraelDateKey,
  getMatchKickoffUTC,
} from "/home/user/Beeri-World-Cup/src/utils/matchTime.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LIVE VERDICT & MAPPING TESTS ===\n");

// ---- 1. Verdict points == scoring engine, per stage ----
console.log("--- 1. Points parity with calculateMatchPoints (all stages) ---");
const KNOCKOUT_TEAMS = { home: "FRA", away: "BRA" };
for (const stage of Object.keys(POINTS)) {
  const isGroup = stage === "group";
  const teams = isGroup ? null : KNOCKOUT_TEAMS;
  // exact: predicted 2-1, live 2-1
  const exact = computeLiveVerdict({
    prediction: { homeScore: 2, awayScore: 1 },
    live: { homeScore: 2, awayScore: 1, status: "IN_PLAY", minute: 60 },
    stage,
    predTeams: teams,
    actualTeams: teams,
  });
  const engineExact = calculateMatchPoints(
    { homeScore: 2, awayScore: 1 },
    { homeScore: 2, awayScore: 1 },
    stage,
    teams,
    teams,
  );
  assert(exact.kind === "exact", `${stage}: exact kind`);
  assert(exact.points === engineExact.points,
    `${stage}: exact points ${exact.points} == engine ${engineExact.points}`);
  assert(exact.points === POINTS[stage].outcome + POINTS[stage].exactScore,
    `${stage}: exact = outcome+exactScore from POINTS table`);

  // outcome only: predicted 1-0, live 2-1
  const outcome = computeLiveVerdict({
    prediction: { homeScore: 1, awayScore: 0 },
    live: { homeScore: 2, awayScore: 1, status: "IN_PLAY", minute: 60 },
    stage,
    predTeams: teams,
    actualTeams: teams,
  });
  assert(outcome.kind === "outcome", `${stage}: outcome kind`);
  assert(outcome.points === POINTS[stage].outcome, `${stage}: outcome points from POINTS`);

  // none: predicted 0-2, live 2-1
  const none = computeLiveVerdict({
    prediction: { homeScore: 0, awayScore: 2 },
    live: { homeScore: 2, awayScore: 1, status: "IN_PLAY", minute: 60 },
    stage,
    predTeams: teams,
    actualTeams: teams,
  });
  assert(none.kind === "none" && none.points === 0, `${stage}: none kind, 0 points`);
}

// ---- 2. Suppression: knockout beyond 90', never in group ----
console.log("--- 2. Extra-time suppression ---");
{
  const et = computeLiveVerdict({
    prediction: { homeScore: 1, awayScore: 1 },
    live: { homeScore: 1, awayScore: 1, status: "IN_PLAY", minute: 96 },
    stage: "R16",
    predTeams: KNOCKOUT_TEAMS,
    actualTeams: KNOCKOUT_TEAMS,
  });
  assert(et.kind === "suppressed" && et.points === 0,
    "knockout minute>90 -> suppressed (scoring is 90'-based)");

  const groupStoppage = computeLiveVerdict({
    prediction: { homeScore: 1, awayScore: 1 },
    live: { homeScore: 1, awayScore: 1, status: "IN_PLAY", minute: 94 },
    stage: "group",
  });
  assert(groupStoppage.kind === "exact",
    "group minute>90 is stoppage time, NOT suppressed");

  // duration is the authoritative signal (minute is plan-dependent/null on
  // the free tier): any non-REGULAR duration suppresses even with no minute.
  for (const duration of ["EXTRA_TIME", "PENALTY_SHOOTOUT"]) {
    const v = computeLiveVerdict({
      prediction: { homeScore: 1, awayScore: 1 },
      live: { homeScore: 1, awayScore: 1, status: "IN_PLAY", minute: null, duration },
      stage: "R16",
      predTeams: KNOCKOUT_TEAMS,
      actualTeams: KNOCKOUT_TEAMS,
    });
    assert(v.kind === "suppressed", `knockout duration=${duration} -> suppressed (minute null)`);
  }
  const regularKo = computeLiveVerdict({
    prediction: { homeScore: 1, awayScore: 1 },
    live: { homeScore: 1, awayScore: 1, status: "IN_PLAY", minute: 60, duration: "REGULAR" },
    stage: "R16",
    predTeams: KNOCKOUT_TEAMS,
    actualTeams: KNOCKOUT_TEAMS,
  });
  assert(regularKo.kind === "exact", "knockout duration=REGULAR at 60' keeps verdict");

  const etNullBoth = computeLiveVerdict({
    prediction: { homeScore: 1, awayScore: 1 },
    live: { homeScore: 1, awayScore: 1, status: "IN_PLAY", minute: null, duration: null },
    stage: "R16",
    predTeams: KNOCKOUT_TEAMS,
    actualTeams: KNOCKOUT_TEAMS,
  });
  assert(etNullBoth.kind === "exact",
    "knockout with BOTH signals absent keeps verdict (documented residual risk)");
}

// ---- 3. Edge kinds ----
console.log("--- 3. Edge kinds ---");
{
  assert(
    computeLiveVerdict({ prediction: { homeScore: 1, awayScore: 0 }, live: null, stage: "group" }).kind === "no-data",
    "null live -> no-data");
  assert(
    computeLiveVerdict({ prediction: { homeScore: 1, awayScore: 0 }, live: { homeScore: null, awayScore: null, status: "IN_PLAY" }, stage: "group" }).kind === "no-data",
    "live without scores -> no-data");
  assert(
    computeLiveVerdict({ prediction: null, live: { homeScore: 1, awayScore: 0 }, stage: "group" }).kind === "no-prediction",
    "missing prediction -> no-prediction");
  assert(
    computeLiveVerdict({ prediction: { homeScore: null, awayScore: null }, live: { homeScore: 1, awayScore: 0 }, stage: "group" }).kind === "no-prediction",
    "null-score prediction -> no-prediction");
  const diff = computeLiveVerdict({
    prediction: { homeScore: 1, awayScore: 0 },
    live: { homeScore: 1, awayScore: 0, status: "IN_PLAY", minute: 50 },
    stage: "R32",
    predTeams: { home: "GER", away: "ESP" },
    actualTeams: { home: "FRA", away: "BRA" },
  });
  assert(diff.kind === "different-teams" && diff.points === 0,
    "knockout team mismatch -> different-teams, 0 points");
}

// ---- 4. mapLiveEntriesToMatches: pairing + RTL-critical orientation ----
console.log("--- 4. Entry-to-match mapping & orientation ---");
{
  const groupMatch = { id: "g1", stage: "group", homeTeam: "CAN", awayTeam: "BIH" };
  const koMatch = { id: "k1", stage: "R32" };
  const bracket = { k1: { home: "FRA", away: "SEN" } };

  // Same orientation
  let mapped = mapLiveEntriesToMatches(
    [{ homeCode: "CAN", awayCode: "BIH", status: "IN_PLAY", minute: 30, homeScore: 2, awayScore: 0 }],
    [groupMatch],
    {},
  );
  assert(mapped.g1 && mapped.g1.homeScore === 2 && mapped.g1.awayScore === 0,
    "group pairing, same orientation");

  // FLIPPED orientation — the reversed-score bug class. FD lists BIH as home.
  mapped = mapLiveEntriesToMatches(
    [{ homeCode: "BIH", awayCode: "CAN", status: "IN_PLAY", minute: 30, homeScore: 2, awayScore: 0 }],
    [groupMatch],
    {},
  );
  assert(mapped.g1 && mapped.g1.homeScore === 0 && mapped.g1.awayScore === 2,
    "flipped fixture: scores swapped to OUR home/away (RTL-reversal guard)");

  // Knockout via bracket
  mapped = mapLiveEntriesToMatches(
    [{ homeCode: "SEN", awayCode: "FRA", status: "IN_PLAY", minute: 10, homeScore: 1, awayScore: 0 }],
    [koMatch],
    bracket,
  );
  assert(mapped.k1 && mapped.k1.homeScore === 0 && mapped.k1.awayScore === 1,
    "knockout pairing through bracket, flipped orientation");

  // Unresolved bracket -> no mapping (never a wrong match's score)
  mapped = mapLiveEntriesToMatches(
    [{ homeCode: "FRA", awayCode: "SEN", status: "IN_PLAY", minute: 10, homeScore: 1, awayScore: 0 }],
    [koMatch],
    { k1: { home: null, away: null } },
  );
  assert(!mapped.k1, "unresolved knockout slot -> match unmapped");

  // Fixture absent from feed -> unmapped
  mapped = mapLiveEntriesToMatches(
    [{ homeCode: "GER", awayCode: "ESP", status: "IN_PLAY", homeScore: 1, awayScore: 0 }],
    [groupMatch],
    {},
  );
  assert(!mapped.g1, "missing fixture -> unmapped (fallback UI)");

  // duration passes through to the mapped entry (verdict suppression input)
  mapped = mapLiveEntriesToMatches(
    [{ homeCode: "FRA", awayCode: "SEN", status: "IN_PLAY", minute: 100, duration: "EXTRA_TIME", homeScore: 2, awayScore: 2 }],
    [koMatch],
    bracket,
  );
  assert(mapped.k1 && mapped.k1.duration === "EXTRA_TIME", "duration carried through mapping");

  // Rematch within the ±24h feed window: same team pair appears twice
  // (yesterday FINISHED + now IN_PLAY). The entry closest to OUR kickoff
  // wins — pairing the live match to yesterday's fixture would show a
  // wrong (possibly flipped) score. Uses a real scheduled match so
  // getMatchKickoffUTC resolves.
  const realMatch = groupMatches[0];
  const realTeams = { home: realMatch.homeTeam, away: realMatch.awayTeam };
  const realKickoff = getMatchKickoffUTC(realMatch);
  const nearIso = new Date(realKickoff).toISOString();
  const farIso = new Date(realKickoff - 23 * 3600 * 1000).toISOString();
  mapped = mapLiveEntriesToMatches(
    [
      { homeCode: realTeams.home, awayCode: realTeams.away, status: "FINISHED", utcDate: farIso, homeScore: 9, awayScore: 9 },
      { homeCode: realTeams.home, awayCode: realTeams.away, status: "IN_PLAY", utcDate: nearIso, homeScore: 1, awayScore: 0 },
    ],
    [realMatch],
    {},
  );
  assert(mapped[realMatch.id]?.homeScore === 1 && mapped[realMatch.id]?.status === "IN_PLAY",
    "duplicate team-pair entries: kickoff-closest fixture wins (rematch guard)");
}

// ---- 5. summarizeVerdicts: exhaustive partition ----
console.log("--- 5. Rollup counts ---");
{
  const verdicts = [
    { kind: "exact" }, { kind: "outcome" }, { kind: "none" },
    { kind: "suppressed" }, { kind: "different-teams" }, { kind: "no-prediction" },
  ];
  const { scoring, total } = summarizeVerdicts(verdicts);
  assert(total === 6, "total counts ALL forms (exhaustive — nothing vanishes)");
  assert(scoring === 2, "scoring counts exact+outcome only");
  assert(summarizeVerdicts([]).total === 0, "empty -> 0/0");
}

// ---- 6. stabilizeScores: VAR / feed-flicker debounce ----
console.log("--- 6. Score-decrease debounce ---");
{
  const pending = {};
  // Increase passes through immediately
  let out = stabilizeScores(
    { m1: { homeScore: 1, awayScore: 0, status: "IN_PLAY" } },
    { m1: { homeScore: 2, awayScore: 0, status: "IN_PLAY", minute: 70 } },
    pending,
  );
  assert(out.m1.homeScore === 2, "increase accepted immediately");

  // First decrease is held (previous score kept, fresh minute kept)
  out = stabilizeScores(
    { m1: { homeScore: 2, awayScore: 0, status: "IN_PLAY" } },
    { m1: { homeScore: 1, awayScore: 0, status: "IN_PLAY", minute: 72 } },
    pending,
  );
  assert(out.m1.homeScore === 2, "first decrease held (VAR debounce)");
  assert(out.m1.minute === 72, "held decrease still carries fresh minute");

  // Second consecutive agreement accepts the decrease
  out = stabilizeScores(
    { m1: { homeScore: 2, awayScore: 0, status: "IN_PLAY" } },
    { m1: { homeScore: 1, awayScore: 0, status: "IN_PLAY", minute: 73 } },
    pending,
  );
  assert(out.m1.homeScore === 1, "second agreeing poll accepts decrease");

  // Flicker: decrease then back up clears the pending candidate
  const pending2 = {};
  stabilizeScores(
    { m2: { homeScore: 2, awayScore: 1 } },
    { m2: { homeScore: 1, awayScore: 1 } },
    pending2,
  );
  stabilizeScores(
    { m2: { homeScore: 2, awayScore: 1 } },
    { m2: { homeScore: 2, awayScore: 1 } },
    pending2,
  );
  assert(!pending2.m2, "flicker back up clears pending decrease");
}

// ---- 7. Daily points: Israel-date filtering + engine parity ----
console.log("--- 7. computeDailyFormPoints ---");
{
  // Build a real two-matches-same-day fixture set from the schedule.
  const byDay = {};
  for (const m of groupMatches) {
    const k = getMatchIsraelDateKey(m);
    (byDay[k] = byDay[k] || []).push(m);
  }
  const dayKey = Object.keys(byDay).find((k) => byDay[k].length >= 2);
  const [mA, mB] = byDay[dayKey];
  const otherDayKey = Object.keys(byDay).find((k) => k !== dayKey);
  const mC = byDay[otherDayKey][0];

  const results = {
    [mA.id]: { homeScore: 2, awayScore: 1, stage: "group" },
    [mB.id]: { homeScore: 0, awayScore: 0, stage: "group" },
    [mC.id]: { homeScore: 3, awayScore: 0, stage: "group" },
  };
  const formMatches = {
    [mA.id]: { homeScore: 2, awayScore: 1 }, // exact: 1+3 = 4
    [mB.id]: { homeScore: 1, awayScore: 1 }, // outcome: 1
    [mC.id]: { homeScore: 3, awayScore: 0 }, // exact but OTHER day — excluded
  };
  const day = computeDailyFormPoints({ formMatches, results, dateKey: dayKey });
  assert(day.points === 5, `same-day points = 5 (got ${day.points})`);
  assert(day.exactCount === 1 && day.outcomeCount === 1, "exact/outcome counts");
  assert(day.playedCount === 2, "playedCount counts only that day's finished matches");

  const other = computeDailyFormPoints({ formMatches, results, dateKey: otherDayKey });
  assert(other.points === 4 && other.playedCount === 1, "other-day match scores on ITS day");

  const noDay = computeDailyFormPoints({ formMatches, results, dateKey: "1999-01-01" });
  assert(noDay.points === 0 && noDay.playedCount === 0, "day without matches -> zeros");
}

// ---- 8. israelDateKeyForNow: UTC evening crosses to next Israel day ----
console.log("--- 8. Israel date key ---");
{
  assert(israelDateKeyForNow(Date.UTC(2026, 5, 12, 21, 30)) === "2026-06-13",
    "21:30 UTC = 00:30 IDT next day");
  assert(israelDateKeyForNow(Date.UTC(2026, 5, 12, 12, 0)) === "2026-06-12",
    "midday UTC stays same Israel day");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
