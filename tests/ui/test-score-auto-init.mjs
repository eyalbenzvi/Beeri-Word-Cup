// Tests for auto-init-team-score feature in MatchCard.jsx
// When a user sets the score of one team for the first time (null -> number),
// the other team's score is auto-initialized from null to 0.
//
// Also regression-tests two related bugs: "filled" / "hasScore" checks that
// previously ignored awayScore, causing partial predictions to be counted
// as filled.

import { readFileSync } from "fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== SCORE AUTO-INIT TESTS ===\n");

// ============================================================
// 1. Pure logic reimplementation — must stay in sync with the
//    buildPredictionUpdate helper in src/components/MatchCard.jsx.
// ============================================================
console.log("--- 1. buildPredictionUpdate semantics ---");

function buildPredictionUpdate(prediction, side, value, isKnockout = false) {
  const key = side === "home" ? "homeScore" : "awayScore";
  const otherKey = side === "home" ? "awayScore" : "homeScore";
  const p = { ...prediction, [key]: value };
  if (value !== null && value !== undefined && (prediction?.[otherKey] === null || prediction?.[otherKey] === undefined)) {
    p[otherKey] = 0;
  }
  if (isKnockout) delete p.advancingTeam;
  return p;
}

// 1a. Null -> number on home auto-inits away to 0
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: null }, "home", 2);
  assert(r.homeScore === 2 && r.awayScore === 0, "home 2 with both null -> home=2, away=0");
}

// 1b. Null -> number on away auto-inits home to 0
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: null }, "away", 3);
  assert(r.homeScore === 0 && r.awayScore === 3, "away 3 with both null -> home=0, away=3");
}

// 1c. Setting home to 0 (not null) still auto-inits away
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: null }, "home", 0);
  assert(r.homeScore === 0 && r.awayScore === 0, "home 0 with both null -> home=0, away=0");
}

// 1d. Missing prediction object (undefined) — treated like fresh
{
  const r = buildPredictionUpdate(undefined, "home", 1);
  assert(r.homeScore === 1 && r.awayScore === 0, "undefined prediction + home 1 -> home=1, away=0");
}

// 1e. Empty prediction object {} — treated like both null
{
  const r = buildPredictionUpdate({}, "away", 5);
  assert(r.homeScore === 0 && r.awayScore === 5, "empty {} + away 5 -> home=0, away=5");
}

// 1f. Does NOT overwrite existing away=1 when user edits home
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: 1 }, "home", 2);
  assert(r.homeScore === 2 && r.awayScore === 1, "home 2 with away=1 -> away stays 1 (not overwritten)");
}

// 1g. Does NOT overwrite existing away=0 (already set) when user edits home
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: 0 }, "home", 2);
  assert(r.homeScore === 2 && r.awayScore === 0, "home 2 with away=0 -> away stays 0 (already set, not a re-init)");
}

// 1h. Clearing home (number -> null) does NOT auto-init away
{
  const r = buildPredictionUpdate({ homeScore: 2, awayScore: null }, "home", null);
  assert(r.homeScore === null && r.awayScore === null, "clearing home -> away stays null (no auto-init on clear)");
}

// 1i. Clearing away (number -> null) does NOT auto-init home
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: 2 }, "away", null);
  assert(r.homeScore === null && r.awayScore === null, "clearing away -> home stays null");
}

// 1j. Editing home when both are already set — only home changes
{
  const r = buildPredictionUpdate({ homeScore: 1, awayScore: 2 }, "home", 3);
  assert(r.homeScore === 3 && r.awayScore === 2, "editing home with both set -> only home changes");
}

// 1k. Knockout: setting a score deletes advancingTeam
{
  const r = buildPredictionUpdate({ homeScore: 1, awayScore: 1, advancingTeam: "BRA" }, "home", 2, true);
  assert(r.homeScore === 2 && r.advancingTeam === undefined, "knockout: score change clears advancingTeam");
}

// 1l. Knockout: first-time set also auto-inits + no advancingTeam yet
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: null }, "home", 1, true);
  assert(r.homeScore === 1 && r.awayScore === 0 && !("advancingTeam" in r), "knockout first-set auto-inits away=0");
}

// 1m. Group stage: advancingTeam (if somehow present) is NOT deleted
{
  const r = buildPredictionUpdate({ homeScore: 1, awayScore: 1, advancingTeam: "BRA" }, "home", 2, false);
  assert(r.advancingTeam === "BRA", "group stage: advancingTeam preserved when isKnockout=false");
}

// 1n. Explicit undefined is treated like null (legacy data)
{
  const r = buildPredictionUpdate({ homeScore: undefined, awayScore: undefined }, "away", 4);
  assert(r.homeScore === 0 && r.awayScore === 4, "undefined other side -> auto-init to 0");
}

// 1o. Undefined NEW value should NOT overwrite existing other side (defensive)
{
  const r = buildPredictionUpdate({ homeScore: null, awayScore: null }, "home", undefined);
  assert(!(r.awayScore === 0), "undefined value should not trigger auto-init");
  assert(r.homeScore === undefined, "undefined value applied to home as-is");
}

// ============================================================
// 2. Source-level guarantee: MatchCard.jsx actually uses the helper
//    in all 6 score-setting callsites (2 inputs + 4 +/- buttons).
// ============================================================
console.log("--- 2. MatchCard.jsx callsites wired to helper ---");

const matchCardSrc = readMigratedSrc(resolve(ROOT, "src/components/MatchCard.jsx"), "utf8");

assert(/buildPredictionUpdate\s*=/.test(matchCardSrc), "buildPredictionUpdate is defined in MatchCard.jsx");

