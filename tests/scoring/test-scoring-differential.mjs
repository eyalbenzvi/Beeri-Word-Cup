// Differential scoring test — independent implementation vs production calculateFullScore.
//
// This file deliberately does NOT import any helper from src/utils/scoring.js
// for the reference calculation. The reference is hand-rolled from the spec
// in CLAUDE.md / SCORING_DATA. We then run thousands of randomised scenarios
// and a curated edge-case suite, comparing the production output to ours.
//
// What we cover:
//   - Per-match outcome / exact / wrongMatchup
//   - All 7 stages (group, R32, R16, QF, SF, 3RD, F)
//   - Advancing predictions (R32..F) crediting the correct stage's "advancing" pts
//   - Champion bonus (+9)
//   - Top-scorer bonus (+8) including Hebrew vs English equivalence
//   - Edge cases: null prediction, null result, empty advancing, missing matchup
//   - Tiebreaker order from compareTiebreaker
//
// Run with:  node --loader ./tests/loader.mjs ./tests/test-scoring-differential.mjs

import { calculateMatchPoints, calculateFullScore, compareTiebreaker } from "/home/user/Beeri-World-Cup/src/utils/scoring.js";
import { TOP_SCORER_PLAYERS } from "/home/user/Beeri-World-Cup/src/data/players.js";

// ============================================================================
// REFERENCE IMPLEMENTATION (hand-rolled — NO dependency on src/utils/scoring.js)
// ============================================================================

const REF_POINTS = {
  group: { outcome: 1, exact: 3, advancing: 2 },
  R32:   { outcome: 3, exact: 3, advancing: 4 },
  R16:   { outcome: 5, exact: 3, advancing: 6 },
  QF:    { outcome: 7, exact: 3, advancing: 8 },
  SF:    { outcome: 9, exact: 3, advancing: 10 },
  "3RD": { outcome: 9, exact: 3, advancing: 0 },
  F:     { outcome: 11, exact: 3, advancing: 0 },
};
const REF_CHAMP = 9;
const REF_TOP_SCORER = 8;

// Rounds whose "advancing" predictions credit a previous stage's advancing pts.
// A correct R32 advancing guess => group.advancing (2 pts), etc.
const REF_ADV_STAGE = {
  R32: "group",
  R16: "R32",
  QF:  "R16",
  SF:  "QF",
  F:   "SF",
};

function refOutcome(h, a) {
  if (h > a) return "H";
  if (h < a) return "A";
  return "D";
}

// Mirror isSamePlayer: case-insensitive trim + Hebrew/English equivalence
// for known players. We rebuild the equivalence map locally.
function buildPlayerAliasMap() {
  const map = new Map(); // normalized -> canonical key (name+team)
  for (const p of TOP_SCORER_PLAYERS) {
    const key = `${p.name}|${p.team}`;
    if (p.name) map.set(p.name.trim().toLowerCase(), key);
    if (p.nameHe) map.set(p.nameHe.trim().toLowerCase(), key);
  }
  return map;
}
const PLAYER_ALIAS = buildPlayerAliasMap();

function refSamePlayer(a, b) {
  if (a == null || b == null) return false;
  const A = String(a).trim().toLowerCase();
  const B = String(b).trim().toLowerCase();
  if (!A || !B) return false;
  if (A === B) return true;
  const aKey = PLAYER_ALIAS.get(A);
  const bKey = PLAYER_ALIAS.get(B);
  if (aKey && bKey) return aKey === bKey;
  return false;
}

function refMatchPoints(pred, actual, stage, predTeams, actualTeams) {
  if (!pred || !actual || actual.homeScore == null || actual.awayScore == null)
    return { pts: 0, exact: false, outcome: false, wrongMatchup: false };
  if (pred.homeScore == null || pred.awayScore == null)
    return { pts: 0, exact: false, outcome: false, wrongMatchup: false };

  if (stage !== "group" && predTeams && actualTeams) {
    const same =
      predTeams.home && predTeams.away &&
      actualTeams.home && actualTeams.away &&
      predTeams.home === actualTeams.home &&
      predTeams.away === actualTeams.away;
    if (!same) return { pts: 0, exact: false, outcome: false, wrongMatchup: true };
  }

  const ph = Number(pred.homeScore);
  const pa = Number(pred.awayScore);
  const ah = Number(actual.homeScore);
  const aa = Number(actual.awayScore);
  if (![ph, pa, ah, aa].every(Number.isFinite))
    return { pts: 0, exact: false, outcome: false, wrongMatchup: false };

  const sp = REF_POINTS[stage] || REF_POINTS.group;
  if (refOutcome(ph, pa) !== refOutcome(ah, aa))
    return { pts: 0, exact: false, outcome: false, wrongMatchup: false };

  const isExact = ph === ah && pa === aa;
  const pts = sp.outcome + (isExact ? sp.exact : 0);
  return { pts, exact: isExact, outcome: true, wrongMatchup: false };
}

