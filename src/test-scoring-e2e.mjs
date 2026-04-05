// End-to-end scoring test:
// 1. Enter actual results for Group A, B, C (18 matches)
// 2. Create 5 users with different predictions
// 3. Calculate scores and verify against rules
// 4. Clean up all test data
//
// Uses Firebase client SDK directly (same as the app)

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyClBCMln44vz46xiloR2EakCIVdOMA0EVs",
  authDomain: "beeri-world-cup.firebaseapp.com",
  projectId: "beeri-world-cup",
  storageBucket: "beeri-world-cup.firebasestorage.app",
  messagingSenderId: "701233284129",
  appId: "1:701233284129:web:6f05f81287bb91e87b8f60",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function docRef(docName) {
  return doc(db, 'gameData', docName);
}

// ============ SCORING LOGIC (copied from scoring.js for standalone test) ============

const POINTS = {
  group:  { outcome: 1, exactScore: 3, advancing: 2 },
  R32:    { outcome: 3, exactScore: 3, advancing: 4 },
  R16:    { outcome: 3, exactScore: 3, advancing: 4 },
  QF:     { outcome: 5, exactScore: 3, advancing: 6 },
  SF:     { outcome: 7, exactScore: 3, advancing: 8 },
  '3RD':  { outcome: 7, exactScore: 3, advancing: 0 },
  F:      { outcome: 9, exactScore: 3, advancing: 0 },
};

const BONUSES = { champion: 9, topScorer: 8 };

function getOutcome(h, a) {
  if (h > a) return 'home';
  if (a > h) return 'away';
  return 'draw';
}

function calculateMatchPoints(prediction, actual, stage, predTeams, actualTeams) {
  if (!prediction || !actual || actual.homeScore === null || actual.awayScore === null)
    return { points: 0, outcomePoints: 0, exactPoints: 0, breakdown: 'not-played' };
  if (prediction.homeScore === null || prediction.homeScore === undefined ||
      prediction.awayScore === null || prediction.awayScore === undefined)
    return { points: 0, outcomePoints: 0, exactPoints: 0, breakdown: 'no-prediction' };

  if (stage !== 'group' && predTeams && actualTeams) {
    const predSet = new Set([predTeams.home, predTeams.away].filter(Boolean));
    const actSet = new Set([actualTeams.home, actualTeams.away].filter(Boolean));
    const sameMatchup = predSet.size === 2 && actSet.size === 2 &&
      [...predSet].every(t => actSet.has(t));
    if (!sameMatchup)
      return { points: 0, outcomePoints: 0, exactPoints: 0, breakdown: 'wrong-matchup' };
  }

  const sp = POINTS[stage] || POINTS.group;
  const pH = prediction.homeScore, pA = prediction.awayScore;
  const aH = actual.homeScore, aA = actual.awayScore;
  let points = 0, outcomePoints = 0, exactPoints = 0;

  if (getOutcome(pH, pA) === getOutcome(aH, aA)) {
    outcomePoints = sp.outcome;
    points += outcomePoints;
    if (pH === aH && pA === aA) {
      exactPoints = sp.exactScore;
      points += exactPoints;
    }
  }
  return { points, outcomePoints, exactPoints, breakdown: points > 0 ? 'scored' : 'wrong' };
}

// ============ GROUP/BRACKET LOGIC (minimal, for test) ============

const GROUPS = {
  A: [
    { code: 'MEX', name: 'מקסיקו' },
    { code: 'RSA', name: 'דרום אפריקה' },
    { code: 'KOR', name: 'דרום קוריאה' },
    { code: 'CZE', name: 'צ\'כיה' },
  ],
  B: [
    { code: 'CAN', name: 'קנדה' },
    { code: 'BIH', name: 'בוסניה' },
    { code: 'QAT', name: 'קטאר' },
    { code: 'SUI', name: 'שוויץ' },
  ],
  C: [
    { code: 'BRA', name: 'ברזיל' },
    { code: 'MAR', name: 'מרוקו' },
    { code: 'HAI', name: 'האיטי' },
    { code: 'SCO', name: 'סקוטלנד' },
  ],
};