// Count callsites that invoke the helper
const callMatches = matchCardSrc.match(/buildPredictionUpdate\(\s*["'](home|away)["']/g) || [];
assert(callMatches.length >= 6, `buildPredictionUpdate called from >=6 sites (input onChange + 4 +/- buttons), got ${callMatches.length}`);

// Ensure the old inline pattern is gone — no direct `{...prediction, homeScore: v}` that bypasses the helper
const inlineHome = matchCardSrc.match(/\{\s*\.\.\.prediction\s*,\s*homeScore:/g) || [];
const inlineAway = matchCardSrc.match(/\{\s*\.\.\.prediction\s*,\s*awayScore:/g) || [];
assert(inlineHome.length === 0, `no inline {...prediction, homeScore:} patterns remain (found ${inlineHome.length})`);
assert(inlineAway.length === 0, `no inline {...prediction, awayScore:} patterns remain (found ${inlineAway.length})`);

// Guard: the auto-init condition exists
assert(
  /prediction\?\.\[otherKey\]\s*===\s*null/.test(matchCardSrc),
  "auto-init checks prediction[otherKey] === null",
);

// Guard: clamping is preserved
assert(/const\s+clampScore\s*=/.test(matchCardSrc), "clampScore helper still present");

// ============================================================
// 3. Related bug: ProgressHub "filled" counter must require both scores.
// ============================================================
console.log("--- 3. ProgressHub.jsx filled counter ---");

const progressSrc = readMigratedSrc(resolve(ROOT, "src/components/ProgressHub.jsx"), "utf8");

assert(
  /p\.homeScore\s*!=\s*null\s*&&\s*p\.awayScore\s*!=\s*null/.test(progressSrc) ||
  /awayScore\s*!==\s*null/.test(progressSrc) && /awayScore\s*!==\s*undefined/.test(progressSrc),
  "ProgressHub filled counter now requires awayScore too",
);

// Simulate the logic
function progressHubIsFilled(p) {
  return p != null && p.homeScore != null && p.awayScore != null;
}
assert(progressHubIsFilled({ homeScore: 1, awayScore: 0 }) === true, "filled: 1-0");
assert(progressHubIsFilled({ homeScore: 0, awayScore: 0 }) === true, "filled: 0-0");
assert(progressHubIsFilled({ homeScore: 5, awayScore: null }) === false, "NOT filled: partial (awayScore null)");
assert(progressHubIsFilled({ homeScore: null, awayScore: 2 }) === false, "NOT filled: partial (homeScore null)");
assert(progressHubIsFilled(null) === false, "NOT filled: null prediction");
assert(progressHubIsFilled(undefined) === false, "NOT filled: undefined prediction");
assert(progressHubIsFilled({}) === false, "NOT filled: empty object");

// ============================================================
// 4. Related bug: AllForms "hasScore" must require both scores.
// ============================================================
console.log("--- 4. AllForms.jsx hasScore check ---");

const allFormsSrc = readMigratedSrc(resolve(ROOT, "src/pages/AllForms.jsx"), "utf8");

// Extract the hasScore assignment (the first one)
const hasScoreMatch = allFormsSrc.match(/const\s+hasScore\s*=\s*([\s\S]+?);/);
assert(hasScoreMatch !== null, "AllForms hasScore declaration exists");
const hasScoreExpr = hasScoreMatch ? hasScoreMatch[1] : "";
assert(/awayScore/.test(hasScoreExpr), "AllForms hasScore now references awayScore too");
assert(/homeScore/.test(hasScoreExpr), "AllForms hasScore still references homeScore");

// Simulate
function allFormsHasScore(prediction) {
  return prediction?.homeScore != null && prediction?.awayScore != null;
}
assert(allFormsHasScore({ homeScore: 1, awayScore: 0 }) === true, "AllForms hasScore: 1-0");
assert(allFormsHasScore({ homeScore: 0, awayScore: 0 }) === true, "AllForms hasScore: 0-0");
assert(allFormsHasScore({ homeScore: 5, awayScore: null }) === false, "AllForms hasScore: partial (null away)");
assert(allFormsHasScore({ homeScore: null, awayScore: 2 }) === false, "AllForms hasScore: partial (null home)");
assert(allFormsHasScore(null) === false, "AllForms hasScore: null prediction");
assert(allFormsHasScore(undefined) === false, "AllForms hasScore: undefined prediction");

// ============================================================
// 5. Cross-check: isScoreValid (in helpers.js) already required both
//    scores. Confirm the auto-init feature produces predictions that
//    pass isScoreValid after the first edit.
// ============================================================
console.log("--- 5. isScoreValid compatibility with auto-init ---");

function isScoreValid(pred) {
  return pred != null &&
    pred.homeScore != null && pred.homeScore !== "" &&
    pred.awayScore != null && pred.awayScore !== "";
}

// After a first-time edit on home, prediction is valid.
{
  const after = buildPredictionUpdate({ homeScore: null, awayScore: null }, "home", 3);
  assert(isScoreValid(after), "after first home edit -> isScoreValid=true (auto-init makes it scorable)");
}

// After a first-time edit on away, prediction is valid.
{
  const after = buildPredictionUpdate({ homeScore: null, awayScore: null }, "away", 1);
  assert(isScoreValid(after), "after first away edit -> isScoreValid=true");
}

// Clearing one side makes it invalid again.
{
  const cleared = buildPredictionUpdate({ homeScore: 3, awayScore: 0 }, "home", null);
  assert(!isScoreValid(cleared), "clearing home -> isScoreValid=false");
}

// ============================================================
// Done
// ============================================================
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFAILURES:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
