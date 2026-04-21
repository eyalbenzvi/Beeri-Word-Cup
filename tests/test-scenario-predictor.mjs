// ============================================================
// SCENARIO PREDICTOR — champion/runner-up auto-fill
// ============================================================
// Covers:
//   1. BRACKET_SIDE_MAP matches the expected FIFA 2026 bracket layout.
//   2. 1st and 2nd of every group land on opposite sides of the bracket.
//   3. pickGroupPositions always returns a pair on opposite sides.
//   4. predictScenario: chosen champion finishes the final as winner.
//   5. predictScenario: chosen runner-up is the final's loser.
//   6. Existing predictions are preserved verbatim.
//   7. Same-group finalists still meet only in the final.
//   8. pickTopScorerForTeam returns a player from the champion's squad.
//   9. Generated form has full scores + valid advancingTeam on ties.
// ============================================================

import {
  BRACKET_SIDE_MAP,
  pickGroupPositions,
  predictScenario,
  pickTopScorerForTeam,
} from "/home/user/Beeri-World-Cup/src/utils/scenarioPredictor.js";
import { GROUPS } from "/home/user/Beeri-World-Cup/src/data/teams.js";
import {
  groupMatches,
  knockoutMatches,
} from "/home/user/Beeri-World-Cup/src/data/matches.js";
import { calcBracketTeams, deriveChampion, calcGroupStandings } from "/home/user/Beeri-World-Cup/src/utils/bracket.js";
import { TOP_SCORER_PLAYERS } from "/home/user/Beeri-World-Cup/src/data/players.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

console.log("=== SCENARIO PREDICTOR TESTS ===");

// ============================================================
// 1. BRACKET_SIDE_MAP correctness
// ============================================================
section("1. BRACKET_SIDE_MAP — every group has 24 positions on correct sides");
{
  const expected = {
    "1A": "bottom", "2A": "top",
    "1B": "bottom", "2B": "top",
    "1C": "bottom", "2C": "top",
    "1D": "top",    "2D": "bottom",
    "1E": "top",    "2E": "bottom",
    "1F": "top",    "2F": "bottom",
    "1G": "top",    "2G": "bottom",
    "1H": "top",    "2H": "bottom",
    "1I": "top",    "2I": "bottom",
    "1J": "bottom", "2J": "top",
    "1K": "bottom", "2K": "top",
    "1L": "bottom", "2L": "top",
  };
  for (const [pos, side] of Object.entries(expected)) {
    assert(
      BRACKET_SIDE_MAP[pos] === side,
      `${pos} expected ${side}, got ${BRACKET_SIDE_MAP[pos]}`,
    );
  }
}

// ============================================================
// 2. 1st and 2nd of each group are always on opposite sides
// ============================================================
section("2. 1st and 2nd of each group on opposite bracket sides");
{
  for (const g of Object.keys(GROUPS)) {
    const s1 = BRACKET_SIDE_MAP[`1${g}`];
    const s2 = BRACKET_SIDE_MAP[`2${g}`];
    assert(
      s1 && s2 && s1 !== s2,
      `Group ${g}: 1=${s1}, 2=${s2} — must be opposite`,
    );
  }
}

// ============================================================
// 3. pickGroupPositions always yields opposite-side pair
// ============================================================
section("3. pickGroupPositions returns opposite-side pair for all group pairs");
{
  const groupKeys = Object.keys(GROUPS);
  for (const gC of groupKeys) {
    for (const gR of groupKeys) {
      const { champion, runnerUp } = pickGroupPositions(gC, gR);
      if (gC === gR) {
        assert(
          champion === 1 && runnerUp === 2,
          `Same group ${gC}: expected (1,2), got (${champion},${runnerUp})`,
        );
        const sC = BRACKET_SIDE_MAP[`${champion}${gC}`];
        const sR = BRACKET_SIDE_MAP[`${runnerUp}${gR}`];
        assert(sC !== sR, `Same group ${gC}: sides equal (${sC})`);
      } else {
        const sC = BRACKET_SIDE_MAP[`${champion}${gC}`];
        const sR = BRACKET_SIDE_MAP[`${runnerUp}${gR}`];
        assert(
          sC !== sR,
          `Groups ${gC}+${gR}: positions (${champion},${runnerUp}) landed same side (${sC})`,
        );
      }
    }
  }
}

