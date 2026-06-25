// Regression tests for viewing OTHER users' forms with the same rich surface
// the owner sees for their own form (group standings tables + knockout bracket
// tree), not just a flat score list.
//
// Contract pinned here:
//   1. AllForms' expanded form card renders FormPredictionView (the rich,
//      stages⇄bracket view), NOT the old flat FormMatchesView list.
//   2. FormPredictionView reuses the SAME shared building blocks the owner's
//      Predict/Results views use — GroupTable (standings), BracketView
//      (knockout tree), StageSelector, GroupSelector — so there is no
//      duplicated standings/bracket logic.
//   3. The form's predictions feed those components with no reshaping:
//      GroupTable.matchData = predictions, BracketView.results = predictions.
//   4. KO matchups resolve from the predicted bracket (getCachedBracket), and
//      the shared MatchRow is reused (no row-rendering duplication).
//   5. FormMatchesView still exists + exports MatchRow (BestCasePanel depends
//      on the flat list; the row is shared, not copied).

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== FORM PREDICTION VIEW TESTS ===\n");

// ---- 1. AllForms wires the rich view into the expanded card ----
console.log("--- 1. AllForms uses FormPredictionView ---");
const allForms = readMigratedSrc("src/pages/AllForms.jsx");
assert(/import FormPredictionView from "\.\.\/components\/FormPredictionView"/.test(allForms),
  "AllForms imports FormPredictionView");
assert(/<FormPredictionView predictions=\{predictions\} \/>/.test(allForms),
  "AllForms renders FormPredictionView with the form's predictions");
assert(!/<FormMatchesView/.test(allForms),
  "AllForms no longer renders the flat FormMatchesView");

// ---- 2 + 3. FormPredictionView reuses shared blocks, fed by predictions ----
console.log("--- 2/3. FormPredictionView reuses GroupTable + BracketView ---");
const fpv = readMigratedSrc("src/components/FormPredictionView.jsx");

assert(/import GroupTable from "\.\/GroupTable"/.test(fpv),
  "FormPredictionView reuses the shared GroupTable (standings)");
assert(/import BracketView from "\.\/BracketView"/.test(fpv),
  "FormPredictionView reuses the shared BracketView (knockout tree)");
assert(/import StageSelector from "\.\/StageSelector"/.test(fpv),
  "FormPredictionView reuses the shared StageSelector");
assert(/import GroupSelector from "\.\/GroupSelector"/.test(fpv),
  "FormPredictionView reuses the shared GroupSelector");

assert(/<GroupTable matchData=\{predictions\} group=\{selectedGroup\} \/>/.test(fpv),
  "GroupTable is fed the form's predictions as matchData (no reshape)");
assert(/<BracketView results=\{predictions\} bracketTeams=\{bracketTeams\} \/>/.test(fpv),
  "BracketView is fed the form's predictions as results (no reshape)");

// ---- 4. KO bracket derived via the shared cache; MatchRow reused ----
console.log("--- 4. KO derivation + shared MatchRow ---");
assert(/import \{ getCachedBracket \} from "\.\.\/utils\/bracketCache"/.test(fpv),
  "FormPredictionView derives KO teams via the shared bracket cache");
assert(/getCachedBracket\(predictions\)/.test(fpv),
  "bracketTeams is derived from the form's predictions");
assert(/import \{ MatchRow(?:, type Prediction)? \} from "\.\/FormMatchesView"/.test(fpv),
  "FormPredictionView reuses the shared MatchRow (no row duplication)");
assert(/<MatchRow\b/.test(fpv),
  "FormPredictionView renders rows through the shared MatchRow");

// A stages⇄bracket toggle exists so the viewer can reach both surfaces.
assert(/setViewMode\("bracket"\)/.test(fpv) && /setViewMode\("stages"\)/.test(fpv),
  "FormPredictionView exposes a stages⇄bracket toggle");

// ---- 5. FormMatchesView still exports the shared MatchRow ----
console.log("--- 5. FormMatchesView still exports MatchRow ---");
const fmv = readMigratedSrc("src/components/FormMatchesView.jsx");
assert(/export function MatchRow\(/.test(fmv),
  "FormMatchesView exports MatchRow for reuse");
assert(/export default function FormMatchesView\(/.test(fmv),
  "FormMatchesView default export survives (BestCasePanel flat list)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
