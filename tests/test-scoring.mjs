// Test scoring logic
import { POINTS, BONUSES, calculateMatchPoints, calculateFullScore, compareTiebreaker } from '/home/user/Beeri-World-Cup/src/utils/scoring.js';
import { SCORING_DATA } from '/home/user/Beeri-World-Cup/src/constants/scoring.js';

let passed = 0, failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

console.log("=== SCORING LOGIC TESTS ===\n");

// ---- 1. SCORING_DATA vs POINTS consistency ----
console.log("--- 1. SCORING_DATA vs POINTS consistency ---");
const stageMap = {
  "בתים": "group",
  "שלב ה-32": "R32",
  "שמינית גמר": "R16",
  "רבע גמר": "QF",
  "חצי גמר": "SF",
  "מקום שלישי": "3RD",
  "גמר": "F",
};

for (const [label, outcome, exact, advancing] of SCORING_DATA) {
  const stageKey = stageMap[label];
  if (!stageKey) { assert(false, `Unknown stage label: ${label}`); continue; }
  const pts = POINTS[stageKey];
  assert(pts.outcome === outcome, `${label}: outcome ${pts.outcome} !== ${outcome}`);
  assert(pts.exactScore === exact, `${label}: exactScore ${pts.exactScore} !== ${exact}`);
  if (advancing !== null) {
    assert(pts.advancing === advancing, `${label}: advancing ${pts.advancing} !== ${advancing}`);
  } else {
    assert(pts.advancing === 0, `${label}: advancing should be 0, got ${pts.advancing}`);
  }
}

// ---- 2. calculateMatchPoints tests ----
console.log("--- 2. calculateMatchPoints ---");

// 2a. No prediction
let r = calculateMatchPoints(null, { homeScore: 1, awayScore: 0 }, "group");
assert(r.points === 0 && r.breakdown === "טרם שוחק", "No prediction should return 0 points");

// 2b. No actual result
r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: null, awayScore: null }, "group");
assert(r.points === 0 && r.breakdown === "טרם שוחק", "No actual result should return 0 points");

// 2c. Missing prediction scores
r = calculateMatchPoints({ homeScore: null, awayScore: null }, { homeScore: 1, awayScore: 0 }, "group");
assert(r.points === 0 && r.breakdown === "אין ניחוש", "Null prediction scores -> אין ניחוש");

// 2d. Group stage - correct outcome only (home win)
r = calculateMatchPoints({ homeScore: 2, awayScore: 0 }, { homeScore: 1, awayScore: 0, stage: "group" }, "group");
assert(r.points === 1 && r.outcomePoints === 1 && r.exactPoints === 0, `Group correct outcome: expected 1, got ${r.points}`);

// 2e. Group stage - exact score
r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: 1, awayScore: 0, stage: "group" }, "group");
assert(r.points === 4 && r.outcomePoints === 1 && r.exactPoints === 3, `Group exact score: expected 4 (1+3), got ${r.points}`);

// 2f. Group stage - wrong outcome
r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: 0, awayScore: 1, stage: "group" }, "group");
assert(r.points === 0, `Group wrong outcome: expected 0, got ${r.points}`);

// 2g. Group stage - draw predicted, draw actual, different scores
r = calculateMatchPoints({ homeScore: 1, awayScore: 1 }, { homeScore: 0, awayScore: 0, stage: "group" }, "group");
assert(r.points === 1 && r.exactPoints === 0, `Group draw correct but not exact: expected 1, got ${r.points}`);

// 2h. Group stage - exact draw
r = calculateMatchPoints({ homeScore: 0, awayScore: 0 }, { homeScore: 0, awayScore: 0, stage: "group" }, "group");
assert(r.points === 4, `Group exact draw: expected 4, got ${r.points}`);

// 2i. R32 - correct outcome
r = calculateMatchPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 3, awayScore: 0, stage: "R32" }, "R32",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 3 && r.outcomePoints === 3, `R32 correct outcome: expected 3, got ${r.points}`);

// 2j. R32 - exact score
r = calculateMatchPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1, stage: "R32" }, "R32",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 6, `R32 exact score: expected 6 (3+3), got ${r.points}`);

// 2k. R16 - correct outcome
r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: 2, awayScore: 0, stage: "R16" }, "R16",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 5, `R16 correct outcome: expected 5, got ${r.points}`);

// 2l. QF - exact score
r = calculateMatchPoints({ homeScore: 3, awayScore: 2 }, { homeScore: 3, awayScore: 2, stage: "QF" }, "QF",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 10, `QF exact score: expected 10 (7+3), got ${r.points}`);

// 2m. SF - correct outcome
r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: 2, awayScore: 1, stage: "SF" }, "SF",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 9, `SF correct outcome: expected 9, got ${r.points}`);