// ============================================================
// 4. predictScenario — random sample of (champion, runnerUp) pairs
//    works end-to-end: the selected champion wins the final.
// ============================================================
section("4. predictScenario: champion wins final for a sample of pairs");
{
  const allCodes = Object.values(GROUPS).flat().map((t) => t.code);
  const samplePairs = [];
  // Curated sample covering different group combinations
  const pairs = [
    ["ARG", "FRA"], // J, I
    ["BRA", "ENG"], // C, L
    ["ESP", "GER"], // H, E
    ["NED", "POR"], // F, K
    ["USA", "MEX"], // D, A
    ["BEL", "CRO"], // G, L
    ["CAN", "MAR"], // B, C
    ["HAI", "CUR"], // C, E (low-ranked champ)
    ["NZL", "KSA"], // G, H
    ["JOR", "GHA"], // J, L
  ];
  for (const [c, r] of pairs) {
    if (allCodes.includes(c) && allCodes.includes(r)) samplePairs.push([c, r]);
  }
  // Add some same-group pairs
  for (const g of ["A", "F", "J"]) {
    const teams = GROUPS[g];
    samplePairs.push([teams[0].code, teams[1].code]);
  }

  for (const [champ, runner] of samplePairs) {
    const preds = predictScenario(champ, runner, groupMatches, knockoutMatches, calcBracketTeams);
    const bracket = calcBracketTeams(preds);
    const finalTeams = bracket["F-1"];
    const champ2 = deriveChampion(preds, bracket);

    assert(
      champ2 === champ,
      `${champ} vs ${runner}: expected champion=${champ}, got ${champ2} (final: ${finalTeams?.home} vs ${finalTeams?.away})`,
    );
    assert(
      (finalTeams?.home === runner) || (finalTeams?.away === runner),
      `${champ} vs ${runner}: runner-up ${runner} not in the final (${finalTeams?.home}/${finalTeams?.away})`,
    );
  }
}

// ============================================================
// 5. Every prediction has numeric scores, knockout ties have advancingTeam
// ============================================================
section("5. Generated form is complete and valid");
{
  const preds = predictScenario("ARG", "FRA", groupMatches, knockoutMatches, calcBracketTeams);
  const bracket = calcBracketTeams(preds);

  for (const m of groupMatches) {
    const p = preds[m.id];
    assert(
      typeof p?.homeScore === "number" && typeof p?.awayScore === "number",
      `Group match ${m.id}: missing numeric scores`,
    );
  }
  for (const m of knockoutMatches) {
    const p = preds[m.id];
    assert(
      typeof p?.homeScore === "number" && typeof p?.awayScore === "number",
      `Knockout ${m.id}: missing numeric scores`,
    );
    if (p.homeScore === p.awayScore) {
      const t = bracket[m.id];
      assert(
        p.advancingTeam === t?.home || p.advancingTeam === t?.away,
        `Knockout ${m.id}: tie without valid advancingTeam (home=${t?.home}, away=${t?.away}, got=${p.advancingTeam})`,
      );
    }
  }
}

// ============================================================
// 6. Existing predictions are preserved verbatim
// ============================================================
section("6. Existing predictions preserved");
{
  const firstGroupMatch = groupMatches[0];
  const existing = {
    [firstGroupMatch.id]: { homeScore: 5, awayScore: 3 },
  };
  const preds = predictScenario("ARG", "FRA", groupMatches, knockoutMatches, calcBracketTeams, existing);
  assert(
    preds[firstGroupMatch.id].homeScore === 5 && preds[firstGroupMatch.id].awayScore === 3,
    `Existing group prediction not preserved: got ${JSON.stringify(preds[firstGroupMatch.id])}`,
  );
  assert(
    preds[firstGroupMatch.id] !== existing[firstGroupMatch.id],
    "Existing prediction returned as fresh copy (not same reference)",
  );
}

