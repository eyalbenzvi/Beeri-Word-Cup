// ============================================================
// AI TOP SCORER SELECTION — striker filter + champion anchoring
// ============================================================
// Covers:
//   1. Every one of the 48 teams has >= 1 striker-flagged player.
//   2. pickTopScorerForTeam returns only striker-flagged players when team
//      has them (never a GK/defender that lacks the flag).
//   3. pickTopScorerForTeam is always tied to the requested team.
//   4. getPredictedChampion returns the team that wins the F-1 match per
//      the FIFA predictor's output.
//   5. AI fill (no scenario): over many trials, the chosen top scorer
//      always belongs to the squad of the predicted champion.
//   6. Scenario fill: over many trials, the chosen top scorer always
//      belongs to the requested champion's squad.
//   7. Admin custom list fallback: if no player in the list has the
//      striker flag, we still return a player from the team (backwards
//      compat for custom admin-uploaded lists).
// ============================================================

import {
  predictAllMatches,
  getPredictedChampion,
} from "/home/user/Beeri-World-Cup/src/utils/fifaPredictor.js";
import {
  predictScenario,
  pickTopScorerForTeam,
} from "/home/user/Beeri-World-Cup/src/utils/scenarioPredictor.js";
import { TOP_SCORER_PLAYERS } from "/home/user/Beeri-World-Cup/src/data/players.js";
import { GROUPS } from "/home/user/Beeri-World-Cup/src/data/teams.js";
import {
  groupMatches,
  knockoutMatches,
} from "/home/user/Beeri-World-Cup/src/data/matches.js";
import { calcBracketTeams } from "/home/user/Beeri-World-Cup/src/utils/bracket.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

console.log("=== AI TOP SCORER SELECTION TESTS ===");

// Collect all team codes from GROUPS (authoritative list of 48 teams)
const ALL_TEAMS = [];
for (const groupTeams of Object.values(GROUPS)) {
  for (const t of groupTeams) ALL_TEAMS.push(t.code);
}

// ============================================================
// 1. Every team has >= 1 striker-flagged player
// ============================================================
section("1. Striker coverage — every team has >= 1 flagged attacker");
{
  assert(ALL_TEAMS.length === 48, `Expected 48 teams, got ${ALL_TEAMS.length}`);
  for (const team of ALL_TEAMS) {
    const strikers = TOP_SCORER_PLAYERS.filter((p) => p.team === team && p.striker === true);
    assert(strikers.length >= 1, `Team ${team} has no striker-flagged players`);
  }
  const totalStrikers = TOP_SCORER_PLAYERS.filter((p) => p.striker === true).length;
  console.log(`  (${totalStrikers} striker-flagged players across 48 teams)`);
}

// ============================================================
// 2. pickTopScorerForTeam returns only striker-flagged players
// ============================================================
section("2. pickTopScorerForTeam — returns only striker-flagged players");
{
  for (const team of ALL_TEAMS) {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const p = pickTopScorerForTeam(team, TOP_SCORER_PLAYERS);
      assert(p !== null, `pickTopScorerForTeam(${team}) returned null`);
      assert(p.team === team, `Picked player ${p.name} is not from ${team}`);
      assert(p.striker === true, `Picked ${p.name} for ${team} lacks striker flag`);
      seen.add(p.name);
    }
    // With >= 1 striker and 50 trials, we should see at least one pick
    assert(seen.size >= 1, `No pick returned for ${team}`);
  }
}

// ============================================================
// 3. getPredictedChampion — resolves the AI-picked champion
// ============================================================
section("3. getPredictedChampion — derives champion from F-1 prediction");
{
  for (let trial = 0; trial < 20; trial++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {});
    const champion = getPredictedChampion(allPreds, calcBracketTeams);
    assert(!!champion, `Trial ${trial}: getPredictedChampion returned null`);
    assert(ALL_TEAMS.includes(champion), `Trial ${trial}: champion ${champion} is not a known team code`);

    // Cross-check: champion matches the F-1 winner
    const bracket = calcBracketTeams(allPreds);
    const f = bracket["F-1"];
    const pred = allPreds["F-1"];
    const expectedWinner =
      pred.homeScore > pred.awayScore ? f.home
      : pred.awayScore > pred.homeScore ? f.away
      : pred.advancingTeam;
    assert(champion === expectedWinner, `Trial ${trial}: ${champion} != F-1 winner ${expectedWinner}`);
  }

  // Edge case: missing F-1 prediction returns null (not crash)
  const bad = getPredictedChampion({}, calcBracketTeams);
  assert(bad === null, "getPredictedChampion with empty preds returned non-null");

  // Edge case: bad inputs return null
  assert(getPredictedChampion(null, calcBracketTeams) === null, "null preds should return null");
  assert(getPredictedChampion({}, null) === null, "null calcBracketTeams should return null");
}

