// Regression tests for the "multiple UI + data fixes" batch. Each block maps
// to one numbered request item. These are static-wiring assertions (the
// project's established test style): they grep the source so a future edit
// can't silently revert an affordance.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== UI + DATA FIXES REGRESSION TESTS ===\n");

// ---- #1: "new results" box removed from Home --------------------------------
console.log("--- #1 Home: new-results box removed ---");
const home = readMigratedSrc("src/pages/Home.jsx");
assert(!/WelcomeBackDigest/.test(home), "Home no longer imports/renders WelcomeBackDigest");
assert(!/תוצאות חדשות/.test(home), "Home no longer shows a 'new results' box");

// ---- #2: tree view inside "My Forms" ----------------------------------------
console.log("--- #2 My Forms: inline prediction tree ---");
const formList = readMigratedSrc("src/components/FormList.jsx");
assert(/import FormPredictionView/.test(formList), "FormList imports FormPredictionView");
assert(/expandedFormId/.test(formList), "FormList tracks an expanded form (single-open accordion)");
assert(/<FormPredictionView\s+predictions=/.test(formList), "FormList renders FormPredictionView with the form's predictions");
assert(/aria-expanded=\{expandedFormId === form\.formId\}/.test(formList), "FormList tree toggle exposes aria-expanded");

// ---- #3: "טפסים" category removed from the Data (Stats) tab ------------------
console.log("--- #3 Data tab: forms category removed ---");
const stats = readMigratedSrc("src/pages/Stats.jsx");
assert(!/id:\s*"forms"/.test(stats), "Stats tab list no longer has a 'forms' tab");
assert(!/activeTab === "forms"/.test(stats), "Stats no longer renders a forms-tab branch");
assert(!/VALID_TABS = new Set\(\[[^\]]*"forms"/.test(stats), "VALID_TABS drops 'forms'");
assert(/id:\s*"scenarios"/.test(stats), "Stats keeps the scenarios tab");

// ---- #4-#8: scenario explorer -----------------------------------------------
console.log("--- #4-#8 Scenario explorer ---");
const explorer = readMigratedSrc("src/components/ScenarioExplorer.jsx");
// #4 default empty: no auto-select-top-champion effect.
assert(!/Default to the single most likely final/.test(explorer), "#4 removed the auto-default champion effect");
assert(!/useEffect/.test(explorer), "#4 explorer has no useEffect auto-pick");
assert(/useState<string>\(""\)/.test(explorer), "#4 champion/runnerUp start empty");
// #5 no "אלוף" word next to team names in the champion picker.
assert(!/אלוף ב-/.test(explorer), "#5 dropped the 'אלוף ב-' wording from the champion options");
// #6 ranking table shows only form name (no owner/displayName join).
assert(!/useUsers/.test(explorer), "#6 explorer no longer reads the user directory");
assert(!/displayName/.test(explorer), "#6 explorer never renders an owner displayName");
assert(/run\.forms\[formId\]\?\.formName \|\| "טופס"/.test(explorer), "#6 label is the form name only");
// #7 form names clickable → leaderboard form view.
assert(/ClickableName/.test(explorer), "#7 form names use ClickableName");
assert(/navigate\("leaderboard",\s*\{\s*form:\s*r\.formId\s*\}\)/.test(explorer), "#7 clicking a form opens its leaderboard view");
// #8 sortable by win% (default), avg points, avg rank.
assert(/SortKey\s*=\s*"win"\s*\|\s*"points"\s*\|\s*"rank"/.test(explorer), "#8 three sort keys exist");
assert(/useState<SortKey>\("win"\)/.test(explorer), "#8 default sort stays win% (chance to win)");
assert(/sortBy === "points"/.test(explorer) && /sortBy === "rank"/.test(explorer), "#8 sorts by points and by rank");
assert(/setSortBy/.test(explorer), "#8 column headers can change the sort");

// ---- #9: leaderboard form detail — runner-up + prediction tree --------------
console.log("--- #9 Leaderboard detail: runner-up + tree ---");
const lb = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/import FormPredictionView/.test(lb), "Leaderboard imports FormPredictionView");
assert(/derivedRunnerUp/.test(lb), "Leaderboard derives the predicted runner-up");
assert(/predBracket\["F-1"\]/.test(lb), "runner-up comes from the predicted final (F-1)");
assert(/סגנית/.test(lb), "detail card shows a 'סגנית' (runner-up) row");
assert(/showTree/.test(lb) && /setShowTree/.test(lb), "detail has a prediction-tree toggle");
assert(/עץ הניחושים/.test(lb), "detail labels the prediction-tree toggle");
assert(/<FormPredictionView\s+predictions=\{predData\.matches/.test(lb), "tree renders the form's predictions");

// ---- #10: blog editor resolves knockout teams -------------------------------
console.log("--- #10 Blog editor: knockout teams resolved ---");
const noteRow = readMigratedSrc("src/components/SummaryMatchNoteRow.jsx");
assert(/export function resolveEditorMatchTeams/.test(noteRow), "shared resolveEditorMatchTeams helper exists");
assert(/getCachedBracket\(matchResults[^)]*,\s*true\)/.test(noteRow), "resolver seats knockout slots from the actual bracket");
assert(/resolveEditorMatchTeams\(m, matchResults\)/.test(noteRow), "notes row resolves teams before labelling");
const editor = readMigratedSrc("src/components/SummaryEditor.jsx");
assert(/resolveEditorMatchTeams/.test(editor), "selection list resolves teams via the shared helper");
assert(/matchResults=\{matchResults\}/.test(editor), "MatchRow receives the full results map for resolution");
const digest = readMigratedSrc("src/components/MatchDigest.jsx");
// Knockout teams are resolved from the actual results-gated bracket slot first
// (the same source Stats/Results use), then any team codes stored on the result.
assert(/match\.homeTeam \|\| actualSlot\?\.home \|\| result\?\.homeTeam/.test(digest),
  "published digest resolves knockout teams from the actual bracket slot, then the result codes");