// 2n. Final - exact score
r = calculateMatchPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1, stage: "F" }, "F",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 14, `Final exact score: expected 14 (11+3), got ${r.points}`);

// 2o. 3rd place - correct outcome
r = calculateMatchPoints({ homeScore: 2, awayScore: 0 }, { homeScore: 1, awayScore: 0, stage: "3RD" }, "3RD",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 9, `3rd place correct outcome: expected 9, got ${r.points}`);

// 2p. Knockout - wrong matchup
r = calculateMatchPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1, stage: "R32" }, "R32",
  { home: "BRA", away: "ARG" }, { home: "GER", away: "FRA" });
assert(r.points === 0 && r.wrongMatchup === true, `Wrong matchup should give 0 points`);

// 2q. Knockout - draw (both predict draw)
r = calculateMatchPoints({ homeScore: 1, awayScore: 1 }, { homeScore: 1, awayScore: 1, stage: "R32" }, "R32",
  { home: "BRA", away: "ARG" }, { home: "BRA", away: "ARG" });
assert(r.points === 6, `Knockout draw exact: expected 6 (3+3), got ${r.points}`);

// ---- 3. calculateFullScore tests ----
console.log("--- 3. calculateFullScore (full simulation) ---");

// Simulate a simple scenario: 2 group matches played
const userPredictions = {
  matches: {
    "group-A-1": { homeScore: 2, awayScore: 1 },
    "group-A-2": { homeScore: 0, awayScore: 0 },
  },
  advancing: { R32: ["MEX"] },
  champion: "BRA",
  topScorer: "Neymar",
};

const actualResults = {
  "group-A-1": { homeScore: 2, awayScore: 1, stage: "group" },
  "group-A-2": { homeScore: 1, awayScore: 1, stage: "group" },
};

const actualAdvancing = { R32: ["MEX", "BRA"] };
const actualBonuses = { champion: "BRA", topScorers: ["neymar", "Mbappe"] };

const score = calculateFullScore(userPredictions, actualResults, actualAdvancing, actualBonuses, {}, {});
// group-A-1: exact (4 pts), group-A-2: draw correct but not exact (1 pt) = 5 match pts
// advancing: MEX in R32 = 2 pts (group.advancing)
// champion: BRA correct = 9 pts
// top scorer: Neymar matches neymar (case insensitive) = 8 pts
// Total: 5 + 2 + 9 + 8 = 24
assert(score.totalPoints === 24, `Full score: expected 24, got ${score.totalPoints}`);
assert(score.exactScoreCount === 1, `Exact scores: expected 1, got ${score.exactScoreCount}`);
assert(score.outcomeCount === 2, `Outcomes: expected 2, got ${score.outcomeCount}`);
assert(score.correctChampion === true, `Champion should be correct`);
assert(score.correctTopScorer === true, `Top scorer should be correct (case insensitive)`);

// ---- 4. Top scorer case sensitivity ----
console.log("--- 4. Top scorer case sensitivity ---");
const s2 = calculateFullScore(
  { matches: {}, champion: null, topScorer: "NEYMAR" },
  {}, {}, { champion: null, topScorers: ["neymar"] }, {}, {}
);
assert(s2.correctTopScorer === true, `Top scorer should be case insensitive`);

const s3 = calculateFullScore(
  { matches: {}, champion: null, topScorer: " Neymar " },
  {}, {}, { champion: null, topScorers: ["neymar"] }, {}, {}
);
assert(s3.correctTopScorer === true, `Top scorer should trim whitespace`);

// ---- 5. Tiebreaker tests ----
console.log("--- 5. Tiebreaker (compareTiebreaker) ---");

// Equal everything
let tb = compareTiebreaker(
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: true, correctTopScorer: false, advancingPoints: { F: 0, SF: 0, QF: 0, R16: 0, R32: 0 } },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: true, correctTopScorer: false, advancingPoints: { F: 0, SF: 0, QF: 0, R16: 0, R32: 0 } }
);
assert(tb === 0, `Identical records should be tied (0), got ${tb}`);

// More exact scores wins
tb = compareTiebreaker(
  { exactScoreCount: 6, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: {} },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: {} }
);
assert(tb < 0, `More exact scores should win (negative), got ${tb}`);

// Fewer exact scores but more outcomes - exact scores first
tb = compareTiebreaker(
  { exactScoreCount: 3, outcomeCount: 20, correctChampion: false, correctTopScorer: false, advancingPoints: {} },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: {} }
);
assert(tb > 0, `B has more exact scores, B should win (positive), got ${tb}`);

// Same exact scores, more outcomes wins
tb = compareTiebreaker(
  { exactScoreCount: 5, outcomeCount: 15, correctChampion: false, correctTopScorer: false, advancingPoints: {} },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: {} }
);
assert(tb < 0, `More outcomes should win when exact scores tied, got ${tb}`);