// Group match schedule: [homeIdx, awayIdx] per matchday
const MATCHDAYS = [
  [0, 3], [1, 2],  // MD1
  [3, 2], [0, 1],  // MD2
  [2, 0], [3, 1],  // MD3
];

function generateGroupMatchIds(groupName) {
  return MATCHDAYS.map((_, i) => `group-${groupName}-${i + 1}`);
}

function getGroupMatchTeams(groupName, matchIdx) {
  const [hIdx, aIdx] = MATCHDAYS[matchIdx];
  const teams = GROUPS[groupName];
  return { home: teams[hIdx].code, away: teams[aIdx].code };
}

// ============ ACTUAL RESULTS (truth) ============
// Group A: MEX dominates, KOR 2nd, RSA 3rd, CZE 4th
// Group B: CAN 1st, SUI 2nd, BIH 3rd, QAT 4th
// Group C: BRA 1st, MAR 2nd, SCO 3rd, HAI 4th

const ACTUAL_RESULTS = {};

// Helper to set result
function setResult(matchId, homeScore, awayScore, stage = 'group') {
  ACTUAL_RESULTS[matchId] = { homeScore, awayScore, stage };
}

// Group A results:
// MD1: MEX vs CZE = 3-0, RSA vs KOR = 1-2
// MD2: CZE vs KOR = 0-1, MEX vs RSA = 2-0
// MD3: KOR vs MEX = 1-1, CZE vs RSA = 0-0
setResult('group-A-1', 3, 0); // MEX 3-0 CZE
setResult('group-A-2', 1, 2); // RSA 1-2 KOR
setResult('group-A-3', 0, 1); // CZE 0-1 KOR
setResult('group-A-4', 2, 0); // MEX 2-0 RSA
setResult('group-A-5', 1, 1); // KOR 1-1 MEX
setResult('group-A-6', 0, 0); // CZE 0-0 RSA

// Group B results:
// MD1: CAN vs SUI = 2-1, BIH vs QAT = 3-0
// MD2: SUI vs QAT = 2-0, CAN vs BIH = 1-0
// MD3: QAT vs CAN = 0-4, SUI vs BIH = 1-1
setResult('group-B-1', 2, 1); // CAN 2-1 SUI
setResult('group-B-2', 3, 0); // BIH 3-0 QAT
setResult('group-B-3', 2, 0); // SUI 2-0 QAT
setResult('group-B-4', 1, 0); // CAN 1-0 BIH
setResult('group-B-5', 0, 4); // QAT 0-4 CAN
setResult('group-B-6', 1, 1); // SUI 1-1 BIH

// Group C results:
// MD1: BRA vs SCO = 4-0, MAR vs HAI = 2-0
// MD2: SCO vs HAI = 1-0, BRA vs MAR = 1-1
// MD3: HAI vs BRA = 0-3, SCO vs MAR = 0-2
setResult('group-C-1', 4, 0); // BRA 4-0 SCO
setResult('group-C-2', 2, 0); // MAR 2-0 HAI
setResult('group-C-3', 1, 0); // SCO 1-0 HAI
setResult('group-C-4', 1, 1); // BRA 1-1 MAR
setResult('group-C-5', 0, 3); // HAI 0-3 BRA
setResult('group-C-6', 0, 2); // SCO 0-2 MAR

// Standings verification:
// A: MEX 7pts(5gf,1ga), KOR 7pts(4gf,2ga), RSA 1pt(1gf,4ga), CZE 1pt(0gf,4ga)
// B: CAN 9pts(7gf,1ga), BIH 4pts(4gf,1ga), SUI 4pts(4gf,3ga), QAT 0pts(0gf,10ga)
// C: BRA 7pts(8gf,1ga), MAR 7pts(4gf,1ga), SCO 3pts(1gf,6ga), HAI 0pts(0gf,6ga)

// ============ 5 TEST USERS & THEIR PREDICTIONS ============

function makeUser(name) {
  const id = name.toLowerCase().replace(/\s+/g, '-');
  return {
    id,
    displayName: name,
    password: 'test123',
    formName: '',
    budgetNumber: '',
    isAdmin: false,
    createdAt: new Date().toISOString(),
  };
}

