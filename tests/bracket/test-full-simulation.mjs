// Full tournament simulation: test scoring end-to-end
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches, ALL_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcGroupStandings, calcBracketTeams, deriveAdvancingTeams, deriveActualAdvancing, deriveChampion } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { POINTS, BONUSES, calculateMatchPoints, calculateFullScore, compareTiebreaker } from '/home/user/Beeri-World-Cup/src/utils/scoring.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== FULL TOURNAMENT SIMULATION ===\n");

// ---- Setup: create "actual" results iteratively ----
console.log("--- Setting up actual results ---");
const matchPreds = {}; // prediction-format (homeScore/awayScore only)
const actualResults = {}; // result-format (includes stage)

// Group stage: seeded team (lower index) wins 2-0
for (const m of groupMatches) {
  const gTeams = GROUPS[m.group].map(t => t.code);
  const homeIdx = gTeams.indexOf(m.homeTeam);
  const awayIdx = gTeams.indexOf(m.awayTeam);
  const pred = homeIdx < awayIdx
    ? { homeScore: 2, awayScore: 0 }
    : { homeScore: 0, awayScore: 1 };
  matchPreds[m.id] = pred;
  actualResults[m.id] = { ...pred, stage: "group", group: m.group };
}

// Build bracket from group predictions
let bracket = calcBracketTeams(matchPreds);

// Fill knockout round by round (need to cascade)
const knockoutRounds = ["R32", "R16", "QF", "SF"];
for (const round of knockoutRounds) {
  for (const [id, teams] of Object.entries(bracket)) {
    if (id.startsWith(round + "-") && teams.home && teams.away && !matchPreds[id]) {
      matchPreds[id] = { homeScore: 1, awayScore: 0 };
      actualResults[id] = { homeScore: 1, awayScore: 0, stage: round, homeTeam: teams.home, awayTeam: teams.away };
    }
  }
  bracket = calcBracketTeams(matchPreds);
}

// 3RD and Final
for (const [id, teams] of Object.entries(bracket)) {
  if ((id === "3RD-1" || id === "F-1") && teams.home && teams.away && !matchPreds[id]) {
    const stage = id === "3RD-1" ? "3RD" : "F";
    matchPreds[id] = { homeScore: 1, awayScore: 0 };
    actualResults[id] = { homeScore: 1, awayScore: 0, stage, homeTeam: teams.home, awayTeam: teams.away };
  }
}

bracket = calcBracketTeams(matchPreds);
const actualAdvancing = deriveAdvancingTeams(bracket);
const actualChampion = deriveChampion(matchPreds, bracket);

assert(actualChampion !== null, `Actual champion: ${actualChampion}`);
console.log(`  Champion: ${actualChampion}`);
console.log(`  R32 teams: ${actualAdvancing.R32.length}, R16: ${actualAdvancing.R16.length}, QF: ${actualAdvancing.QF.length}, SF: ${actualAdvancing.SF.length}, F: ${actualAdvancing.F.length}`);

const actualBonuses = { champion: actualChampion, topScorers: ["ronaldo"] };

// Count total matches with results
const totalPlayed = Object.keys(actualResults).length;
console.log(`  Total matches played: ${totalPlayed}`);
assert(totalPlayed === 104, `Should have 104 results, got ${totalPlayed}`);

// ---- 1. Perfect prediction ----
console.log("\n--- 1. Perfect prediction ---");
const perfectUser = {
  matches: { ...matchPreds },
  advancing: { ...actualAdvancing },
  champion: actualChampion,
  topScorer: "Ronaldo",
};
const perfectBracket = calcBracketTeams(perfectUser.matches);
const perfectScore = calculateFullScore(perfectUser, actualResults, actualAdvancing, actualBonuses, perfectBracket, bracket);

const expectedMatchPts = 72*4 + 16*6 + 8*8 + 4*10 + 2*12 + 1*12 + 1*14;
const expectedAdvPts = 32*2 + 16*4 + 8*6 + 4*8 + 2*10;
const expectedTotal = expectedMatchPts + expectedAdvPts + 17;

console.log(`  Match pts expected: ${expectedMatchPts}, Adv expected: ${expectedAdvPts}`);
console.log(`  Expected total: ${expectedTotal}, Got: ${perfectScore.totalPoints}`);
assert(perfectScore.exactScoreCount === 104, `Perfect: 104 exact scores, got ${perfectScore.exactScoreCount}`);
assert(perfectScore.outcomeCount === 104, `Perfect: 104 outcomes, got ${perfectScore.outcomeCount}`);
assert(perfectScore.correctChampion === true, `Perfect: champion correct`);
assert(perfectScore.correctTopScorer === true, `Perfect: top scorer correct`);
assert(perfectScore.totalPoints === expectedTotal, `Perfect total: ${expectedTotal}, got ${perfectScore.totalPoints}`);

