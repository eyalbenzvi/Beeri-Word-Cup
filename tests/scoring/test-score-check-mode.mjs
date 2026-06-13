// Tests for the simulator's "score check" mode.
//
// Score-check mode scores ONLY the matches the user entered (every other match
// blank), while still resolving knockout matchups from the real results and
// excluding advancing/champion/top-scorer bonuses. The leaderboard then shows
// exactly the points each form earned on the entered matches.
//
// useLeaderboardComputed wires this by calling:
//   calculateFullScore(form, enteredResults, {} /*advancing*/,
//                       { champion:null, topScorers:[] } /*bonuses*/,
//                       predBracket, realActualBracket)
// These tests pin that contract at the pure-function level, plus a static
// audit that the hook + SimulatorPanel are actually wired this way.

import fs from "node:fs";
import {
  POINTS,
  BONUSES,
  calculateFullScore,
} from "/home/user/Beeri-World-Cup/src/utils/scoring.js";

let passed = 0,
  failed = 0;
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

const EMPTY_BONUSES = { champion: null, topScorers: [] };

console.log("=== SCORE CHECK MODE TESTS ===\n");

// ---- A. Only entered matches are scored ----
console.log("--- A. scope = entered matches only ---");
{
  const form = {
    matches: {
      "group-A-1": { homeScore: 2, awayScore: 0 }, // predict home win
      "group-A-2": { homeScore: 1, awayScore: 1 }, // predict draw (correct vs reality below, but NOT entered)
    },
  };
  // Only group-A-1 is "entered". group-A-2 has a (correct) prediction but is
  // out of scope and must not contribute.
  const entered = {
    "group-A-1": { homeScore: 3, awayScore: 1, stage: "group" }, // home win -> outcome only
  };
  const score = calculateFullScore(form, entered, {}, EMPTY_BONUSES, {}, {});
  assert(
    score.totalPoints === POINTS.group.outcome,
    `entered-only total should be ${POINTS.group.outcome}, got ${score.totalPoints}`,
  );
  assert(
    Object.keys(score.matchScores).length === 1 &&
      "group-A-1" in score.matchScores,
    "only the entered match should appear in matchScores",
  );
  assert(
    !("group-A-2" in score.matchScores),
    "an out-of-scope match with a correct prediction must not be scored",
  );
}

// ---- B. Empty scope => zero for everyone ----
console.log("--- B. empty scope -> 0 ---");
{
  const form = {
    matches: { "group-A-1": { homeScore: 1, awayScore: 0 } },
    champion: "ARG",
    advancing: { R32: ["ARG"] },
  };
  const score = calculateFullScore(form, {}, {}, EMPTY_BONUSES, {}, {});
  assert(score.totalPoints === 0, `empty scope total should be 0, got ${score.totalPoints}`);
}

// ---- C. Bonuses excluded (champion / top scorer) ----
console.log("--- C. champion + top-scorer bonuses excluded ---");
{
  const form = {
    matches: {},
    champion: "ARG",
    topScorer: "Messi",
  };
  // With real bonuses the champion + top scorer would add points...
  const withBonuses = calculateFullScore(
    form,
    {},
    {},
    { champion: "ARG", topScorers: ["Messi"] },
    {},
    {},
  );
  assert(
    withBonuses.totalPoints === BONUSES.champion + BONUSES.topScorer,
    `sanity: full bonuses should be ${BONUSES.champion + BONUSES.topScorer}, got ${withBonuses.totalPoints}`,
  );
  // ...but score-check mode passes empty bonuses, so they must not count.
  const noBonuses = calculateFullScore(form, {}, {}, EMPTY_BONUSES, {}, {});
  assert(
    noBonuses.totalPoints === 0,
    `score-check must exclude champion+topScorer bonuses, got ${noBonuses.totalPoints}`,
  );
  assert(
    noBonuses.correctChampion === false && noBonuses.correctTopScorer === false,
    "score-check must not flag champion/top-scorer as correct",
  );
}

// ---- D. Advancing points excluded ----
console.log("--- D. advancing-team points excluded ---");
{
  const form = { matches: {}, advancing: { R32: ["ARG"] } };
  // Sanity: with a populated advancing map the team scores advancing points.
  const withAdvancing = calculateFullScore(
    form,
    {},
    { R32: ["ARG"] },
    EMPTY_BONUSES,
    {},
    {},
  );
  assert(
    withAdvancing.totalPoints === POINTS.group.advancing,
    `sanity: R32 advancing should add ${POINTS.group.advancing}, got ${withAdvancing.totalPoints}`,
  );
  // Score-check mode passes an empty advancing map -> no advancing points.
  const noAdvancing = calculateFullScore(form, {}, {}, EMPTY_BONUSES, {}, {});
  assert(
    noAdvancing.totalPoints === 0,
    `score-check must exclude advancing points, got ${noAdvancing.totalPoints}`,
  );
}