function refFullScore(userPred, actualResults, actualAdvancing, actualBonuses, predBracket, actualBracket) {
  let total = 0;
  let exactCount = 0;
  let outcomeCount = 0;
  const advPts = { R32: 0, R16: 0, QF: 0, SF: 0, F: 0 };

  for (const [matchId, actual] of Object.entries(actualResults)) {
    const stage = actual.stage || "group";
    const pred = userPred.matches?.[matchId];
    const r = refMatchPoints(
      pred,
      actual,
      stage,
      predBracket?.[matchId] || null,
      actualBracket?.[matchId] || null,
    );
    total += r.pts;
    if (r.exact) exactCount++;
    if (r.outcome) outcomeCount++;
  }

  if (userPred.advancing && actualAdvancing) {
    for (const [round, predTeams] of Object.entries(userPred.advancing)) {
      const actualTeams = actualAdvancing[round] || [];
      if (actualTeams.length === 0) continue;
      const sourceStage = REF_ADV_STAGE[round] || "group";
      const perTeam = REF_POINTS[sourceStage].advancing;
      for (const team of predTeams) {
        if (actualTeams.includes(team)) {
          advPts[round] += perTeam;
          total += perTeam;
        }
      }
    }
  }

  let correctChampion = false;
  if (actualBonuses?.champion && userPred.champion === actualBonuses.champion) {
    total += REF_CHAMP;
    correctChampion = true;
  }

  let correctTopScorer = false;
  if (Array.isArray(actualBonuses?.topScorers) && userPred.topScorer) {
    if (actualBonuses.topScorers.some((t) => refSamePlayer(t, userPred.topScorer))) {
      total += REF_TOP_SCORER;
      correctTopScorer = true;
    }
  }

  return { total, exactCount, outcomeCount, correctChampion, correctTopScorer, advPts };
}

// Reference tiebreaker (independent transcription of the spec).
function refTiebreaker(a, b) {
  if (a.exactScoreCount !== b.exactScoreCount) return b.exactScoreCount - a.exactScoreCount;
  if (a.outcomeCount !== b.outcomeCount) return b.outcomeCount - a.outcomeCount;
  if (a.correctChampion !== b.correctChampion) return a.correctChampion ? -1 : 1;
  if (a.correctTopScorer !== b.correctTopScorer) return a.correctTopScorer ? -1 : 1;
  for (const k of ["F", "SF", "QF", "R16", "R32"]) {
    const av = a.advancingPoints?.[k] || 0;
    const bv = b.advancingPoints?.[k] || 0;
    if (av !== bv) return bv - av;
  }
  return 0;
}

// ============================================================================
// TEST HARNESS
// ============================================================================

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); }
}

function deepEqualScore(prod, ref) {
  if (prod.totalPoints !== ref.total) return `total ${prod.totalPoints} vs ref ${ref.total}`;
  if (prod.exactScoreCount !== ref.exactCount) return `exact ${prod.exactScoreCount} vs ref ${ref.exactCount}`;
  if (prod.outcomeCount !== ref.outcomeCount) return `outcome ${prod.outcomeCount} vs ref ${ref.outcomeCount}`;
  if (prod.correctChampion !== ref.correctChampion) return `champion ${prod.correctChampion} vs ref ${ref.correctChampion}`;
  if (prod.correctTopScorer !== ref.correctTopScorer) return `topScorer ${prod.correctTopScorer} vs ref ${ref.correctTopScorer}`;
  for (const k of ["R32","R16","QF","SF","F"]) {
    const a = prod.advancingPoints?.[k] || 0;
    const b = ref.advPts[k] || 0;
    if (a !== b) return `adv.${k} ${a} vs ref ${b}`;
  }
  return null;
}

// Seedable RNG (mulberry32) so failures are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAGES = ["group","R32","R16","QF","SF","3RD","F"];
const TEAM_POOL = ["BRA","ARG","GER","FRA","ESP","ENG","NED","POR","BEL","ITA","URU","CRO","MEX","USA","JPN","KOR"];

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

