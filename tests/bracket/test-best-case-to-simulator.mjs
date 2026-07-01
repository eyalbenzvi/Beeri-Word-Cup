// Regression tests for the "פתח בסימולטור" hand-off from the best-case panel.
//
// Feature: the best-case optimizer (Leaderboard → BestCasePanel) produces a
// full results scenario that lands a form at its highest achievable rank. The
// user can now push that scenario into the shared SimulatorPanel and tweak it.
//
// Correctness bar this suite locks in:
//   1. bestResultsToSimulatorOverrides shapes each remaining match like the
//      simulator's own handleSaveResult (stage/group/teams/played + the
//      advancing-team tie-break for KO draws), and SKIPS already-played
//      matches (those are the simulator's fixed base, not overrides).
//   2. PARITY: feeding {played + converter-overrides} back through the exact
//      leaderboard scoring core reproduces the best-case projectedRank /
//      projectedScore — i.e. the simulator the user lands on shows the same
//      standing the panel promised. (Top-scorer bonus excluded on both sides,
//      matching the panel's "ללא מלך שערים".)
//   3. The one-shot simulatorSeed channel is read-and-cleared (applied once).
//   4. Static wiring: panel builds the seed + navigates; SimulatorPanel
//      consumes the seed gated on acceptSeed; Simulator page opts in.
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { predictScenario } from "/home/user/Beeri-World-Cup/src/utils/scenarioPredictor.ts";
import { groupMatches, knockoutMatches } from "/home/user/Beeri-World-Cup/src/data/matches.ts";
import { calcBracketTeams } from "/home/user/Beeri-World-Cup/src/utils/bracket.ts";
import { GROUPS } from "/home/user/Beeri-World-Cup/src/data/teams.ts";
import {
  computeBestCase,
  bestResultsToSimulatorOverrides,
} from "/home/user/Beeri-World-Cup/src/utils/bestCase.ts";
import {
  computeScoredForms,
  assignDenseRanks,
} from "/home/user/Beeri-World-Cup/src/utils/leaderboardCore.ts";
import {
  setSimulatorSeed,
  takeSimulatorSeed,
  hasSimulatorSeed,
} from "/home/user/Beeri-World-Cup/src/utils/simulatorSeed.ts";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== BEST-CASE → SIMULATOR HAND-OFF ===\n");

// ── World builders (shared with the optimizer suite) ──────────────
const allCodes = Object.values(GROUPS).flat().map((t) => t.code);
const stageOf = {};
for (const m of groupMatches) stageOf[m.id] = "group";
for (const m of knockoutMatches) stageOf[m.id] = m.stage;

let seed = 987654;
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
function withStage(results) {
  const out = {};
  for (const [mid, p] of Object.entries(results))
    out[mid] = { ...p, stage: p.stage || stageOf[mid] || "group" };
  return out;
}
function leaderboardRankScore(targetId, forms, results) {
  const r = withStage(results);
  const core = computeScoredForms(r, forms, { champion: null, topScorers: [] }, r, false);
  const ranked = assignDenseRanks(core.scoredForms);
  const e = ranked.find((x) => x.formId === targetId);
  return { rank: e.rank, score: e.totalPoints };
}

// ── 1. Converter shape + skip-played ──────────────────────────────
console.log("--- 1. Converter shapes overrides + skips played matches ---");
{
  // Hand-built best-case scenario: mixes a played group match, a remaining
  // group match, a decisive KO match, and a drawn KO match (advancing team).
  const played = {
    "group-A-1": { homeScore: 2, awayScore: 0, stage: "group" },
  };
  const bestResults = {
    "group-A-1": { homeScore: 2, awayScore: 0, stage: "group" }, // already played
    "group-A-2": { homeScore: 1, awayScore: 1, stage: "group" }, // remaining group
    "R32-1": { homeScore: 3, awayScore: 1, stage: "R32" },       // decisive KO
    "R32-2": { homeScore: 1, awayScore: 1, stage: "R32", advancingTeam: "XYZ" }, // KO draw
  };

  const ov = bestResultsToSimulatorOverrides(bestResults, played);

  assert(!("group-A-1" in ov), "played match is excluded from overrides");
  assert("group-A-2" in ov && "R32-1" in ov && "R32-2" in ov, "all remaining matches converted");

  const g = ov["group-A-2"];
  assert(g && g.stage === "group" && g.group === "A", "group override carries stage=group + group letter");
  assert(g.played === true, "override marked played:true (matches handleSaveResult)");
  assert(g.homeTeam && g.awayTeam, "group override carries fixture team codes");
  assert(typeof g.homeScore === "number" && typeof g.awayScore === "number", "override scores are numeric");

  const ko = ov["R32-1"];
  assert(ko && ko.stage === "R32" && ko.group === null, "KO override carries KO stage + null group");

  const draw = ov["R32-2"];
  assert(draw && draw.advancingTeam === "XYZ", "KO draw carries the advancing team");
  assert(draw.needsAdvancingTeam === false, "KO draw is not flagged as needing an advancing team");

  // A decisive KO result must NOT carry an advancingTeam field (winner is implied).
  assert(!("advancingTeam" in ko), "decisive KO override has no advancingTeam field");

  // Empty / null played map still works (treat everything as remaining).
  const ovAll = bestResultsToSimulatorOverrides(bestResults, null);
  assert("group-A-1" in ovAll, "null played map → nothing skipped");
}

