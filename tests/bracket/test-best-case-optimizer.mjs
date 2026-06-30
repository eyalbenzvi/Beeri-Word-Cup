// Regression tests for the "חשב תרחיש מיטבי" (best-case scenario) optimizer.
//
// Root bug this suite locks in:
//   The optimizer synthesises results for the UNPLAYED matches and scores
//   forms against them via the SAME calculateFullScore path the leaderboard
//   uses. Stored results carry a `stage` field; the synthesised ones did NOT.
//   calculateFullScore keys off `actual.stage || "group"`, so every remaining
//   knockout match was scored as a GROUP match — which (a) used group point
//   values for KO rounds and (b) silently bypassed the wrong-matchup gate
//   (only enforced when stage !== "group"). Result: the "מיקום מירבי" /
//   "ניקוד מירבי" shown to the user did NOT match what the chosen scenario
//   actually yields on the real leaderboard — systematically over-optimistic.
//
// The invariant under test (and what the fix guarantees): feeding the
// optimizer's own `bestResults` back through the real leaderboard scoring core
// reproduces EXACTLY the projectedRank / projectedScore it reported. Plus a
// monotonicity check on the knockout local-search and a static guard that the
// stage normalisation stays in place.
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { predictScenario } from "/home/user/Beeri-World-Cup/src/utils/scenarioPredictor.ts";
import { groupMatches, knockoutMatches } from "/home/user/Beeri-World-Cup/src/data/matches.ts";
import { calcBracketTeams } from "/home/user/Beeri-World-Cup/src/utils/bracket.ts";
import { GROUPS } from "/home/user/Beeri-World-Cup/src/data/teams.ts";
import { computeBestCase } from "/home/user/Beeri-World-Cup/src/utils/bestCase.ts";
import {
  computeScoredForms,
  assignDenseRanks,
} from "/home/user/Beeri-World-Cup/src/utils/leaderboardCore.ts";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== BEST-CASE OPTIMIZER ===\n");

// ── World builders ───────────────────────────────────────────────
const allCodes = Object.values(GROUPS).flat().map((t) => t.code);
const stageOf = {};
for (const m of groupMatches) stageOf[m.id] = "group";
for (const m of knockoutMatches) stageOf[m.id] = m.stage;

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function genForms(N) {
  const forms = {};
  for (let i = 0; i < N; i++) {
    let c, r;
    do { c = pick(allCodes); r = pick(allCodes); } while (c === r);
    const matches = predictScenario(c, r, groupMatches, knockoutMatches, calcBracketTeams, {});
    forms[`f${i}`] = { formId: `f${i}`, userId: `u${i}`, formName: `F${i}`, status: "submitted", matches };
  }
  return forms;
}
function fullResults(c, r) {
  const m = predictScenario(c, r, groupMatches, knockoutMatches, calcBracketTeams, {});
  const res = {};
  for (const [mid, p] of Object.entries(m))
    res[mid] = { homeScore: p.homeScore, awayScore: p.awayScore, stage: stageOf[mid], advancingTeam: p.advancingTeam };
  return res;
}
// Mirror real stored results: every official result carries a `stage`.
function withStage(results) {
  const out = {};
  for (const [mid, p] of Object.entries(results))
    out[mid] = { ...p, stage: p.stage || stageOf[mid] || "group" };
  return out;
}
// Score the SAME scenario through the leaderboard core the app actually uses.
function leaderboardRankScore(targetId, forms, results) {
  const r = withStage(results);
  const core = computeScoredForms(r, forms, { champion: null, topScorers: [] }, r, false);
  const ranked = assignDenseRanks(core.scoredForms);
  const e = ranked.find((x) => x.formId === targetId);
  return { rank: e.rank, score: e.totalPoints };
}