// Build a randomised scenario with N matches per stage, random teams, random scores.
function buildScenario(seed, opts = {}) {
  const rand = rng(seed);
  const matchesPerStage = opts.matchesPerStage || { group: 12, R32: 6, R16: 4, QF: 3, SF: 2, "3RD": 1, F: 1 };

  const actualResults = {};
  const actualBracket = {};
  const predBracket = {};
  const userPredictions = { matches: {}, advancing: {}, champion: null, topScorer: null };

  let mi = 0;
  for (const stage of STAGES) {
    const n = matchesPerStage[stage] || 0;
    for (let i = 0; i < n; i++) {
      const id = `${stage}-${mi++}`;
      const home = pick(rand, TEAM_POOL);
      let away;
      do { away = pick(rand, TEAM_POOL); } while (away === home);
      actualResults[id] = {
        homeScore: Math.floor(rand() * 5),
        awayScore: Math.floor(rand() * 5),
        stage,
      };
      actualBracket[id] = { home, away };

      // 30% no prediction at all
      const noPred = rand() < 0.3;
      if (noPred) continue;

      const ph = Math.floor(rand() * 5);
      const pa = Math.floor(rand() * 5);
      userPredictions.matches[id] = { homeScore: ph, awayScore: pa };

      // For knockout, sometimes predict a different matchup (wrongMatchup branch).
      if (stage !== "group") {
        const wrong = rand() < 0.2;
        if (wrong) {
          let wh = pick(rand, TEAM_POOL);
          let wa;
          do { wa = pick(rand, TEAM_POOL); } while (wa === wh);
          predBracket[id] = { home: wh, away: wa };
        } else {
          predBracket[id] = { home, away };
        }
      }
    }
  }

  // Advancing
  const actualAdvancing = { R32: [], R16: [], QF: [], SF: [], F: [] };
  for (const round of Object.keys(actualAdvancing)) {
    const teams = [];
    const k = round === "F" ? 2 : round === "SF" ? 4 : round === "QF" ? 8 : round === "R16" ? 16 : 32;
    while (teams.length < Math.min(k, TEAM_POOL.length)) {
      const t = pick(rand, TEAM_POOL);
      if (!teams.includes(t)) teams.push(t);
    }
    actualAdvancing[round] = teams;
    // user picks a subset, sometimes including correct teams
    const picked = [];
    const want = Math.floor(rand() * Math.min(k, TEAM_POOL.length));
    while (picked.length < want) {
      const t = pick(rand, TEAM_POOL);
      if (!picked.includes(t)) picked.push(t);
    }
    userPredictions.advancing[round] = picked;
  }

  // Champion
  const actualChampion = pick(rand, TEAM_POOL);
  userPredictions.champion = rand() < 0.5 ? actualChampion : pick(rand, TEAM_POOL);

  // Top scorer — exercise Hebrew/English equivalence ~half the time
  const ref = TOP_SCORER_PLAYERS[Math.floor(rand() * TOP_SCORER_PLAYERS.length)];
  const actualScorerKey = rand() < 0.5 ? ref.name : ref.nameHe;
  const userScorerKey = rand() < 0.5
    ? (rand() < 0.5 ? ref.name : ref.nameHe)
    : pick(rand, TOP_SCORER_PLAYERS).name;
  userPredictions.topScorer = userScorerKey;

  return {
    userPredictions,
    actualResults,
    actualAdvancing,
    actualBonuses: { champion: actualChampion, topScorers: [actualScorerKey] },
    predBracket,
    actualBracket,
  };
}

console.log("=== DIFFERENTIAL SCORING TESTS ===\n");

// ---- 1. Curated edge cases ----
console.log("--- 1. Curated edge cases ---");