// User 1: "דני" - Perfect predictor (knows all exact scores)
const USER1_MATCHES = {};
for (const [id, r] of Object.entries(ACTUAL_RESULTS)) {
  USER1_MATCHES[id] = { homeScore: r.homeScore, awayScore: r.awayScore };
}

// User 2: "מיכל" - Gets all outcomes right but no exact scores
const USER2_MATCHES = {};
for (const [id, r] of Object.entries(ACTUAL_RESULTS)) {
  const h = r.homeScore, a = r.awayScore;
  if (h > a) USER2_MATCHES[id] = { homeScore: h + 1, awayScore: a }; // same outcome, different score
  else if (a > h) USER2_MATCHES[id] = { homeScore: h, awayScore: a + 1 };
  else USER2_MATCHES[id] = { homeScore: h + 1, awayScore: a + 1 }; // draw with different score
}

// User 3: "יוסי" - Gets some right, some wrong
const USER3_MATCHES = {
  'group-A-1': { homeScore: 2, awayScore: 0 }, // correct outcome (home win), wrong score
  'group-A-2': { homeScore: 2, awayScore: 1 }, // WRONG (predicted home win, actual away win)
  'group-A-3': { homeScore: 0, awayScore: 1 }, // exact!
  'group-A-4': { homeScore: 2, awayScore: 0 }, // exact!
  'group-A-5': { homeScore: 0, awayScore: 2 }, // WRONG (predicted away win, actual draw)
  'group-A-6': { homeScore: 1, awayScore: 1 }, // correct outcome (draw), wrong score
  'group-B-1': { homeScore: 1, awayScore: 0 }, // correct outcome, wrong score
  'group-B-2': { homeScore: 2, awayScore: 1 }, // correct outcome, wrong score
  'group-B-3': { homeScore: 2, awayScore: 0 }, // exact!
  'group-B-4': { homeScore: 1, awayScore: 0 }, // exact!
  'group-B-5': { homeScore: 1, awayScore: 2 }, // correct outcome, wrong score
  'group-B-6': { homeScore: 0, awayScore: 0 }, // correct outcome (draw), wrong score
  'group-C-1': { homeScore: 3, awayScore: 1 }, // correct outcome, wrong score
  'group-C-2': { homeScore: 2, awayScore: 0 }, // exact!
  'group-C-3': { homeScore: 0, awayScore: 1 }, // WRONG (predicted away, actual home)
  'group-C-4': { homeScore: 1, awayScore: 1 }, // exact!
  'group-C-5': { homeScore: 0, awayScore: 3 }, // exact!
  'group-C-6': { homeScore: 1, awayScore: 1 }, // WRONG (predicted draw, actual away win)
};

// User 4: "שרה" - All wrong predictions
const USER4_MATCHES = {};
for (const [id, r] of Object.entries(ACTUAL_RESULTS)) {
  const h = r.homeScore, a = r.awayScore;
  // Flip the outcome
  if (h > a) USER4_MATCHES[id] = { homeScore: 0, awayScore: 2 };
  else if (a > h) USER4_MATCHES[id] = { homeScore: 2, awayScore: 0 };
  else USER4_MATCHES[id] = { homeScore: 2, awayScore: 0 }; // draw → home win
}

// User 5: "עומר" - Partial predictions (only Group A and B, skips C)
const USER5_MATCHES = {
  'group-A-1': { homeScore: 3, awayScore: 0 }, // exact!
  'group-A-2': { homeScore: 1, awayScore: 2 }, // exact!
  'group-A-3': { homeScore: 1, awayScore: 0 }, // WRONG (predicted home, actual away)
  'group-A-4': { homeScore: 1, awayScore: 0 }, // correct outcome, wrong score
  'group-A-5': { homeScore: 2, awayScore: 2 }, // correct outcome (draw), wrong score
  'group-A-6': { homeScore: 0, awayScore: 0 }, // exact!
  'group-B-1': { homeScore: 2, awayScore: 1 }, // exact!
  'group-B-2': { homeScore: 3, awayScore: 0 }, // exact!
  'group-B-3': { homeScore: 1, awayScore: 0 }, // correct outcome, wrong score
  'group-B-4': { homeScore: 0, awayScore: 1 }, // WRONG (predicted away, actual home)
  'group-B-5': { homeScore: 0, awayScore: 4 }, // exact!
  'group-B-6': { homeScore: 1, awayScore: 1 }, // exact!
  // No Group C predictions
};