// ── 1. Reported rank/score == real leaderboard rank/score of bestResults ──
// Across several played-state shapes: all-KO-remaining (the common case) and a
// couple of constrained late-stage shapes. EVERY form must reconcile exactly.
console.log("--- 1. Projected rank/score reconciles with the real leaderboard ---");
{
  const forms = genForms(14);
  const actual = fullResults(allCodes[3], allCodes[20]);

  const remainSets = [
    knockoutMatches.map((m) => m.id),                 // all KO remaining
    ["SF-1", "SF-2", "3RD-1", "F-1"],                 // semis onward
    ["QF-1", "QF-2", "QF-3", "QF-4", "SF-1", "SF-2", "3RD-1", "F-1"], // quarters onward
  ];

  let reconciled = 0, total = 0;
  for (const remain of remainSets) {
    const remainSet = new Set(remain);
    const played = {};
    for (const id of Object.keys(actual)) if (!remainSet.has(id)) played[id] = actual[id];

    for (const target of Object.keys(forms)) {
      const bc = computeBestCase(target, forms, played);
      const real = leaderboardRankScore(target, forms, bc.bestResults);
      total++;
      if (bc.projectedRank === real.rank && bc.projectedScore === real.score) reconciled++;
      else if (failures.length < 6)
        console.error(`    mismatch (${remain.length} rem) ${target}: reported r=${bc.projectedRank}/s=${bc.projectedScore} vs real r=${real.rank}/s=${real.score}`);
    }
  }
  assert(reconciled === total, `every projected rank+score reconciles with the leaderboard (${reconciled}/${total})`);
}

// ── 2. bestResults carries `stage` on knockout matches ──
// The returned scenario must be self-describing so any consumer that re-scores
// it (leaderboard path keys on `stage`) gets the same numbers.
console.log("--- 2. bestResults knockout entries carry their stage ---");
{
  const forms = genForms(8);
  const actual = fullResults(allCodes[1], allCodes[9]);
  const played = {};
  for (const id of Object.keys(actual)) if (!id.startsWith("R32-") && !id.match(/^(R16|QF|SF|3RD|F)-/)) played[id] = actual[id];
  const bc = computeBestCase("f0", forms, played);
  const koSamples = ["R32-1", "R16-1", "QF-1", "SF-1", "F-1"];
  let staged = 0;
  for (const id of koSamples) {
    const r = bc.bestResults[id];
    if (r && r.stage === stageOf[id]) staged++;
  }
  assert(staged === koSamples.length, `synthesised KO results expose the correct stage (${staged}/${koSamples.length})`);
}

// ── 3. Knockout local search never worsens the projected rank ──
// The polish is a strict hill-climb; on a constrained late-stage shape the
// projected rank must be no worse than the population baseline (the target's
// rank if all remaining matches go to a neutral home-win), and reported rank
// must still reconcile (already covered) — here we assert it is a valid,
// achievable rank (1..N) and monotone vs. that baseline.
console.log("--- 3. Optimizer result is a valid, non-worse rank ---");
{
  const forms = genForms(12);
  const actual = fullResults(allCodes[5], allCodes[30]);
  const remainSet = new Set(["SF-1", "SF-2", "3RD-1", "F-1"]);
  const played = {};
  for (const id of Object.keys(actual)) if (!remainSet.has(id)) played[id] = actual[id];

  // Baseline: every remaining match is a 1-0 home win (a concrete legal scenario).
  const baseline = { ...played };
  // resolve round by round so KO matchups exist before assigning
  for (const round of ["SF", "3RD", "F"]) {
    const br = calcBracketTeams(baseline);
    for (const m of knockoutMatches.filter((x) => x.stage === round && remainSet.has(x.id))) {
      const t = br[m.id];
      if (t?.home && t?.away) baseline[m.id] = { homeScore: 1, awayScore: 0, stage: m.stage };
    }
  }

  let ok = true;
  for (const target of Object.keys(forms)) {
    const bc = computeBestCase(target, forms, played);
    const baseRank = leaderboardRankScore(target, forms, baseline).rank;
    if (!(bc.projectedRank >= 1 && bc.projectedRank <= bc.totalForms)) ok = false;
    if (bc.projectedRank > baseRank) {
      ok = false;
      if (failures.length < 6) console.error(`    ${target}: optimized rank ${bc.projectedRank} worse than baseline ${baseRank}`);
    }
  }
  assert(ok, "optimized projected rank is valid and never worse than a concrete baseline scenario");
}

// ── 4. Static guard: scoreForms normalises stage before scoring ──
console.log("--- 4. Static wiring (stage normalisation stays in place) ---");
{
  const src = readMigratedSrc("src/utils/bestCase.ts");
  assert(/STAGE_BY_ID/.test(src), "bestCase builds a STAGE_BY_ID lookup");
  assert(/function withStage/.test(src), "bestCase has a withStage normaliser");
  // scoreForms must run trial results through withStage (so KO matches are not
  // mis-scored as group + the wrong-matchup gate is enforced).
  assert(/const trialResults = withStage\(/.test(src), "scoreForms normalises stage on trial results before scoring");
  assert(/bestResults: withStage\(/.test(src), "computeBestCase returns stage-tagged bestResults");
}

console.log(`\n=== BEST-CASE OPTIMIZER RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