// ============================================================
// 7. Same-group case — they land opposite sides and meet only in final
// ============================================================
section("7. Same-group finalists meet only in the final");
{
  // Group A: MEX, RSA, KOR, CZE
  const preds = predictScenario("MEX", "KOR", groupMatches, knockoutMatches, calcBracketTeams);
  const bracket = calcBracketTeams(preds);
  const standings = calcGroupStandings(preds);
  const groupA = standings["A"];
  assert(groupA[0].code === "MEX", `MEX should be 1st in A, got ${groupA[0].code}`);
  assert(groupA[1].code === "KOR", `KOR should be 2nd in A, got ${groupA[1].code}`);

  // Walk every knockout stage before F-1 and confirm MEX vs KOR doesn't happen
  for (const m of knockoutMatches) {
    if (m.stage === "F") continue;
    const teams = bracket[m.id];
    if (!teams) continue;
    const hasBoth =
      (teams.home === "MEX" && teams.away === "KOR") ||
      (teams.home === "KOR" && teams.away === "MEX");
    assert(!hasBoth, `Finalists met in ${m.id} before the final`);
  }

  const champ = deriveChampion(preds, bracket);
  assert(champ === "MEX", `Same-group champion expected MEX, got ${champ}`);
}

// ============================================================
// 8. pickTopScorerForTeam
// ============================================================
section("8. Top scorer selected from champion's squad");
{
  // Pick a team known to have players in the list
  const player = pickTopScorerForTeam("ARG", TOP_SCORER_PLAYERS);
  assert(player !== null, "pickTopScorerForTeam returned null");
  assert(player?.team === "ARG", `Expected team ARG, got ${player?.team}`);

  // Team with players (random sampling)
  for (const team of ["BRA", "ENG", "ESP", "FRA", "GER"]) {
    const p = pickTopScorerForTeam(team, TOP_SCORER_PLAYERS);
    assert(p?.team === team, `Team ${team}: got player from ${p?.team}`);
  }

  // Fallback for bogus team
  const fallback = pickTopScorerForTeam("XYZ", TOP_SCORER_PLAYERS);
  assert(fallback !== null, "Fallback for unknown team returned null");
  assert(
    typeof fallback?.name === "string",
    "Fallback player has no name",
  );
}

// ============================================================
// 9. Stress test — 50 random scenarios, champion always wins
// ============================================================
section("9. Stress test: 50 random (champion, runnerUp) pairs — champion always wins");
{
  const allCodes = Object.values(GROUPS).flat().map((t) => t.code);
  let okCount = 0;
  const failedPairs = [];
  for (let i = 0; i < 50; i++) {
    const c = allCodes[Math.floor(Math.random() * allCodes.length)];
    let r = allCodes[Math.floor(Math.random() * allCodes.length)];
    while (r === c) r = allCodes[Math.floor(Math.random() * allCodes.length)];

    const preds = predictScenario(c, r, groupMatches, knockoutMatches, calcBracketTeams);
    const bracket = calcBracketTeams(preds);
    const champ = deriveChampion(preds, bracket);
    if (champ === c) {
      okCount++;
    } else {
      failedPairs.push(`${c} vs ${r} -> ${champ}`);
    }
  }
  assert(
    okCount === 50,
    `Stress: ${okCount}/50 scenarios produced correct champion. Failures: ${failedPairs.slice(0, 5).join("; ")}`,
  );
}

// ============================================================
// Summary
// ============================================================
console.log("\n=== SUMMARY ===");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
