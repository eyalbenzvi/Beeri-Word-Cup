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
import {
  computeBestCase,
  sanitizeFormsForWorker,
  sanitizeResultsForWorker,
} from "/home/user/Beeri-World-Cup/src/utils/bestCase.ts";
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

// ── 5. Worker-payload sanitization ────────────────────────────────
// The optimizer's inputs come straight off the Firestore-backed store and are
// handed to a Web Worker via postMessage (structured clone). Sanitization is
// DEFENSE-IN-DEPTH + input parity (NOT a confirmed diagnosis of the production
// failure — the current data model is all JSON-safe): it projects both maps to
// a plain, cloneable, JSON-safe shape holding only the scoring-relevant fields,
// so (1) the worker and the main-thread fallback score identical inputs, and
// (2) a hypothetical future/legacy non-cloneable field can't throw on
// postMessage. It MUST NOT change the computed result.
console.log("--- 5. Worker-payload sanitization ---");
{
  const forms = genForms(20);
  // Inject production-messy, non-cloneable + Firestore-ish noise into a form.
  forms.f0.__handler = () => 1;              // functions break structuredClone
  forms.f0.submittedAt = new Date();          // class instance (prototype-stripped on clone)
  forms.f0.advancing = { A: ["X"] };          // persisted derived field (recomputed → droppable)
  forms.f0.champion = "BRA";
  forms.f3.status = "approved";               // approved forms are included too

  const actual = fullResults(allCodes[2], allCodes[15]);
  // Post-group-stage shape (the gate the feature runs under): all group matches
  // played, only the bracket remains — plus noisy result rows.
  const played = {};
  for (const id of Object.keys(actual)) {
    if (stageOf[id] === "group") {
      played[id] = { ...actual[id], source: "auto", updatedAt: "x", extra: { nested: 1 } };
    }
  }
  // A couple of played R32 rows + a null placeholder (must stay "open").
  let n = 0;
  for (const m of knockoutMatches) {
    if (m.stage !== "R32" || n++ >= 4) continue;
    played[m.id] = { ...actual[m.id], source: "admin" };
  }
  played["R32-9"] = null;

  const raw = computeBestCase("f0", forms, played);
  const safeForms = sanitizeFormsForWorker(forms);
  const safeResults = sanitizeResultsForWorker(played);
  const san = computeBestCase("f0", safeForms, safeResults);

  // (a) Parity: identical projection from raw vs. sanitized inputs — checked at
  // the aggregate level AND per-match (a sanitization bug that swapped a score
  // for another VALID score would keep rank/score/key-count but change a
  // scoreline; compare every bestResults entry to catch that).
  let bestResultsMatch = raw && san &&
    Object.keys(raw.bestResults).length === Object.keys(san.bestResults).length;
  if (bestResultsMatch) {
    for (const id of Object.keys(raw.bestResults)) {
      const a = raw.bestResults[id], b = san.bestResults[id];
      if (!b ||
          a.homeScore !== b.homeScore ||
          a.awayScore !== b.awayScore ||
          (a.advancingTeam ?? null) !== (b.advancingTeam ?? null) ||
          (a.stage ?? null) !== (b.stage ?? null)) {
        bestResultsMatch = false;
        if (failures.length < 6) console.error(`    bestResults diverged at ${id}`);
        break;
      }
    }
  }
  assert(
    raw && san &&
      raw.projectedRank === san.projectedRank &&
      raw.projectedScore === san.projectedScore &&
      raw.totalForms === san.totalForms &&
      bestResultsMatch,
    "sanitized inputs produce IDENTICAL best-case results (rank/score + per-match scenario)",
  );

  // (b) A non-cloneable value makes the RAW payload fail structured clone, while
  // the sanitized copy survives — i.e. sanitization neutralizes the hazard.
  // (This demonstrates the defense-in-depth property; it is not a claim that
  // production data actually carried such a value.)
  let rawCloneable = true;
  try { structuredClone({ allForms: forms, playedResults: played }); }
  catch { rawCloneable = false; }
  assert(!rawCloneable, "a non-cloneable field makes the raw payload fail structuredClone");

  // (c) The sanitized payload IS structured-cloneable (the fix).
  let sanCloneable = true;
  try { structuredClone({ allForms: safeForms, playedResults: safeResults }); }
  catch (e) { sanCloneable = false; console.error("    sanitized clone threw: " + e.message); }
  assert(sanCloneable, "sanitized payload survives structuredClone (postMessage-safe)");

  // (d) Sanitizer strips non-scoring fields but preserves status + matches.
  const sf0 = safeForms.f0;
  assert(!("__handler" in sf0) && !("submittedAt" in sf0) && !("createdAt" in sf0) &&
         !("advancing" in sf0) && !("champion" in sf0) && !("userId" in sf0),
    "sanitized form drops non-scoring fields (functions, timestamps, derived, userId)");
  assert(sf0.status === "submitted" && safeForms.f3.status === "approved",
    "sanitized form preserves status (submitted + approved)");
  const sampleMid = Object.keys(sf0.matches)[0];
  assert(sampleMid && "homeScore" in sf0.matches[sampleMid] && "awayScore" in sf0.matches[sampleMid],
    "sanitized form matches preserve homeScore/awayScore");

  // (e) The set of form ids is preserved exactly (ranking population unchanged).
  assert(Object.keys(safeForms).sort().join(",") === Object.keys(forms).sort().join(","),
    "sanitizer preserves the full set of form ids");

  // (f) Result rows: scoring fields kept, noise stripped, null placeholder kept falsy.
  const someGroupId = groupMatches[0].id;
  assert("homeScore" in safeResults[someGroupId] && "awayScore" in safeResults[someGroupId] &&
         !("extra" in safeResults[someGroupId]) && !("source" in safeResults[someGroupId]) &&
         !("updatedAt" in safeResults[someGroupId]),
    "sanitized results keep scores, drop noise (source/updatedAt/nested)");
  assert(!safeResults["R32-9"],
    "sanitizer preserves a null result placeholder as falsy (match stays open)");
}