// ── 2. PARITY: seeded simulator reproduces the panel's projection ──
// The whole point of the hand-off: the standing the simulator shows for the
// scenario must equal the projectedRank/projectedScore the panel reported.
console.log("--- 2. Seeded simulator == best-case projection (rank + score) ---");
{
  const forms = genForms(14);
  const actual = fullResults(allCodes[3], allCodes[20]);

  // Same played-state shapes the optimizer suite reconciles against.
  const remainSets = [
    knockoutMatches.map((m) => m.id),                                  // all KO remaining
    ["SF-1", "SF-2", "3RD-1", "F-1"],                                  // semis onward
    ["QF-1", "QF-2", "QF-3", "QF-4", "SF-1", "SF-2", "3RD-1", "F-1"],  // quarters onward
  ];

  let reconciled = 0, total = 0;
  for (const remain of remainSets) {
    const remainSet = new Set(remain);
    const played = {};
    for (const id of Object.keys(actual)) if (!remainSet.has(id)) played[id] = actual[id];

    for (const target of Object.keys(forms)) {
      const bc = computeBestCase(target, forms, played);
      // Reconstruct the simulator's effective results: real base + overrides,
      // exactly as SimulatorPanel merges displayBase (realResults) with override.
      const overrides = bestResultsToSimulatorOverrides(bc.bestResults, played);
      const effective = { ...played, ...overrides };
      const sim = leaderboardRankScore(target, forms, effective);
      total++;
      if (sim.rank === bc.projectedRank && sim.score === bc.projectedScore) reconciled++;
      else if (failures.length < 6)
        console.error(`    mismatch (${remain.length} rem) ${target}: panel r=${bc.projectedRank}/s=${bc.projectedScore} vs sim r=${sim.rank}/s=${sim.score}`);
    }
  }
  assert(reconciled === total, `seeded simulator reproduces the panel's projection (${reconciled}/${total})`);
}

// ── 3. Overrides never touch already-played matches (base is fixed) ──
console.log("--- 3. Overrides are disjoint from the played base ---");
{
  const forms = genForms(8);
  const actual = fullResults(allCodes[1], allCodes[9]);
  const remainSet = new Set(["QF-1", "QF-2", "QF-3", "QF-4", "SF-1", "SF-2", "3RD-1", "F-1"]);
  const played = {};
  for (const id of Object.keys(actual)) if (!remainSet.has(id)) played[id] = actual[id];

  const bc = computeBestCase("f0", forms, played);
  const overrides = bestResultsToSimulatorOverrides(bc.bestResults, played);
  const overlap = Object.keys(overrides).filter((id) => id in played);
  assert(overlap.length === 0, "no override collides with a played match");
  // Every override key is a genuinely remaining match.
  const allRemaining = Object.keys(overrides).every((id) => remainSet.has(id));
  assert(allRemaining, "every override is a remaining (unplayed) match");
}

// ── 4. simulatorSeed channel: one-shot read-and-clear ─────────────
console.log("--- 4. simulatorSeed is applied exactly once ---");
{
  setSimulatorSeed(null); // clean slate
  assert(hasSimulatorSeed() === false, "empty holder starts cleared");
  assert(takeSimulatorSeed() === null, "take on empty holder returns null");

  const payload = { "R32-1": { homeScore: 1, awayScore: 0, stage: "R32" } };
  setSimulatorSeed(payload);
  assert(hasSimulatorSeed() === true, "seed present after set");
  const taken = takeSimulatorSeed();
  assert(taken === payload, "take returns the stashed seed");
  assert(hasSimulatorSeed() === false, "seed cleared after take (one-shot)");
  assert(takeSimulatorSeed() === null, "second take returns null (not re-applied)");

  // Empty map is treated as no-seed (guards a stale scenario leaking).
  setSimulatorSeed({});
  assert(hasSimulatorSeed() === false, "empty-map seed is treated as no seed");
}

// ── 5. Static wiring ──────────────────────────────────────────────
console.log("--- 5. Static wiring ---");
{
  const panel = readMigratedSrc("src/components/BestCasePanel.tsx");
  assert(/bestResultsToSimulatorOverrides/.test(panel), "BestCasePanel builds simulator overrides");
  assert(/setSimulatorSeed/.test(panel), "BestCasePanel stashes the seed");
  assert(/navigate\(["']simulator["']\)/.test(panel), "BestCasePanel navigates to the simulator");
  assert(/onOpenInSimulator/.test(panel), "BestCasePanel wires the open-in-simulator handler into the overlay");

  const sim = readMigratedSrc("src/components/SimulatorPanel.tsx");
  assert(/takeSimulatorSeed/.test(sim), "SimulatorPanel consumes the seed");
  assert(/acceptSeed/.test(sim), "SimulatorPanel gates seeding on acceptSeed");
  assert(/seedConsumedRef/.test(sim), "SimulatorPanel guards one-shot consumption (strict-mode safe)");
  // The "scenario loaded" banner must drop the moment the map diverges from the
  // pristine seed (any manual edit or per-match clear), so it can never
  // reappear labelling a hand-entered result as the optimum.
  {
    const clearOneBody = sim.slice(sim.indexOf("const clearOne"), sim.indexOf("const clearSim"));
    const setResultBody = sim.slice(sim.indexOf("const setOverrideResult"), sim.indexOf("const switchMode"));
    assert(/setSeededFromBestCase\(false\)/.test(clearOneBody), "clearOne drops the best-case banner flag");
    assert(/setSeededFromBestCase\(false\)/.test(setResultBody), "manual edit (setOverrideResult) drops the best-case banner flag");
  }

  const page = readMigratedSrc("src/pages/Simulator.tsx");
  assert(/acceptSeed/.test(page), "Simulator page opts into seeding");

  const bc = readMigratedSrc("src/utils/bestCase.ts");
  assert(/export function bestResultsToSimulatorOverrides/.test(bc), "converter is exported from bestCase");
}

console.log(`\n=== BEST-CASE → SIMULATOR RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
