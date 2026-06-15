// Regression tests for the "clickable entities" UX feature.
//
// Feature: names shown across the app are tappable to navigate — form names
// (→ that form's view) and team names (→ a team detail modal). This file
// asserts the WIRING is in place across the relevant files so a future edit
// can't silently revert the affordance.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== CLICKABLE ENTITIES (UI WIRING) REGRESSION TESTS ===\n");

// ---- Shared building blocks exist -----------------------------------------
assert(existsMigratedSrc("src/components/ClickableName.jsx"), "ClickableName component exists");
assert(existsMigratedSrc("src/components/TeamModal.jsx"), "TeamModal component exists");

const clickable = readMigratedSrc("src/components/ClickableName.jsx");
assert(/<button/.test(clickable), "ClickableName renders a real <button> (keyboard + a11y)");
assert(/stopPropagation\(\)/.test(clickable), "ClickableName stops propagation so it wins inside clickable rows");

const teamModal = readMigratedSrc("src/components/TeamModal.jsx");
assert(/export function TeamModalProvider/.test(teamModal), "TeamModal exports a provider");
assert(/export function useTeamModal/.test(teamModal), "TeamModal exports the useTeamModal hook");
assert(/role="dialog"/.test(teamModal) && /aria-modal="true"/.test(teamModal), "TeamModal is an accessible dialog");
assert(/useFocusTrap/.test(teamModal), "TeamModal traps focus while open");
assert(/Escape/.test(teamModal), "TeamModal closes on Escape");
assert(/ניחשו לאליפות/.test(teamModal), "TeamModal surfaces champion-pick count");

// ---- Provider mounted at the app root --------------------------------------
const app = readMigratedSrc("src/App.jsx");
assert(/TeamModalProvider/.test(app), "App mounts the TeamModalProvider");

// ---- Team names are clickable where teams are displayed ---------------------
for (const [file, label] of [
  ["src/components/GroupTable.jsx", "GroupTable"],
  ["src/pages/Results.jsx", "Results"],
  ["src/components/MatchCard.jsx", "MatchCard"],
]) {
  const src = readMigratedSrc(file);
  assert(/useTeamModal/.test(src), `${label} uses useTeamModal`);
  assert(/ClickableName/.test(src), `${label} renders team names via ClickableName`);
}

// MatchCard must NOT make team names clickable while editing (a tap during
// score entry would be disruptive) — gate is `!editable`.
const matchCard = readMigratedSrc("src/components/MatchCard.jsx");
assert(/!editable\s*\?\s*\(\s*<ClickableName/.test(matchCard.replace(/\n/g, " ")) ||
  /homeTeam && !editable/.test(matchCard), "MatchCard only links team names in read-only mode");

// ---- Form names deep-link to the form's view -------------------------------
const formList = readMigratedSrc("src/components/FormList.jsx");
assert(/ClickableName[\s\S]{0,160}?navigate\("predict", \{ form: form\.formId \}\)/.test(formList),
  "FormList form name links to the form (predict view)");

// ---- Leaderboard opens a form when navigated with ?form= -------------------
const leaderboard = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/params\?\.form/.test(leaderboard), "Leaderboard reads the ?form= deep-link param");
assert(/setParamsPatch\(\{ form: null \}\)/.test(leaderboard), "Leaderboard clears the ?form= param when the detail is closed");
assert(/if \(embedded\) return;/.test(leaderboard), "Leaderboard ignores the deep-link param in embedded admin mode");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