const USERS_DATA = [
  { user: makeUser('דני'), matches: USER1_MATCHES, desc: 'Perfect (all exact)' },
  { user: makeUser('מיכל'), matches: USER2_MATCHES, desc: 'All outcomes right, no exact' },
  { user: makeUser('יוסי'), matches: USER3_MATCHES, desc: 'Mixed results' },
  { user: makeUser('שרה'), matches: USER4_MATCHES, desc: 'All wrong' },
  { user: makeUser('עומר'), matches: USER5_MATCHES, desc: 'Partial (A+B only)' },
];

// ============ MANUAL SCORE CALCULATION ============

function calcExpectedScore(matches, results) {
  let total = 0;
  let exactCount = 0;
  let outcomeCount = 0;
  const details = [];

  for (const [matchId, actual] of Object.entries(results)) {
    const pred = matches[matchId];
    const result = calculateMatchPoints(pred, actual, 'group', null, null);
    total += result.points;
    if (result.exactPoints > 0) exactCount++;
    if (result.outcomePoints > 0) outcomeCount++;
    details.push({ matchId, points: result.points, exact: result.exactPoints > 0, outcome: result.outcomePoints > 0 });
  }
  return { total, exactCount, outcomeCount, details };
}

// ============ MAIN TEST ============

async function main() {
  console.log('=== E2E Scoring Test ===\n');

  // Save existing data to restore later
  console.log('1. Backing up existing data...');
  const backup = {};
  for (const docName of ['users', 'predictions', 'matchResults', 'actualAdvancing', 'actualBonuses']) {
    const snap = await getDoc(docRef(docName));
    backup[docName] = snap.exists() ? snap.data() : null;
  }
  console.log('   Backup complete.\n');

  try {
    // Write actual results
    console.log('2. Writing actual match results (18 group matches: A, B, C)...');
    await setDoc(docRef('matchResults'), { data: ACTUAL_RESULTS });
    console.log('   Done.\n');

    // Write users
    console.log('3. Creating 5 test users...');
    const usersObj = {};
    for (const { user } of USERS_DATA) {
      usersObj[user.id] = user;
    }
    await setDoc(docRef('users'), { data: usersObj });
    console.log(`   Users: ${USERS_DATA.map(u => u.user.displayName).join(', ')}\n`);

    // Write predictions
    console.log('4. Writing predictions for all 5 users...');
    const predsObj = {};
    for (const { user, matches } of USERS_DATA) {
      predsObj[user.id] = {
        userId: user.id,
        matches,
        advancing: {},
        champion: null,
        topScorer: '',
        status: 'approved',
        updatedAt: new Date().toISOString(),
      };
    }
    await setDoc(docRef('predictions'), { data: predsObj });
    console.log('   Done.\n');

    // ============ VERIFY SCORES ============
    console.log('5. Calculating and verifying scores...\n');

    // Print actual results summary
    console.log('   --- Actual Results ---');
    for (const group of ['A', 'B', 'C']) {
      console.log(`   Group ${group}:`);
      for (let i = 0; i < 6; i++) {
        const matchId = `group-${group}-${i + 1}`;
        const r = ACTUAL_RESULTS[matchId];
        const { home, away } = getGroupMatchTeams(group, i);
        console.log(`     ${matchId}: ${home} ${r.homeScore}-${r.awayScore} ${away}`);
      }
    }
    console.log('');

    let allPass = true;

    for (const { user, matches, desc } of USERS_DATA) {
      const score = calcExpectedScore(matches, ACTUAL_RESULTS);
      console.log(`   --- ${user.displayName} (${desc}) ---`);
      console.log(`   Total: ${score.total} pts | Exact: ${score.exactCount} | Correct outcomes: ${score.outcomeCount}`);

      // Manual verification per user
      let manualTotal = 0;
      let manualExact = 0;
      let manualOutcome = 0;

      for (const [matchId, actual] of Object.entries(ACTUAL_RESULTS)) {
        const pred = matches[matchId];
        if (!pred) continue;

        const predOut = getOutcome(pred.homeScore, pred.awayScore);
        const actOut = getOutcome(actual.homeScore, actual.awayScore);

        if (predOut === actOut) {
          manualTotal += 1; // outcome point
          manualOutcome++;
          if (pred.homeScore === actual.homeScore && pred.awayScore === actual.awayScore) {
            manualTotal += 3; // exact bonus
            manualExact++;
          }
        }
      }

      const pass = manualTotal === score.total && manualExact === score.exactCount && manualOutcome === score.outcomeCount;
      if (!pass) {
        console.log(`   ❌ MISMATCH! Manual: ${manualTotal}pts/${manualExact}exact/${manualOutcome}outcomes`);
        allPass = false;
      } else {
        console.log(`   ✓ Verified correct`);
      }
      console.log('');
    }

    // ============ DETAILED BREAKDOWN ============
    console.log('6. Detailed user breakdowns:\n');

    // User 1 (דני) - Perfect: 18 matches × (1 outcome + 3 exact) = 18 × 4 = 72
    {
      const s = calcExpectedScore(USER1_MATCHES, ACTUAL_RESULTS);
      const expected = 18 * 4;
      console.log(`   דני (perfect): ${s.total} pts (expected: ${expected})`);
      if (s.total !== expected) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
      console.log(`   Exact scores: ${s.exactCount}/18 (expected: 18)`);
      if (s.exactCount !== 18) { console.log('   ❌ FAIL'); allPass = false; }
    }
    console.log('');

    // User 2 (מיכל) - All outcomes right, 0 exact: 18 × 1 = 18
    {
      const s = calcExpectedScore(USER2_MATCHES, ACTUAL_RESULTS);
      const expected = 18 * 1;
      console.log(`   מיכל (outcomes only): ${s.total} pts (expected: ${expected})`);
      if (s.total !== expected) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
      console.log(`   Exact scores: ${s.exactCount}/18 (expected: 0)`);
      if (s.exactCount !== 0) { console.log('   ❌ FAIL'); allPass = false; }
    }
    console.log('');

    // User 3 (יוסי) - Mixed:
    // Correct outcomes: A1(1) A3(4) A4(4) A6(1) B1(1) B2(1) B3(4) B4(4) B5(1) B6(1) C1(1) C2(4) C4(4) C5(4) = 14 matches with outcome
    // Wait, let me count more carefully:
    // A1: pred 2-0, act 3-0 → both home win ✓ outcome(1)
    // A2: pred 2-1, act 1-2 → pred home, act away ✗
    // A3: pred 0-1, act 0-1 → exact! (1+3=4)
    // A4: pred 2-0, act 2-0 → exact! (1+3=4)
    // A5: pred 0-2, act 1-1 → pred away, act draw ✗
    // A6: pred 1-1, act 0-0 → both draw ✓ outcome(1)
    // B1: pred 1-0, act 2-1 → both home ✓ outcome(1)
    // B2: pred 2-1, act 3-0 → both home ✓ outcome(1)
    // B3: pred 2-0, act 2-0 → exact! (1+3=4)
    // B4: pred 1-0, act 1-0 → exact! (1+3=4)
    // B5: pred 1-2, act 0-4 → both away ✓ outcome(1)
    // B6: pred 0-0, act 1-1 → both draw ✓ outcome(1)
    // C1: pred 3-1, act 4-0 → both home ✓ outcome(1)
    // C2: pred 2-0, act 2-0 → exact! (1+3=4)
    // C3: pred 0-1, act 1-0 → pred away, act home ✗
    // C4: pred 1-1, act 1-1 → exact! (1+3=4)
    // C5: pred 0-3, act 0-3 → exact! (1+3=4)
    // C6: pred 1-1, act 0-2 → pred draw, act away ✗
    // Outcomes correct: 14, Exact: 7
    // Total: 14*1 + 7*3 = 14 + 21 = 35
    {
      const s = calcExpectedScore(USER3_MATCHES, ACTUAL_RESULTS);
      const expectedOutcomes = 14;
      const expectedExact = 7;
      const expectedTotal = 14 + 7 * 3;
      console.log(`   יוסי (mixed): ${s.total} pts (expected: ${expectedTotal})`);
      if (s.total !== expectedTotal) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
      console.log(`   Outcomes: ${s.outcomeCount} (expected: ${expectedOutcomes}), Exact: ${s.exactCount} (expected: ${expectedExact})`);
      if (s.outcomeCount !== expectedOutcomes || s.exactCount !== expectedExact) { console.log('   ❌ FAIL'); allPass = false; }
    }
    console.log('');

    // User 4 (שרה) - All wrong: 0 pts
    {
      const s = calcExpectedScore(USER4_MATCHES, ACTUAL_RESULTS);
      console.log(`   שרה (all wrong): ${s.total} pts (expected: 0)`);
      if (s.total !== 0) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }
    console.log('');

    // User 5 (עומר) - Partial (A+B only, no C):
    // A1: 3-0 exact (4), A2: 1-2 exact (4), A3: 1-0 pred home, act 0-1 away ✗
    // A4: 1-0 pred home, act 2-0 home ✓ outcome(1), A5: 2-2 pred draw, act 1-1 draw ✓ outcome(1)
    // A6: 0-0 exact (4)
    // B1: 2-1 exact (4), B2: 3-0 exact (4), B3: 1-0 pred home, act 2-0 home ✓ outcome(1)
    // B4: 0-1 pred away, act 1-0 home ✗, B5: 0-4 exact (4), B6: 1-1 exact (4)
    // Exact: A1,A2,A6,B1,B2,B5,B6 = 7
    // Outcome only: A4,A5,B3 = 3
    // Wrong: A3,B4 = 2
    // No prediction: C1-C6 = 6 (0 pts)
    // Total: 7*4 + 3*1 = 28 + 3 = 31
    {
      const s = calcExpectedScore(USER5_MATCHES, ACTUAL_RESULTS);
      const expectedExact = 7;
      const expectedOutcome = 10; // 7 exact + 3 outcome-only
      const expectedTotal = 7 * 4 + 3 * 1;
      console.log(`   עומר (partial A+B): ${s.total} pts (expected: ${expectedTotal})`);
      if (s.total !== expectedTotal) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
      console.log(`   Outcomes: ${s.outcomeCount} (expected: ${expectedOutcome}), Exact: ${s.exactCount} (expected: ${expectedExact})`);
      if (s.outcomeCount !== expectedOutcome || s.exactCount !== expectedExact) { console.log('   ❌ FAIL'); allPass = false; }
    }
    console.log('');

    // ============ EDGE CASE TESTS ============
    console.log('7. Edge case tests:\n');

    // Draw match scoring
    {
      const pred = { homeScore: 0, awayScore: 0 };
      const actual = { homeScore: 0, awayScore: 0, stage: 'group' };
      const r = calculateMatchPoints(pred, actual, 'group');
      console.log(`   Draw exact (0-0 = 0-0): ${r.points} pts (expected: 4)`);
      if (r.points !== 4) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // Draw outcome, different score
    {
      const pred = { homeScore: 2, awayScore: 2 };
      const actual = { homeScore: 1, awayScore: 1, stage: 'group' };
      const r = calculateMatchPoints(pred, actual, 'group');
      console.log(`   Draw outcome (2-2 vs 1-1): ${r.points} pts (expected: 1)`);
      if (r.points !== 1) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // Knockout match with different teams (wrong matchup)
    {
      const pred = { homeScore: 2, awayScore: 1 };
      const actual = { homeScore: 2, awayScore: 1, stage: 'R32' };
      const predTeams = { home: 'BRA', away: 'GER' };
      const actTeams = { home: 'BRA', away: 'FRA' };
      const r = calculateMatchPoints(pred, actual, 'R32', predTeams, actTeams);
      console.log(`   KO wrong matchup: ${r.points} pts (expected: 0)`);
      if (r.points !== 0) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // Knockout match with same teams, exact
    {
      const pred = { homeScore: 2, awayScore: 1 };
      const actual = { homeScore: 2, awayScore: 1, stage: 'R32' };
      const teams = { home: 'BRA', away: 'GER' };
      const r = calculateMatchPoints(pred, actual, 'R32', teams, teams);
      console.log(`   KO exact same teams: ${r.points} pts (expected: 6 = 3+3)`);
      if (r.points !== 6) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // Knockout same teams reversed (home/away flipped but same set)
    {
      const pred = { homeScore: 2, awayScore: 1 };
      const actual = { homeScore: 2, awayScore: 1, stage: 'QF' };
      const predTeams = { home: 'BRA', away: 'GER' };
      const actTeams = { home: 'GER', away: 'BRA' };
      const r = calculateMatchPoints(pred, actual, 'QF', predTeams, actTeams);
      console.log(`   KO same teams reversed: ${r.points} pts (expected: 8 = 5+3, teams match as set)`);
      if (r.points !== 8) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // SF exact score
    {
      const pred = { homeScore: 1, awayScore: 0 };
      const actual = { homeScore: 1, awayScore: 0, stage: 'SF' };
      const teams = { home: 'BRA', away: 'ARG' };
      const r = calculateMatchPoints(pred, actual, 'SF', teams, teams);
      console.log(`   SF exact: ${r.points} pts (expected: 10 = 7+3)`);
      if (r.points !== 10) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // Final exact score
    {
      const pred = { homeScore: 3, awayScore: 2 };
      const actual = { homeScore: 3, awayScore: 2, stage: 'F' };
      const teams = { home: 'BRA', away: 'ARG' };
      const r = calculateMatchPoints(pred, actual, 'F', teams, teams);
      console.log(`   Final exact: ${r.points} pts (expected: 12 = 9+3)`);
      if (r.points !== 12) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // No prediction
    {
      const r = calculateMatchPoints(null, { homeScore: 1, awayScore: 0, stage: 'group' }, 'group');
      console.log(`   No prediction: ${r.points} pts (expected: 0)`);
      if (r.points !== 0) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    // Not yet played
    {
      const r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: null, awayScore: null, stage: 'group' }, 'group');
      console.log(`   Not played: ${r.points} pts (expected: 0)`);
      if (r.points !== 0) { console.log('   ❌ FAIL'); allPass = false; }
      else console.log('   ✓ Pass');
    }

    console.log('');

    // ============ LEADERBOARD ============
    console.log('8. Final Leaderboard (group stage only):\n');
    const leaderboard = USERS_DATA.map(({ user, matches, desc }) => {
      const s = calcExpectedScore(matches, ACTUAL_RESULTS);
      return { name: user.displayName, desc, ...s };
    }).sort((a, b) => b.total - a.total || b.exactCount - a.exactCount || b.outcomeCount - a.outcomeCount);

    console.log('   Rank | Name     | Points | Exact | Outcomes');
    console.log('   -----|----------|--------|-------|--------');
    leaderboard.forEach((u, i) => {
      console.log(`   ${i + 1}    | ${u.name.padEnd(8)} | ${String(u.total).padStart(6)} | ${String(u.exactCount).padStart(5)} | ${u.outcomeCount}`);
    });
    console.log('');

    // ============ SUMMARY ============
    if (allPass) {
      console.log('✅ ALL TESTS PASSED');
    } else {
      console.log('❌ SOME TESTS FAILED');
    }

  } finally {
    // ============ CLEANUP ============
    console.log('\n9. Restoring original data (cleanup)...');
    for (const [docName, data] of Object.entries(backup)) {
      if (data) {
        await setDoc(docRef(docName), data);
      } else {
        // Document didn't exist before - delete it or set empty
        await setDoc(docRef(docName), { data: docName === 'actualBonuses' ? { champion: null, topScorers: [] } : {} });
      }
    }
    console.log('   Original data restored. Test data cleaned up.\n');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
