// Regression tests for the UX recommendations rollout (Phases 1–8).
// Each phase has a small static-audit block asserting that the implemented
// pattern is still in place — these guard against accidental rollback in
// future refactors.
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== UX RECOMMENDATIONS REGRESSION ===\n");

// ---------- Phase 1: URL state ----------
console.log("--- Phase 1: URL state infrastructure ---");
const useNav = readMigratedSrc("src/hooks/useNavigation.jsx");
assert(/KNOWN_PARAM_KEYS.*=\s*\[[^\]]*"form"/s.test(useNav), "useNavigation tracks ?form param");
assert(/KNOWN_PARAM_KEYS.*=\s*\[[^\]]*"stage"/s.test(useNav), "useNavigation tracks ?stage param");
assert(/KNOWN_PARAM_KEYS.*=\s*\[[^\]]*"group"/s.test(useNav), "useNavigation tracks ?group param");
assert(/KNOWN_PARAM_KEYS.*=\s*\[[^\]]*"view"/s.test(useNav), "useNavigation tracks ?view param");
assert(/KNOWN_PARAM_KEYS.*=\s*\[[^\]]*"tab"/s.test(useNav), "useNavigation tracks ?tab param");
assert(/KNOWN_PARAM_KEYS.*=\s*\[[^\]]*"modal"/s.test(useNav), "useNavigation tracks ?modal param");
assert(/setParamsPatch/.test(useNav), "useNavigation exposes setParamsPatch helper");
assert(/VALID_MODALS/.test(useNav), "VALID_MODALS allowlist defined");