// ============================================================
// 4. AI fill: chosen top scorer comes from predicted champion
// ============================================================
section("4. AI fill (no scenario) — top scorer belongs to predicted champion");
{
  let mismatches = 0;
  const TRIALS = 50;
  for (let i = 0; i < TRIALS; i++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {});
    const champion = getPredictedChampion(allPreds, calcBracketTeams);
    const player = pickTopScorerForTeam(champion, TOP_SCORER_PLAYERS);
    assert(!!player, `Trial ${i}: no player returned for champion ${champion}`);
    if (player.team !== champion) mismatches++;
    assert(player.striker === true, `Trial ${i}: picked player ${player.name} is not a striker`);
  }
  assert(mismatches === 0, `${mismatches}/${TRIALS} AI fills picked a player from the wrong team`);
}

// ============================================================
// 5. Scenario fill: top scorer comes from chosen champion
// ============================================================
section("5. Scenario fill — top scorer belongs to chosen champion team");
{
  const scenarios = [
    ["FRA", "BRA"],
    ["ARG", "ENG"],
    ["ESP", "POR"],
    ["GER", "NED"],
    ["CRO", "MAR"],
    ["USA", "MEX"],
    ["JPN", "KOR"],
    ["BEL", "URU"],
  ];
  for (const [champ, runner] of scenarios) {
    const allPreds = predictScenario(champ, runner, groupMatches, knockoutMatches, calcBracketTeams, {});
    assert(!!allPreds, `Scenario ${champ}/${runner}: predictScenario returned null`);

    // The F-1 winner should be the chosen champion
    const bracket = calcBracketTeams(allPreds);
    const f = bracket["F-1"];
    const pred = allPreds["F-1"];
    const winner =
      pred.homeScore > pred.awayScore ? f.home
      : pred.awayScore > pred.homeScore ? f.away
      : pred.advancingTeam;
    assert(winner === champ, `Scenario ${champ}/${runner}: F-1 winner ${winner} != chosen champion`);

    // Pick top scorer many times for this champion — all must be from champ's squad
    for (let i = 0; i < 20; i++) {
      const player = pickTopScorerForTeam(champ, TOP_SCORER_PLAYERS);
      assert(player.team === champ, `Scenario ${champ}/${runner}: picked ${player.name} from ${player.team}`);
      assert(player.striker === true, `Scenario ${champ}/${runner}: ${player.name} lacks striker flag`);
    }
  }
}

// ============================================================
// 6. Admin custom list without striker flag — falls back gracefully
// ============================================================
section("6. Custom list without striker flags — falls back to team squad");
{
  // Simulate an admin-uploaded list that omits the striker flag
  const customList = TOP_SCORER_PLAYERS.map(({ team, name, nameHe }) => ({ team, name, nameHe }));
  for (let i = 0; i < 20; i++) {
    const p = pickTopScorerForTeam("FRA", customList);
    assert(p !== null, "Custom list: pickTopScorerForTeam returned null");
    assert(p.team === "FRA", `Custom list: picked ${p.name} from ${p.team}, expected FRA`);
  }
}

// ============================================================
// 7. Empty / invalid list handling
// ============================================================
section("7. Edge cases — empty/invalid player list");
{
  assert(pickTopScorerForTeam("FRA", []) === null, "Empty list should return null");
  assert(pickTopScorerForTeam("FRA", null) === null, "null list should return null");
  assert(pickTopScorerForTeam("FRA", undefined) === null, "undefined list should return null");
  // Team not in list with only one other team — falls back to that team (legacy safety)
  const twoPlayers = [
    { team: "XYZ", name: "Stranger A", nameHe: "זר א", striker: true },
  ];
  const p = pickTopScorerForTeam("FRA", twoPlayers);
  assert(p !== null, "Last-resort fallback returned null when list has players");
}

// ============================================================
// Summary
// ============================================================
console.log(`\n=== SUMMARY ===`);
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const f of failures.slice(0, 20)) console.log(`  - ${f}`);
  if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
}
process.exit(failed > 0 ? 1 : 0);