const CASES = [
  {
    name: "empty everything",
    s: { matches: {}, advancing: {}, champion: null, topScorer: null },
    a: {}, adv: {}, bonuses: {},
  },
  {
    name: "perfect group exact + draw exact + champion + top scorer",
    s: {
      matches: { "g1": { homeScore: 2, awayScore: 1 }, "g2": { homeScore: 0, awayScore: 0 } },
      advancing: { R32: ["BRA", "ARG"] },
      champion: "BRA",
      topScorer: "Lionel Messi",
    },
    a: {
      "g1": { homeScore: 2, awayScore: 1, stage: "group" },
      "g2": { homeScore: 0, awayScore: 0, stage: "group" },
    },
    adv: { R32: ["BRA", "ARG", "GER"] },
    bonuses: { champion: "BRA", topScorers: ["ליאו מסי"] }, // Hebrew alias check
  },
  {
    name: "knockout wrong matchup zeros points even with exact score",
    s: { matches: { "k1": { homeScore: 2, awayScore: 1 } } },
    a: { "k1": { homeScore: 2, awayScore: 1, stage: "QF" } },
    adv: {}, bonuses: {},
    predBracket: { "k1": { home: "GER", away: "FRA" } },
    actualBracket: { "k1": { home: "BRA", away: "ARG" } },
  },
  {
    name: "knockout correct matchup, exact score = outcome+exact",
    s: { matches: { "k1": { homeScore: 2, awayScore: 1 } } },
    a: { "k1": { homeScore: 2, awayScore: 1, stage: "F" } },
    adv: {}, bonuses: {},
    predBracket: { "k1": { home: "BRA", away: "ARG" } },
    actualBracket: { "k1": { home: "BRA", away: "ARG" } },
  },
  {
    name: "null prediction yields zero",
    s: { matches: { "g1": { homeScore: null, awayScore: null } } },
    a: { "g1": { homeScore: 2, awayScore: 1, stage: "group" } },
    adv: {}, bonuses: {},
  },
  {
    name: "advancing partial credit (1 of 4 correct in QF)",
    s: { matches: {}, advancing: { QF: ["BRA","XX1","XX2","XX3"] } },
    a: {},
    adv: { QF: ["BRA","ARG","GER","FRA"] },
    bonuses: {},
  },
  {
    name: "top scorer match in Hebrew when actual is English",
    s: { matches: {}, topScorer: "ליאו מסי" },
    a: {}, adv: {},
    bonuses: { topScorers: ["Lionel Messi"] },
  },
  {
    name: "top scorer no match",
    s: { matches: {}, topScorer: "Some Random" },
    a: {}, adv: {},
    bonuses: { topScorers: ["Lionel Messi"] },
  },
  {
    name: "champion wrong name",
    s: { matches: {}, champion: "ARG" },
    a: {}, adv: {},
    bonuses: { champion: "BRA" },
  },
  {
    name: "actual.homeScore null = match not played",
    s: { matches: { "g1": { homeScore: 1, awayScore: 0 } } },
    a: { "g1": { homeScore: null, awayScore: null, stage: "group" } },
    adv: {}, bonuses: {},
  },
];

for (const c of CASES) {
  const prod = calculateFullScore(c.s, c.a, c.adv, c.bonuses, c.predBracket || {}, c.actualBracket || {});
  const ref = refFullScore(c.s, c.a, c.adv, c.bonuses, c.predBracket || {}, c.actualBracket || {});
  const diff = deepEqualScore(prod, ref);
  if (diff) {
    console.error(`  FAIL [${c.name}]: ${diff}`);
    console.error(`    prod=${JSON.stringify(prod)}`);
    console.error(`    ref =${JSON.stringify(ref)}`);
  }
  assert(!diff, `edge: ${c.name}`);
}

// ---- 2. Per-stage outcome/exact multiplication table (sanity) ----
console.log("--- 2. Stage point table ---");
for (const stage of STAGES) {
  const sameTeams = { home: "BRA", away: "ARG" };
  const exact = calculateMatchPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 }, stage, sameTeams, sameTeams);
  const outcome = calculateMatchPoints({ homeScore: 3, awayScore: 1 }, { homeScore: 2, awayScore: 1 }, stage, sameTeams, sameTeams);
  const wrong = calculateMatchPoints({ homeScore: 0, awayScore: 1 }, { homeScore: 2, awayScore: 1 }, stage, sameTeams, sameTeams);
  const sp = REF_POINTS[stage];
  assert(exact.points === sp.outcome + sp.exact, `${stage}: exact ${exact.points} vs ${sp.outcome + sp.exact}`);
  assert(outcome.points === sp.outcome, `${stage}: outcome ${outcome.points} vs ${sp.outcome}`);
  assert(wrong.points === 0, `${stage}: wrong should be 0`);
}

