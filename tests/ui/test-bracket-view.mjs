// Regression tests for the visual knockout bracket view (#5).
//
// Asserts the component exists, renders a column per knockout round in order,
// resolves teams from the actual bracket, marks the advancing side (incl.
// penalties), keeps team names clickable, and is wired as a Results view mode.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== BRACKET VIEW REGRESSION TESTS ===\n");

assert(existsMigratedSrc("src/components/BracketView.jsx"), "BracketView component exists");
const b = readMigratedSrc("src/components/BracketView.jsx");

assert(/ROUND_ORDER = \["R32", "R16", "QF", "SF", "F"\]/.test(b), "rounds rendered R32 → Final in order");
assert(/knockoutMatches\s*\.filter\(\(m\) => m\.stage === stage\)/.test(b), "each column lists that round's matches");
assert(/BRACKET_DISPLAY_ORDER/.test(b) && /\.sort\(\(a, b\) => order\.indexOf/.test(b), "columns stack in bracket order (feeders adjacent), not raw FIFA order");
assert(/bracketTeams\[m\.id\]\?\.home/.test(b), "teams resolved from the actual bracket");
assert(/result\.advancingTeam/.test(b), "advancing side honours the explicit advancing team (penalties)");
assert(/פנדלים/.test(b), "penalty shootout is labelled");
assert(/overflow-x-auto/.test(b), "round columns scroll horizontally on narrow screens");
assert(/ClickableName/.test(b) && /useTeamModal/.test(b), "team names remain clickable to the team modal");
assert(/stage === "3RD"/.test(b), "third-place match included");

// Wiring as a Results view mode.
const r = readMigratedSrc("src/pages/Results.jsx");
assert(/setViewMode\("bracket"\)/.test(r), "Results exposes a bracket view toggle");
assert(/viewMode === "bracket" \?\s*\(?\s*<BracketView/.test(r.replace(/\n/g, " ")), "bracket view renders BracketView");
assert(/<BracketView results=\{results\} bracketTeams=\{bracketTeams\}/.test(r), "BracketView gets results + derived bracket");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
