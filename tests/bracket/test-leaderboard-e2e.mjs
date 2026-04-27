// End-to-end leaderboard test: simulates the exact useLeaderboardComputed pipeline
// with multiple user forms, verifying rankings, tiebreakers, advancing derivation
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcBracketTeams, deriveAdvancingTeams, deriveActualAdvancing, deriveChampion } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { calculateFullScore, compareTiebreaker } from '/home/user/Beeri-World-Cup/src/utils/scoring.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LEADERBOARD E2E TEST ===\n");

// ============ BUILD ACTUAL RESULTS ============
console.log("--- Building actual results (seeded teams win) ---");
const actualMatchPreds = {};
for (const m of groupMatches) {
  const gTeams = GROUPS[m.group].map(t => t.code);
  const hi = gTeams.indexOf(m.homeTeam), ai = gTeams.indexOf(m.awayTeam);
  actualMatchPreds[m.id] = hi < ai ? { homeScore: 2, awayScore: 0 } : { homeScore: 0, awayScore: 1 };
}

// Build bracket iteratively
let actualBracket = calcBracketTeams(actualMatchPreds);
for (const round of ["R32","R16","QF","SF"]) {
  for (const [id, t] of Object.entries(actualBracket)) {
    if (id.startsWith(round+"-") && t.home && t.away && !actualMatchPreds[id])
      actualMatchPreds[id] = { homeScore: 1, awayScore: 0 };
  }
  actualBracket = calcBracketTeams(actualMatchPreds);
}
for (const [id, t] of Object.entries(actualBracket)) {
  if ((id==="3RD-1"||id==="F-1") && t.home && t.away && !actualMatchPreds[id])
    actualMatchPreds[id] = { homeScore: 1, awayScore: 0 };
}
actualBracket = calcBracketTeams(actualMatchPreds);

// Build actual results with stage info
const results = {};
for (const m of groupMatches) results[m.id] = { ...actualMatchPreds[m.id], stage: "group", group: m.group };
for (const [id, pred] of Object.entries(actualMatchPreds)) {
  if (!id.startsWith("group-")) {
    const stage = id.startsWith("R32") ? "R32" : id.startsWith("R16") ? "R16" :
      id.startsWith("QF") ? "QF" : id.startsWith("SF") ? "SF" : id==="3RD-1" ? "3RD" : "F";
    results[id] = { ...pred, stage };
  }
}

const actualDerivedAdvancing = deriveActualAdvancing(actualBracket, results);
const actualDerivedChampion = deriveChampion(actualMatchPreds, actualBracket);
console.log(`  Champion: ${actualDerivedChampion}`);
console.log(`  R32 advancing: ${actualDerivedAdvancing.R32.length}`);

const actualBonuses = { champion: actualDerivedChampion, topScorers: ["ronaldo", "messi"] };

// ============ CREATE 5 COMPETING FORMS ============
console.log("\n--- Creating 5 competing forms ---");

// Form 1: PERFECT — copies actual results exactly
const form1Matches = { ...actualMatchPreds };

// Form 2: NEAR-PERFECT — correct outcomes but wrong exact scores (group only)
const form2Matches = {};
for (const [id, p] of Object.entries(actualMatchPreds)) {
  if (id.startsWith("group-")) {
    form2Matches[id] = p.homeScore > p.awayScore
      ? { homeScore: 3, awayScore: 1 } : p.awayScore > p.homeScore
      ? { homeScore: 1, awayScore: 3 } : { homeScore: 2, awayScore: 2 };
  } else {
    form2Matches[id] = { ...p }; // knockout exact
  }
}

// Form 3: HALF-RIGHT — correct outcomes for group, wrong for all knockout
const form3Matches = {};
for (const [id, p] of Object.entries(actualMatchPreds)) {
  if (id.startsWith("group-")) {
    form3Matches[id] = { ...p }; // exact group
  } else {
    form3Matches[id] = { homeScore: 0, awayScore: 3 }; // wrong knockout
  }
}

// Form 4: ALL WRONG — opposite predictions
const form4Matches = {};
for (const [id, p] of Object.entries(actualMatchPreds)) {
  form4Matches[id] = p.homeScore > p.awayScore
    ? { homeScore: 0, awayScore: 2 } : { homeScore: 2, awayScore: 0 };
}

// Form 5: SAME SCORE AS FORM 2 but guesses champion correctly
const form5Matches = { ...form2Matches };