// ---- 3. Random differential — 5000 scenarios ----
console.log("--- 3. Random differential (5000 scenarios) ---");
const N = 5000;
let mismatches = 0;
const sampleMismatches = [];
for (let i = 0; i < N; i++) {
  const sc = buildScenario(i);
  const prod = calculateFullScore(
    sc.userPredictions, sc.actualResults, sc.actualAdvancing,
    sc.actualBonuses, sc.predBracket, sc.actualBracket,
  );
  const ref = refFullScore(
    sc.userPredictions, sc.actualResults, sc.actualAdvancing,
    sc.actualBonuses, sc.predBracket, sc.actualBracket,
  );
  const diff = deepEqualScore(prod, ref);
  if (diff) {
    mismatches++;
    if (sampleMismatches.length < 5) sampleMismatches.push({ seed: i, diff, prod, ref });
  }
}
if (mismatches > 0) {
  console.error(`  ${mismatches}/${N} mismatches; first 5:`);
  for (const m of sampleMismatches) console.error(`    seed=${m.seed} ${m.diff}`);
}
assert(mismatches === 0, `random differential: ${mismatches}/${N} mismatches`);

// ---- 4. Tiebreaker differential ----
console.log("--- 4. Tiebreaker differential (2000 pairs) ---");
let tbMismatches = 0;
for (let i = 0; i < 2000; i++) {
  const r = rng(10000 + i);
  const make = () => ({
    exactScoreCount: Math.floor(r() * 30),
    outcomeCount: Math.floor(r() * 50),
    correctChampion: r() < 0.5,
    correctTopScorer: r() < 0.5,
    advancingPoints: {
      F: r() < 0.5 ? Math.floor(r() * 3) * 10 : 0,
      SF: r() < 0.5 ? Math.floor(r() * 5) * 8 : 0,
      QF: r() < 0.5 ? Math.floor(r() * 9) * 6 : 0,
      R16: r() < 0.5 ? Math.floor(r() * 17) * 4 : 0,
      R32: r() < 0.5 ? Math.floor(r() * 33) * 2 : 0,
    },
  });
  const a = make(), b = make();
  const prodSign = Math.sign(compareTiebreaker(a, b));
  const refSign = Math.sign(refTiebreaker(a, b));
  if (prodSign !== refSign) {
    tbMismatches++;
    if (tbMismatches <= 3) console.error(`  TB mismatch: prod=${prodSign} ref=${refSign}\n    a=${JSON.stringify(a)}\n    b=${JSON.stringify(b)}`);
  }
}
assert(tbMismatches === 0, `tiebreaker differential: ${tbMismatches}/2000 mismatches`);

// ---- 5. Property: total = sum(matchScores.points) + sum(advancingPoints) + bonuses ----
console.log("--- 5. Internal consistency property ---");
let propMismatches = 0;
for (let i = 0; i < 500; i++) {
  const sc = buildScenario(50000 + i);
  const prod = calculateFullScore(
    sc.userPredictions, sc.actualResults, sc.actualAdvancing,
    sc.actualBonuses, sc.predBracket, sc.actualBracket,
  );
  const matchSum = Object.values(prod.matchScores).reduce((s, m) => s + m.points, 0);
  const advSum = Object.values(prod.advancingPoints).reduce((s, n) => s + n, 0);
  const bonus = (prod.correctChampion ? 9 : 0) + (prod.correctTopScorer ? 8 : 0);
  if (matchSum + advSum + bonus !== prod.totalPoints) {
    propMismatches++;
    if (propMismatches <= 3) console.error(`  prop mismatch seed=${50000+i}: ${matchSum}+${advSum}+${bonus} != ${prod.totalPoints}`);
  }
}
assert(propMismatches === 0, `internal consistency: ${propMismatches}/500`);

// ---- 6. Idempotence: scoring twice yields same result ----
console.log("--- 6. Idempotence ---");
let idemMismatches = 0;
for (let i = 0; i < 200; i++) {
  const sc = buildScenario(100000 + i);
  const a = calculateFullScore(sc.userPredictions, sc.actualResults, sc.actualAdvancing, sc.actualBonuses, sc.predBracket, sc.actualBracket);
  const b = calculateFullScore(sc.userPredictions, sc.actualResults, sc.actualAdvancing, sc.actualBonuses, sc.predBracket, sc.actualBracket);
  if (a.totalPoints !== b.totalPoints) idemMismatches++;
}
assert(idemMismatches === 0, `idempotence: ${idemMismatches}/200`);

// ---- Summary ----
console.log(`\n=== DIFFERENTIAL RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("  - " + f);
}
process.exit(failed > 0 ? 1 : 0);