// ---- E. Knockout matchup still validated against REAL bracket ----
console.log("--- E. knockout matchup validation in scoped mode ---");
{
  const entered = {
    "r32-1": { homeScore: 2, awayScore: 1, stage: "R32" }, // home win
  };
  // Real matchup at this slot is ARG vs BRA.
  const actualBracket = { "r32-1": { home: "ARG", away: "BRA" } };

  // Form predicted the right teams AND a home win -> outcome points.
  const rightForm = { matches: { "r32-1": { homeScore: 1, awayScore: 0 } } };
  const rightBracket = { "r32-1": { home: "ARG", away: "BRA" } };
  const right = calculateFullScore(
    rightForm,
    entered,
    {},
    EMPTY_BONUSES,
    rightBracket,
    actualBracket,
  );
  assert(
    right.totalPoints === POINTS.R32.outcome,
    `correct matchup + outcome should score ${POINTS.R32.outcome}, got ${right.totalPoints}`,
  );

  // Form predicted the wrong opponent in this slot -> wrong matchup -> 0.
  const wrongForm = { matches: { "r32-1": { homeScore: 1, awayScore: 0 } } };
  const wrongBracket = { "r32-1": { home: "ARG", away: "FRA" } };
  const wrong = calculateFullScore(
    wrongForm,
    entered,
    {},
    EMPTY_BONUSES,
    wrongBracket,
    actualBracket,
  );
  assert(
    wrong.totalPoints === 0,
    `wrong knockout matchup must score 0, got ${wrong.totalPoints}`,
  );
  assert(
    wrong.matchScores["r32-1"]?.wrongMatchup === true,
    "wrong matchup must be flagged",
  );
}

// ---- F. Exact-score points still awarded inside scope ----
console.log("--- F. exact score within scope ---");
{
  const form = { matches: { "group-A-1": { homeScore: 2, awayScore: 1 } } };
  const entered = { "group-A-1": { homeScore: 2, awayScore: 1, stage: "group" } };
  const score = calculateFullScore(form, entered, {}, EMPTY_BONUSES, {}, {});
  assert(
    score.totalPoints === POINTS.group.outcome + POINTS.group.exactScore,
    `exact score should be ${POINTS.group.outcome + POINTS.group.exactScore}, got ${score.totalPoints}`,
  );
  assert(score.exactScoreCount === 1, "exactScoreCount should be 1");
}

// ---- G. Static wiring audit ----
console.log("--- G. hook + SimulatorPanel wiring ---");
{
  const hook = fs.readFileSync(
    "/home/user/Beeri-World-Cup/src/hooks/useLeaderboardComputed.ts",
    "utf8",
  );
  assert(
    /bracketResults/.test(hook),
    "useLeaderboardComputed accepts a bracketResults option",
  );
  assert(
    /matchPointsOnly/.test(hook),
    "useLeaderboardComputed accepts a matchPointsOnly option",
  );
  assert(
    /options\?\.bracketResults\s*\?\?\s*results/.test(hook),
    "bracketResults defaults to results (backward compatible)",
  );
  assert(
    /matchPointsOnly\s*\?\s*EMPTY_ADVANCING\s*:\s*actualDerivedAdvancing/.test(
      hook,
    ),
    "matchPointsOnly excludes advancing points",
  );
  assert(
    /matchPointsOnly[\s\S]{0,40}EMPTY_BONUSES/.test(hook),
    "matchPointsOnly excludes bonuses",
  );

  const panel = fs.readFileSync(
    "/home/user/Beeri-World-Cup/src/components/SimulatorPanel.tsx",
    "utf8",
  );
  assert(/scoreCheckMode/.test(panel), "SimulatorPanel has scoreCheckMode");
  assert(
    /matchPointsOnly:\s*true/.test(panel),
    "SimulatorPanel enables matchPointsOnly in score-check mode",
  );
  assert(
    /bracketResults:\s*realResults/.test(panel),
    "SimulatorPanel resolves matchups from real results in score-check mode",
  );
  // Score-check scope must be the entered overrides, not the merged results.
  assert(
    /scoreCheckMode\s*\?\s*override\s*:\s*effectiveResults/.test(panel),
    "score-check leaderboard is scoped to entered overrides",
  );
  // Switching modes must clear entered results (cross-mode metadata safety).
  assert(
    /switchMode[\s\S]{0,160}setOverride\(\{\}\)/.test(panel),
    "switching modes clears entered overrides",
  );
}

console.log(
  `\n=== SCORE CHECK MODE: ${passed} passed, ${failed} failed ===`,
);
if (failed > 0) {
  console.error("\nFailures:\n - " + failures.join("\n - "));
  process.exit(1);
}