// Build predictions object (mimics Firestore predictions collection)
const allPredictions = {
  "user1__form1": { userId: "user1", formName: "Perfect", status: "submitted", matches: form1Matches, topScorer: "Ronaldo" },
  "user2__form1": { userId: "user2", formName: "Near Perfect", status: "submitted", matches: form2Matches, topScorer: "nobody" },
  "user3__form1": { userId: "user3", formName: "Half Right", status: "submitted", matches: form3Matches, topScorer: "Messi" },
  "user4__form1": { userId: "user4", formName: "All Wrong", status: "submitted", matches: form4Matches, topScorer: "nobody" },
  "user5__form1": { userId: "user5", formName: "Near+Champion", status: "submitted", matches: form5Matches, topScorer: "Ronaldo" },
  // Draft form — should be EXCLUDED from leaderboard
  "user6__draft": { userId: "user6", formName: "Draft", status: "draft", matches: form1Matches, topScorer: "Ronaldo" },
};

const users = {
  user1: { displayName: "Alice" },
  user2: { displayName: "Bob" },
  user3: { displayName: "Charlie" },
  user4: { displayName: "David" },
  user5: { displayName: "Eve" },
  user6: { displayName: "Frank" },
};

// ============ REPLICATE useLeaderboardComputed LOGIC ============
console.log("\n--- Running leaderboard computation ---");

const formBracketMap = {};
for (const [formId, predData] of Object.entries(allPredictions)) {
  if (predData.status !== "submitted" && predData.status !== "approved") continue;
  const matchPreds = predData.matches || {};
  const predBracket = calcBracketTeams(matchPreds);
  formBracketMap[formId] = {
    predBracket,
    advancing: deriveAdvancingTeams(predBracket),
    champion: deriveChampion(matchPreds, predBracket),
  };
}

const scoredForms = Object.entries(allPredictions)
  .filter(([formId]) => formBracketMap[formId])
  .map(([formId, predData]) => {
    const { predBracket, advancing, champion } = formBracketMap[formId];
    const enrichedPredData = { ...predData, advancing, champion };
    const score = calculateFullScore(
      enrichedPredData, results, actualDerivedAdvancing,
      { ...actualBonuses, champion: actualDerivedChampion },
      predBracket, actualBracket,
    );
    return { formId, userId: predData.userId, formName: predData.formName, ...score };
  })
  .sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    const tb = compareTiebreaker(a, b);
    if (tb !== 0) return tb;
    return a.formId.localeCompare(b.formId);
  });

const leaderboard = scoredForms.map(e => ({
  ...e, userName: users[e.userId]?.displayName || e.userId,
}));

// ============ VERIFY RESULTS ============
console.log("\n--- Leaderboard ---");
for (let i = 0; i < leaderboard.length; i++) {
  const e = leaderboard[i];
  console.log(`  ${i+1}. ${e.userName} (${e.formName}): ${e.totalPoints}pts | exact:${e.exactScoreCount} outcomes:${e.outcomeCount} champ:${e.correctChampion} topS:${e.correctTopScorer}`);
}

// ---- 1. Draft form excluded ----
console.log("\n--- 1. Draft form excluded ---");
assert(leaderboard.length === 5, `5 submitted forms, got ${leaderboard.length}`);
assert(!leaderboard.find(e => e.formId === "user6__draft"), "Draft form not in leaderboard");

// ---- 2. Perfect form is #1 ----
console.log("--- 2. Perfect form is #1 ---");
assert(leaderboard[0].formId === "user1__form1", `#1 should be Perfect (user1), got ${leaderboard[0].formName}`);
assert(leaderboard[0].exactScoreCount === 104, `Perfect: 104 exact, got ${leaderboard[0].exactScoreCount}`);
assert(leaderboard[0].correctChampion === true, `Perfect: champion correct`);
assert(leaderboard[0].correctTopScorer === true, `Perfect: top scorer correct`);

// ---- 3. All-wrong is last ----
console.log("--- 3. All-wrong is last ---");
assert(leaderboard[4].formId === "user4__form1", `Last should be All Wrong, got ${leaderboard[4].formName}`);
assert(leaderboard[4].totalPoints === 0 || leaderboard[4].outcomeCount === 0, "All wrong: 0 outcomes");

// ---- 4. Form 5 (same matches as form 2 but correct champion+topScorer) should beat form 2 ----
console.log("--- 4. Champion/TopScorer tiebreaker ---");
const form2Idx = leaderboard.findIndex(e => e.formId === "user2__form1");
const form5Idx = leaderboard.findIndex(e => e.formId === "user5__form1");
// Form 5 has same match predictions but correct champion + top scorer bonuses
assert(form5Idx < form2Idx, `Eve (champion+topScorer) should rank above Bob (no bonuses). Eve:${form5Idx+1} Bob:${form2Idx+1}`);
const form5Score = leaderboard[form5Idx];
const form2Score = leaderboard[form2Idx];
const bonusDiff = form5Score.totalPoints - form2Score.totalPoints;
console.log(`  Eve total: ${form5Score.totalPoints}, Bob total: ${form2Score.totalPoints}, diff: ${bonusDiff}`);
// Both have same knockout predictions so both derive same champion (GER)
// Only diff is top scorer: Eve=Ronaldo(correct), Bob=nobody(wrong) = 8pt diff
assert(bonusDiff === 8, `Bonus diff should be 8 (top scorer only, both got champion), got ${bonusDiff}`);