const predict = readMigratedSrc("src/pages/Predict.jsx");
assert(/params\?\.form/.test(predict), "Predict reads activeFormId from params.form");
assert(/params\?\.modal\s*===\s*"review"/.test(predict), "Predict reads ReviewScreen state from params.modal");
assert(/params\?\.modal\s*===\s*"search"/.test(predict), "Predict reads MatchSearch state from params.modal");
assert(/params\?\.modal\s*===\s*"scenario"/.test(predict), "Predict reads scenario modal from params.modal");
assert(/params\?\.view\s*===\s*"all"/.test(predict), "Predict reads AllForms view from params.view");
assert(!/setShowConfirm\(/.test(predict), "Predict no longer mutates showConfirm via setState");
assert(!/setShowSearch\(/.test(predict), "Predict no longer mutates showSearch via setState");
assert(!/setShowScenarioModal\(/.test(predict), "Predict no longer mutates showScenarioModal via setState");
assert(!/setShowAllForms\(/.test(predict), "Predict no longer mutates showAllForms via setState");

const usePredict = readMigratedSrc("src/hooks/usePredict.js");
assert(/useNavigation/.test(usePredict), "usePredictPosition reads navigation context");
assert(/setParamsPatch/.test(usePredict), "usePredictPosition writes via setParamsPatch");

const stats = readMigratedSrc("src/pages/Stats.jsx");
assert(/params\?\.tab/.test(stats) || /params\.tab/.test(stats), "Stats reads activeTab from params.tab");

// ---------- Phase 2: Live errors per field ----------
console.log("--- Phase 2: Live errors per field ---");
assert(/aria-invalid/.test(predict), "Predict input fields have aria-invalid attribute");
assert(/aria-describedby/.test(predict), "Predict input fields have aria-describedby attribute");
assert(/InlineError/.test(predict), "Predict imports InlineError for per-field display");
assert(/touchedFields|touched/.test(predict), "Predict tracks touched state per field");
assert(/attemptedSubmit/.test(predict), "Predict tracks attemptedSubmit flag");
assert(/markTouched/.test(predict), "Predict has markTouched helper for blur events");

// ---------- Phase 3: Stats simplification ----------
console.log("--- Phase 3: Stats simplification ---");
const tabIdMatches = (stats.match(/id:\s*"matches"|id:\s*"teams"|id:\s*"forms"|id:\s*"search"|id:\s*"simulate"/g) || []);
assert(!/id:\s*"simulate"/.test(stats), "Stats no longer has simulate tab");
assert(!/id:\s*"search"/.test(stats), "Stats no longer has search tab");
assert(/id:\s*"matches"/.test(stats), "Stats keeps matches tab");
assert(/id:\s*"teams"/.test(stats), "Stats keeps teams tab");
assert(/id:\s*"forms"/.test(stats), "Stats keeps forms tab");
assert(/searchQuery/.test(stats), "Stats has global searchQuery state");
assert(/externalQuery/.test(stats), "SearchStats accepts externalQuery prop");

// Simulator page exists and is registered
let simExists = true;
try {
  readMigratedSrc("src/pages/Simulator.jsx");
} catch {
  simExists = false;
}
assert(simExists, "Simulator page file exists");
const app = readMigratedSrc("src/App.jsx");
assert(/simulator:\s*Simulator/.test(app), "App PAGES map includes simulator");
assert(/"simulator"/.test(useNav), "useNavigation URL_PAGES allows ?page=simulator");

// ---------- Phase 4: Tablet nav + sticky ----------
console.log("--- Phase 4: Tablet nav + sticky offset ---");
const layout = readMigratedSrc("src/components/Layout.jsx");
assert(!/md:flex\s+xl:hidden\s+items-center\s+gap-1/.test(layout), "Layout no longer has tablet header tabs row");
assert(!/top-\[56px\]/.test(predict), "Predict sticky no longer uses top-[56px]");
assert(/sticky\s+top-16/.test(predict), "Predict sticky uses Tailwind native top-16 (64px)");

// ---------- Phase 5: Focus management ----------
console.log("--- Phase 5: Focus management ---");
assert(/scrollToTarget/.test(predict), "scrollToTarget callback present");
// Verify scrollToTarget calls focus() after scrollIntoView. The scrollToTarget
// callback contains both — assert that block of code has them in order with
// nothing else between that would suggest a different feature.
const scrollFocusBlock = predict.match(/const\s+scrollToTarget[\s\S]*?\}\s*,\s*\[/);
assert(
  scrollFocusBlock && /scrollIntoView/.test(scrollFocusBlock[0]) && /focus\(\{\s*preventScroll:\s*true/.test(scrollFocusBlock[0]),
  "scrollToTarget focuses the input with preventScroll after scroll",
);
const aifill = readMigratedSrc("src/components/AIFillOverlay.jsx");
assert(/useFocusTrap/.test(aifill), "AIFillOverlay uses useFocusTrap");
assert(/onCancel/.test(aifill), "AIFillOverlay accepts onCancel prop");
assert(/Escape/.test(aifill), "AIFillOverlay listens for Escape key");
assert(/handleAICancel/.test(predict), "Predict has handleAICancel handler");
assert(/aiCancelledRef/.test(predict), "Predict tracks AI cancellation flag");
const formList = readMigratedSrc("src/components/FormList.jsx");
assert(/newFormBtnRef/.test(formList), "FormList focuses + טופס חדש after delete");
assert(/forms\.length\s*<\s*prevFormCountRef/.test(formList), "FormList detects shrink for focus restore");
assert(/input-formName/.test(predict), "Predict input has stable id for focus");
assert(/focusedFormIdRef/.test(predict), "Predict tracks focused form to avoid duplicate focus");

// ---------- Phase 6: AllForms accordion + Profile link ----------
console.log("--- Phase 6: AllForms accordion + Profile link ---");
const allForms = readMigratedSrc("src/pages/AllForms.jsx");
assert(/expandedFormId/.test(allForms), "AllForms uses single expandedFormId state");
assert(/סגור הכל/.test(allForms), "AllForms shows 'close all' button when something is open");
assert(/aria-expanded/.test(allForms), "AllForms FormCard exposes aria-expanded");
assert(!/useState\(false\)/.test(allForms.split("FormCard(")[1] || ""), "AllForms FormCard no longer keeps internal expanded state");
const profile = readMigratedSrc("src/pages/Profile.jsx");
assert(/view:\s*"all"/.test(profile), "Profile links to AllForms via ?view=all");

// ---------- Phase 7: Profile auto-edit + clickable form cards ----------
console.log("--- Phase 7: Profile auto-edit + clickable form cards ---");
assert(!/setEditing/.test(profile), "Profile no longer has explicit edit-mode toggle");
assert(/isDirty/.test(profile), "Profile uses isDirty pattern");
assert(/navigate\("predict",\s*\{\s*form:\s*form\.formId\s*\}\)/.test(profile), "Profile form cards navigate to /predict with form id");
assert(/<button[\s\S]*?form\.formId[\s\S]*?navigate\("predict"/.test(profile), "Profile form cards rendered as buttons");

// ---------- Phase 8: Onboarding + auto-scroll ----------
console.log("--- Phase 8: Onboarding + auto-scroll ---");
let onboardingExists = true;
try {
  const onboarding = readMigratedSrc("src/components/StatusOnboarding.jsx");
  assert(/beeri:status-onboarding-seen/.test(onboarding), "StatusOnboarding stores 'seen' flag");
  assert(/טיוטה/.test(onboarding) && /ממתין/.test(onboarding) && /הוגש/.test(onboarding), "StatusOnboarding explains all 3 statuses");
} catch {
  onboardingExists = false;
}
assert(onboardingExists, "StatusOnboarding component exists");
assert(/StatusOnboarding/.test(formList), "FormList renders StatusOnboarding");

const leaderboard = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/myForms/.test(leaderboard), "Leaderboard computes myForms list");
assert(/jumpToForm/.test(leaderboard), "Leaderboard exposes jumpToForm helper");
assert(/lb-form-\$\{/.test(leaderboard), "Leaderboard cards have lb-form-{id} anchor ids");
assert(/הטפסים שלך:/.test(leaderboard), "Leaderboard shows 'your forms:' jump banner");
assert(/autoScrolledRef/.test(leaderboard), "Leaderboard guards against double auto-scroll");

// ---------- Summary ----------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