// ---- 2. All wrong predictions ----
console.log("\n--- 2. All wrong predictions ---");
const wrongUser = {
  matches: {},
  advancing: { R32: ["XXX"], R16: ["YYY"] },
  champion: "ZZZ",
  topScorer: "nobody",
};
for (const [matchId, pred] of Object.entries(matchPreds)) {
  if (pred.homeScore > pred.awayScore) {
    wrongUser.matches[matchId] = { homeScore: 0, awayScore: 3 };
  } else if (pred.homeScore < pred.awayScore) {
    wrongUser.matches[matchId] = { homeScore: 3, awayScore: 0 };
  } else {
    wrongUser.matches[matchId] = { homeScore: 1, awayScore: 0 };
  }
}
const wrongBracket = calcBracketTeams(wrongUser.matches);
const wrongScore = calculateFullScore(wrongUser, actualResults, actualAdvancing, actualBonuses, wrongBracket, bracket);
assert(wrongScore.exactScoreCount === 0, `Wrong: 0 exact, got ${wrongScore.exactScoreCount}`);
assert(wrongScore.correctChampion === false, `Wrong: no champion`);
assert(wrongScore.correctTopScorer === false, `Wrong: no top scorer`);
console.log(`  Wrong total: ${wrongScore.totalPoints}`);

// ---- 3. Correct outcomes only ----
console.log("\n--- 3. Correct outcomes, wrong exact scores ---");
const outcomeUser = { matches: {}, advancing: {}, champion: null, topScorer: "" };
for (const [matchId, pred] of Object.entries(matchPreds)) {
  if (pred.homeScore > pred.awayScore) {
    outcomeUser.matches[matchId] = { homeScore: 5, awayScore: 0 };
  } else if (pred.homeScore < pred.awayScore) {
    outcomeUser.matches[matchId] = { homeScore: 0, awayScore: 5 };
  } else {
    outcomeUser.matches[matchId] = { homeScore: 3, awayScore: 3 };
  }
}
const outcomeBracket = calcBracketTeams(outcomeUser.matches);
const outcomeScore = calculateFullScore(outcomeUser, actualResults, actualAdvancing, actualBonuses, outcomeBracket, bracket);
assert(outcomeScore.outcomeCount === 104, `Outcomes: 104, got ${outcomeScore.outcomeCount}`);
assert(outcomeScore.exactScoreCount === 0, `Exact: 0, got ${outcomeScore.exactScoreCount}`);
const expectedOutcome = 72*1 + 16*3 + 8*5 + 4*7 + 2*9 + 1*9 + 1*11;
console.log(`  Outcome-only match pts: expected ${expectedOutcome}, got match total from scores`);

// ---- 4. Tiebreaker simulation ----
console.log("\n--- 4. Tiebreakers ---");
const fA = { totalPoints:100,exactScoreCount:10,outcomeCount:30,correctChampion:false,correctTopScorer:false,advancingPoints:{R32:10,R16:8,QF:6,SF:0,F:0} };
const fB = { totalPoints:100,exactScoreCount:8,outcomeCount:30,correctChampion:false,correctTopScorer:false,advancingPoints:{R32:10,R16:8,QF:6,SF:0,F:0} };
assert(compareTiebreaker(fA, fB) < 0, "TB1: more exact scores wins");
fA.exactScoreCount=8; fA.outcomeCount=35;
assert(compareTiebreaker(fA, fB) < 0, "TB2: more outcomes wins");
fA.outcomeCount=30; fA.correctChampion=true;
assert(compareTiebreaker(fA, fB) < 0, "TB3: champion wins");
fA.correctChampion=false; fA.correctTopScorer=true;
assert(compareTiebreaker(fA, fB) < 0, "TB4: top scorer wins");
fA.correctTopScorer=false; fA.advancingPoints.F=10;
assert(compareTiebreaker(fA, fB) < 0, "TB5: more F wins");
fA.advancingPoints.F=0; fA.advancingPoints.SF=10;
assert(compareTiebreaker(fA, fB) < 0, "TB6: more SF wins");
fA.advancingPoints.SF=0; fA.advancingPoints.QF=10;
assert(compareTiebreaker(fA, fB) < 0, "TB7: more QF wins");
fA.advancingPoints.QF=6; fA.advancingPoints.R16=12;
assert(compareTiebreaker(fA, fB) < 0, "TB8: more R16 wins");
fA.advancingPoints.R16=8; fA.advancingPoints.R32=14;
assert(compareTiebreaker(fA, fB) < 0, "TB9: more R32 wins");
fA.advancingPoints.R32=10;
assert(compareTiebreaker(fA, fB) === 0, "TB10: fully tied = 0");