// Correct champion breaks tie
tb = compareTiebreaker(
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: true, correctTopScorer: false, advancingPoints: {} },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: {} }
);
assert(tb < 0, `Correct champion should break tie (a wins), got ${tb}`);

// Correct top scorer breaks tie
tb = compareTiebreaker(
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: true, advancingPoints: {} },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: {} }
);
assert(tb < 0, `Correct top scorer should break tie, got ${tb}`);

// Final advancing points break tie
tb = compareTiebreaker(
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: { F: 10, SF: 0, QF: 0, R16: 0, R32: 0 } },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: { F: 0, SF: 0, QF: 0, R16: 0, R32: 0 } }
);
assert(tb < 0, `More teams in Final should break tie, got ${tb}`);

// SF breaks tie when F is equal
tb = compareTiebreaker(
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: { F: 0, SF: 10, QF: 0, R16: 0, R32: 0 } },
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: false, correctTopScorer: false, advancingPoints: { F: 0, SF: 0, QF: 0, R16: 0, R32: 0 } }
);
assert(tb < 0, `More teams in SF should break tie when F equal, got ${tb}`);

// Tiebreaker priority order: exact > outcomes > champion > topScorer > F > SF > QF > R16 > R32
// Test: champion true loses to more outcomes
tb = compareTiebreaker(
  { exactScoreCount: 5, outcomeCount: 10, correctChampion: true, correctTopScorer: false, advancingPoints: {} },
  { exactScoreCount: 5, outcomeCount: 15, correctChampion: false, correctTopScorer: false, advancingPoints: {} }
);
assert(tb > 0, `More outcomes should beat champion (outcomes is higher priority), got ${tb}`);

// ---- 6. Advancing points calculation ----
console.log("--- 6. Advancing points per round ---");

// R32 advancing uses group.advancing (2 pts)
const s6 = calculateFullScore(
  { matches: {}, advancing: { R32: ["BRA", "ARG"] }, champion: null, topScorer: "" },
  {}, { R32: ["BRA", "ARG", "GER"] }, { champion: null, topScorers: [] }, {}, {}
);
assert(s6.advancingPoints.R32 === 4, `R32 advancing: 2 correct * 2pts = 4, got ${s6.advancingPoints.R32}`);

// R16 advancing uses R32.advancing (4 pts)
const s7 = calculateFullScore(
  { matches: {}, advancing: { R16: ["BRA"] }, champion: null, topScorer: "" },
  {}, { R16: ["BRA", "ARG"] }, { champion: null, topScorers: [] }, {}, {}
);
assert(s7.advancingPoints.R16 === 4, `R16 advancing: 1 correct * 4pts = 4, got ${s7.advancingPoints.R16}`);

// QF advancing uses R16.advancing (6 pts)
const s8 = calculateFullScore(
  { matches: {}, advancing: { QF: ["BRA", "ARG"] }, champion: null, topScorer: "" },
  {}, { QF: ["BRA", "ARG"] }, { champion: null, topScorers: [] }, {}, {}
);
assert(s8.advancingPoints.QF === 12, `QF advancing: 2 correct * 6pts = 12, got ${s8.advancingPoints.QF}`);

// SF advancing uses QF.advancing (8 pts)
const s9 = calculateFullScore(
  { matches: {}, advancing: { SF: ["BRA"] }, champion: null, topScorer: "" },
  {}, { SF: ["BRA"] }, { champion: null, topScorers: [] }, {}, {}
);
assert(s9.advancingPoints.SF === 8, `SF advancing: 1 correct * 8pts = 8, got ${s9.advancingPoints.SF}`);

// F advancing uses SF.advancing (10 pts)
const s10 = calculateFullScore(
  { matches: {}, advancing: { F: ["BRA", "ARG"] }, champion: null, topScorer: "" },
  {}, { F: ["BRA", "ARG"] }, { champion: null, topScorers: [] }, {}, {}
);
assert(s10.advancingPoints.F === 20, `F advancing: 2 correct * 10pts = 20, got ${s10.advancingPoints.F}`);

// ---- 7. Advancing: wrong teams get 0 ----
console.log("--- 7. Advancing: wrong predictions ---");
const s11 = calculateFullScore(
  { matches: {}, advancing: { R32: ["XXX", "YYY"] }, champion: null, topScorer: "" },
  {}, { R32: ["BRA", "ARG"] }, { champion: null, topScorers: [] }, {}, {}
);
assert(s11.advancingPoints.R32 === 0, `Wrong advancing teams should give 0, got ${s11.advancingPoints.R32}`);

console.log(`\n=== SCORING RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(failed > 0 ? 1 : 0);