// ── 6. Static wiring: hook sanitizes + guards postMessage + panel boundary ──
console.log("--- 6. Static wiring (sanitization + graceful degradation) ---");
{
  const src = readMigratedSrc("src/utils/bestCase.ts");
  assert(/export function sanitizeFormsForWorker/.test(src), "bestCase exports sanitizeFormsForWorker");
  assert(/export function sanitizeResultsForWorker/.test(src), "bestCase exports sanitizeResultsForWorker");

  const hook = readMigratedSrc("src/hooks/useBestCase.ts");
  assert(/sanitizeFormsForWorker\(allForms\)/.test(hook), "hook sanitizes forms before use");
  assert(/sanitizeResultsForWorker\(matchResults\)/.test(hook), "hook sanitizes results before use");
  // postMessage must send the sanitized payload, wrapped in try/catch → fallback.
  assert(/allForms:\s*safeForms/.test(hook) && /playedResults:\s*safeResults/.test(hook),
    "hook posts the SANITIZED payload to the worker");
  assert(/try\s*\{[\s\S]*worker\.postMessage[\s\S]*\}\s*catch/.test(hook),
    "hook wraps postMessage in try/catch");
  assert(/runOnMainThread\("postmessage-failure"/.test(hook),
    "hook routes a postMessage failure to the main-thread fallback");
  // The main-thread fallback must use the SAME sanitized data.
  assert(/computeBestCase\(formId,\s*safeForms,\s*safeResults/.test(hook),
    "main-thread fallback uses the sanitized data (identical to the worker)");
  // Fallback must refuse a heavy pre-group-stage search (no main-thread freeze).
  assert(/isBestCaseAvailable\(safeResults\)/.test(hook),
    "main-thread fallback gates on isBestCaseAvailable to avoid a UI freeze");

  const panel = readMigratedSrc("src/components/BestCasePanel.tsx");
  assert(/getDerivedStateFromError/.test(panel),
    "BestCasePanel is wrapped in an error boundary (render throws hide the feature)");
  assert(/<BestCasePanelInner/.test(panel) && /BestCasePanelBoundary/.test(panel),
    "default export wraps the inner panel in the feature-local boundary");
}

console.log(`\n=== BEST-CASE OPTIMIZER RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