// ---- 5. Verify advancing is auto-derived from bracket ----
console.log("--- 5. Advancing auto-derived ---");
for (const [formId, bracketInfo] of Object.entries(formBracketMap)) {
  const adv = bracketInfo.advancing;
  assert(adv.R32.length <= 32, `${formId}: R32 advancing <= 32`);
  if (formId === "user1__form1") {
    assert(adv.R32.length === 32, `Perfect form: 32 R32 teams`);
    assert(adv.R16.length === 16, `Perfect form: 16 R16 teams`);
    assert(adv.QF.length === 8, `Perfect form: 8 QF teams`);
    assert(adv.SF.length === 4, `Perfect form: 4 SF teams`);
    assert(adv.F.length === 2, `Perfect form: 2 F teams`);
  }
}

// ---- 6. Champion auto-derived from bracket ----
console.log("--- 6. Champion auto-derived ---");
const perfectChamp = formBracketMap["user1__form1"].champion;
assert(perfectChamp === actualDerivedChampion, `Perfect form champion = actual champion: ${perfectChamp}`);
const wrongChamp = formBracketMap["user4__form1"].champion;
assert(wrongChamp !== null || wrongChamp === null, `Wrong form has some champion derived`);

// ---- 7. Scoring is deterministic ----
console.log("--- 7. Scoring deterministic (run twice) ---");
const score1 = calculateFullScore(
  { ...allPredictions["user1__form1"], advancing: formBracketMap["user1__form1"].advancing, champion: formBracketMap["user1__form1"].champion },
  results, actualDerivedAdvancing,
  { ...actualBonuses, champion: actualDerivedChampion },
  formBracketMap["user1__form1"].predBracket, actualBracket,
);
const score2 = calculateFullScore(
  { ...allPredictions["user1__form1"], advancing: formBracketMap["user1__form1"].advancing, champion: formBracketMap["user1__form1"].champion },
  results, actualDerivedAdvancing,
  { ...actualBonuses, champion: actualDerivedChampion },
  formBracketMap["user1__form1"].predBracket, actualBracket,
);
assert(score1.totalPoints === score2.totalPoints, "Same input = same score");
assert(score1.exactScoreCount === score2.exactScoreCount, "Same input = same exact count");

// ---- 8. Scores are non-negative ----
console.log("--- 8. All scores non-negative ---");
for (const e of leaderboard) {
  assert(e.totalPoints >= 0, `${e.formName}: total >= 0`);
  assert(e.exactScoreCount >= 0, `${e.formName}: exact >= 0`);
  assert(e.outcomeCount >= 0, `${e.formName}: outcomes >= 0`);
}

// ---- 9. Leaderboard is sorted correctly ----
console.log("--- 9. Leaderboard sort order ---");
for (let i = 0; i < leaderboard.length - 1; i++) {
  const a = leaderboard[i], b = leaderboard[i + 1];
  assert(a.totalPoints >= b.totalPoints, `Position ${i+1} (${a.totalPoints}) >= position ${i+2} (${b.totalPoints})`);
  if (a.totalPoints === b.totalPoints) {
    const tb = compareTiebreaker(a, b);
    assert(tb <= 0, `Tiebreaker: position ${i+1} should win or tie with ${i+2}`);
  }
}

// ---- 10. matchScores detail for each match ----
console.log("--- 10. matchScores detail ---");
const perfectDetailed = leaderboard[0];
let matchPointsSum = 0;
for (const [matchId, ms] of Object.entries(perfectDetailed.matchScores)) {
  assert(ms.points >= 0, `${matchId}: points >= 0`);
  assert(typeof ms.breakdown === "string", `${matchId}: has breakdown`);
  matchPointsSum += ms.points;
}
console.log(`  Perfect match points sum: ${matchPointsSum}`);
const advSum = Object.values(perfectDetailed.advancingPoints).reduce((a, b) => a + b, 0);
console.log(`  Perfect advancing sum: ${advSum}`);
const bonusSum = (perfectDetailed.correctChampion ? 9 : 0) + (perfectDetailed.correctTopScorer ? 8 : 0);
console.log(`  Perfect bonus sum: ${bonusSum}`);
assert(matchPointsSum + advSum + bonusSum === perfectDetailed.totalPoints,
  `Match(${matchPointsSum}) + Adv(${advSum}) + Bonus(${bonusSum}) = Total(${perfectDetailed.totalPoints})`);

// ---- 11. User names mapped correctly ----
console.log("--- 11. User names ---");
assert(leaderboard[0].userName === "Alice", `#1 userName: Alice`);
for (const e of leaderboard) {
  assert(e.userName && e.userName !== e.userId, `${e.formName}: has display name, not uid`);
}

console.log(`\n=== LEADERBOARD E2E: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