// ---- 5. Wrong matchup ----
console.log("\n--- 5. Wrong matchup ---");
let r = calculateMatchPoints({homeScore:1,awayScore:0},{homeScore:1,awayScore:0,stage:"R32"},"R32",{home:"BRA",away:"ARG"},{home:"GER",away:"FRA"});
assert(r.points===0&&r.wrongMatchup===true, "Wrong matchup: 0pts");
r = calculateMatchPoints({homeScore:1,awayScore:0},{homeScore:1,awayScore:0,stage:"group"},"group",{home:"BRA",away:"ARG"},{home:"GER",away:"FRA"});
assert(r.points===4&&r.wrongMatchup===false, "Group ignores matchup");

// ---- 6. Multiple top scorers ----
console.log("\n--- 6. Multiple top scorers ---");
const mts = calculateFullScore({matches:{},champion:null,topScorer:"Mbappe",advancing:{}},{},{},{champion:null,topScorers:["Ronaldo","Mbappe","Messi"]},{},{});
assert(mts.correctTopScorer===true, "Multiple top scorers: any match works");

// ---- 7. deriveActualAdvancing partial ----
console.log("\n--- 7. deriveActualAdvancing partial groups ---");
const partialRes = {};
for (const m of groupMatches) {
  if (["A","B","C","D","E","F"].includes(m.group)) {
    partialRes[m.id] = { homeScore: 1, awayScore: 0, stage: "group", group: m.group };
  }
}
const partialBracket = calcBracketTeams(partialRes);
const partialAdv = deriveActualAdvancing(partialBracket, partialRes);
// Early-certainty: a COMPLETED group's winner + runner-up are clinched into R32
// the moment that group ends — no need to wait for all 12 groups. Groups A–F are
// done here (6 groups × {1st, 2nd} = 12 teams), G–L are unplayed.
assert(partialAdv.R32.length === 12, `Partial: 12 clinched position teams from 6 done groups, got ${partialAdv.R32.length}`);
// Every credited team must be the winner or runner-up of a completed group, never
// a third-placed team (no third has clinched: all six groups played identically,
// so their thirds tie, and six unplayed groups could still overtake any of them).
for (const code of partialAdv.R32) {
  const g = code && Object.entries(GROUPS).find(([, ts]) => ts.some((t) => t.code === code))?.[0];
  assert(["A","B","C","D","E","F"].includes(g), `Partial: ${code} belongs to a completed group`);
}

// ---- 8. Leaderboard sort ----
console.log("\n--- 8. Leaderboard sort ---");
const forms = [
  {totalPoints:50,exactScoreCount:5,outcomeCount:20,correctChampion:false,correctTopScorer:false,advancingPoints:{}},
  {totalPoints:60,exactScoreCount:3,outcomeCount:15,correctChampion:false,correctTopScorer:false,advancingPoints:{}},
  {totalPoints:60,exactScoreCount:5,outcomeCount:15,correctChampion:false,correctTopScorer:false,advancingPoints:{}},
  {totalPoints:60,exactScoreCount:5,outcomeCount:20,correctChampion:false,correctTopScorer:false,advancingPoints:{}},
];
forms.sort((a,b) => { if (b.totalPoints!==a.totalPoints) return b.totalPoints-a.totalPoints; return compareTiebreaker(a,b); });
assert(forms[0].totalPoints===60&&forms[0].outcomeCount===20, "1st: most outcomes among tied");
assert(forms[1].exactScoreCount===5&&forms[1].outcomeCount===15, "2nd: 5 exact, 15 outcomes");
assert(forms[2].exactScoreCount===3, "3rd: 3 exact");
assert(forms[3].totalPoints===50, "4th: 50pts");

// ---- 9. Max score ----
console.log("\n--- 9. Theoretical maximum ---");
console.log(`  Match: ${expectedMatchPts}, Advancing: ${expectedAdvPts}, Bonuses: 17`);
console.log(`  MAXIMUM POSSIBLE SCORE: ${expectedTotal}`);

console.log(`\n=== SIMULATION RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