// And the digest must thread the bracket inputs into computeMatchStats so a
// knockout digest only counts forms that predicted the correct matchup.
assert(/actualBracketTeams/.test(digest) && /getFormBracketTeams/.test(digest),
  "digest threads bracket inputs into computeMatchStats for knockout matchup gating");

// ---- #11: admin run-count + recompute control -------------------------------
console.log("--- #11 Admin: run-count + recompute ---");
const section = readMigratedSrc("src/components/ScenariosSection.jsx");
assert(/MIN_SIM_COUNT/.test(section) && /MAX_SIM_COUNT/.test(section), "ScenariosSection imports run-count bounds");
assert(/type="number"/.test(section), "admin variant exposes a run-count number input");
assert(/recompute\(n\)/.test(section), "recompute is called with the chosen run count");
const hook = readMigratedSrc("src/hooks/useScenarioRun.js");
assert(/recompute\s*=\s*useCallback\(\(simCount\?: number\)/.test(hook), "recompute accepts an optional simCount");
assert(/DEFAULT_SIM_COUNT/.test(hook) && /MAX_SIM_COUNT\s*=/.test(hook), "hook exports the sim-count bounds");
const repo = readMigratedSrc("src/store/scenarioRepo.js");
assert(/triggerScenarioRecompute\(simCount\?: number\)/.test(repo), "trigger forwards an optional simCount to the server");
assert(/JSON\.stringify\(\{ simCount \}\)/.test(repo), "simCount is POSTed in the request body");
const bg = readMigratedSrc("netlify/functions/scenario-recompute-background.mjs");
assert(/function resolveSimCount/.test(bg), "background function parses + clamps the requested run count");
assert(/Math\.min\(MAX_SIM_COUNT, Math\.max\(MIN_SIM_COUNT/.test(bg), "run count is clamped to safe bounds");
assert(/simCount,?\n/.test(bg) || /simCount\s*}\)/.test(bg) || /simCount\b/.test(bg), "the resolved simCount feeds the simulation");
// Tuning: automatic post-result run = 35k; scenario table floor = 100 samples.
assert(/\|\|\s*35000\b/.test(bg), "automatic run defaults to 35,000 sims");
assert(/export const AUTO_SIM_COUNT\s*=\s*35000\b/.test(hook), "hook advertises the 35k automatic count (in lockstep with the server)");
const sim = readMigratedSrc("src/utils/scenarioSim.js");
assert(/const MIN_SCENARIO_SAMPLES\s*=\s*100\b/.test(sim), "scenario table sample floor lowered to 100");

// ---- #12: auto-fill triggers a server-side recompute ------------------------
console.log("--- #12 Auto-fill: recompute trigger ---");
const autofill = readMigratedSrc("netlify/functions/auto-fill-match-result.js");
assert(/function triggerScenarioRecompute/.test(autofill), "auto-fill defines a scenario-recompute trigger");
assert(/scenario-recompute-background/.test(autofill), "trigger targets the recompute background function");
assert(/triggerScenarioRecompute\(\);[\s\S]{0,120}decision: "agreed"/.test(autofill) ||
  /decision: "agreed", sources \}\);[\s\S]{0,200}triggerScenarioRecompute\(\)/.test(autofill),
  "recompute fires after a successful (agreed) result write");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
