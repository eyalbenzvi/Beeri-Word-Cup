// Tests for the admin-controlled "best-case scenario" toggle.
//
// The leaderboard "חשב תרחיש מיטבי" button used to auto-unlock the moment the
// group stage finished (isBestCaseAvailable over matchResults). It is now
// gated by an admin switch — settings.bestCaseEnabled — flipped in
// Admin → הגדרות. This suite locks in:
//   - the availability gate logic (strict boolean, safe default),
//   - the note auto-hides exactly when the feature is enabled,
//   - updateSettings merges the flag without dropping predictionsLocked,
//   - the admin "group stage not finished" warning visibility,
//   - public-mode + endpoint normalisation of the flag,
//   - the static wiring (hook gate, admin toggle, defaults).
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== BEST-CASE ADMIN TOGGLE ===\n");

// ============================================================
// 1. Availability gate: mirrors useBestCase `settings?.bestCaseEnabled === true`
// ============================================================
console.log("--- 1. Availability gate ---");
{
  function bestCaseAvailable(settings) {
    return settings?.bestCaseEnabled === true;
  }

  assert(bestCaseAvailable({ bestCaseEnabled: true }) === true, "Enabled flag → available");
  assert(bestCaseAvailable({ bestCaseEnabled: false }) === false, "Disabled flag → unavailable");
  assert(bestCaseAvailable({}) === false, "Missing flag → unavailable (safe default)");
  assert(bestCaseAvailable(null) === false, "Null settings → unavailable (listener not loaded)");
  assert(bestCaseAvailable(undefined) === false, "Undefined settings → unavailable");
  // Strict === true: a stray truthy value must NOT silently enable the feature.
  assert(bestCaseAvailable({ bestCaseEnabled: "true" }) === false, "Truthy string does not enable (strict boolean)");
  assert(bestCaseAvailable({ bestCaseEnabled: 1 }) === false, "Truthy number does not enable (strict boolean)");
  // Independent of lock state.
  assert(bestCaseAvailable({ predictionsLocked: true, bestCaseEnabled: true }) === true, "Available regardless of lock");
}

// ============================================================
// 2. Note visibility: mirrors BestCasePanel idle state `{!available && <note>}`
// ============================================================
console.log("--- 2. Note auto-hides when enabled ---");
{
  function showWaitingNote(available) { return !available; }
  assert(showWaitingNote(false) === true, "Disabled: waiting-for-group-stage note shown");
  assert(showWaitingNote(true) === false, "Enabled: note removed (requirement)");
}

// ============================================================
// 3. updateSettings merge: toggling must not drop sibling keys
// ============================================================
console.log("--- 3. updateSettings merge preserves siblings ---");
{
  // Mirrors store updateSettings: { ...getSettings(), ...newSettings }
  function updateSettings(prev, patch) { return { ...prev, ...patch }; }

  const before = { predictionsLocked: true, bestCaseEnabled: false, topScorerPlayers: [1, 2] };
  const after = updateSettings(before, { bestCaseEnabled: !before.bestCaseEnabled });
  assert(after.bestCaseEnabled === true, "Toggle flips bestCaseEnabled");
  assert(after.predictionsLocked === true, "Toggle preserves predictionsLocked");
  assert(Array.isArray(after.topScorerPlayers) && after.topScorerPlayers.length === 2, "Toggle preserves topScorerPlayers");

  const off = updateSettings(after, { bestCaseEnabled: !after.bestCaseEnabled });
  assert(off.bestCaseEnabled === false, "Toggle is reversible (back to false)");
}

// ============================================================
// 4. Admin warning: shown only when enabled AND group stage incomplete
//    Mirrors: settings.bestCaseEnabled && !isBestCaseAvailable(results)
// ============================================================
console.log("--- 4. Admin slow-compute warning visibility ---");
{
  function showWarning(enabled, groupStageComplete) {
    return !!enabled && !groupStageComplete;
  }
  assert(showWarning(true, false) === true, "Enabled + group stage incomplete → warn");
  assert(showWarning(true, true) === false, "Enabled + group stage complete → no warn");
  assert(showWarning(false, false) === false, "Disabled → no warn (nothing running)");
  assert(showWarning(false, true) === false, "Disabled + complete → no warn");
}

// ============================================================
// 5. Public-mode normalisation: mirrors `!!data?.bestCaseEnabled`
// ============================================================
console.log("--- 5. Public-mode flag normalisation ---");
{
  function normalize(data) { return !!(data && data.bestCaseEnabled); }
  assert(normalize({ bestCaseEnabled: true }) === true, "Public: true preserved");
  assert(normalize({ bestCaseEnabled: false }) === false, "Public: false preserved");
  assert(normalize({}) === false, "Public: missing → false");
  assert(normalize(null) === false, "Public: null doc → false");
}

// ============================================================
// 6. Static wiring assertions
// ============================================================
console.log("--- 6. Static wiring ---");
{
  const hook = readMigratedSrc("src/hooks/useBestCase.ts");
  assert(/bestCaseEnabled\s*===\s*true/.test(hook), "useBestCase gates on settings.bestCaseEnabled === true");
  assert(/useSettings/.test(hook), "useBestCase reads settings via useSettings");
  assert(!/isBestCaseAvailable/.test(hook), "useBestCase no longer uses the old auto group-stage gate");

  // Worker-failure resilience: module Web Workers fail to load on some
  // browsers (iOS Safari / in-app WebViews), erroring on EVERY run. The hook
  // must (a) fall back to computing on the main thread instead of showing a
  // permanent error, and (b) report the failure to Sentry so it is diagnosable
  // (previously the worker's error message was silently discarded).
  assert(/runOnMainThread/.test(hook), "useBestCase has a main-thread fallback");
  assert(/import\(["'][^"']*bestCase["']\)/.test(hook), "fallback dynamically imports computeBestCase (kept out of main bundle)");
  assert(/worker\.onerror/.test(hook), "useBestCase handles worker.onerror (module-load failure)");
  assert(/captureClientMessage|captureClientError/.test(hook), "useBestCase reports worker failures to Sentry");
  // The onerror / worker-error paths must route to the fallback, not straight
  // to a dead error state.
  assert(/onerror[\s\S]{0,120}runOnMainThread/.test(hook), "worker.onerror routes to the main-thread fallback");

  const admin = readMigratedSrc("src/components/AdminSettingsTab.jsx");
  // Lenient on formatting/whitespace: assert the handler hands a TOGGLED
  // bestCaseEnabled to updateSettings, without pinning exact spacing.
  assert(/updateSettings\([\s\S]*?bestCaseEnabled/.test(admin), "Admin toggle writes bestCaseEnabled via updateSettings");
  assert(/!settings\.bestCaseEnabled/.test(admin), "Admin toggle flips the current bestCaseEnabled value");
  assert(/aria-pressed=\{!!settings\.bestCaseEnabled\}/.test(admin), "Admin toggle exposes aria-pressed state");
  assert(/isBestCaseAvailable\(results\)/.test(admin), "Admin warns using isBestCaseAvailable(results)");

  const defaults = readMigratedSrc("src/store/resultsRepo.ts");
  assert(/bestCaseEnabled:\s*false/.test(defaults), "DEFAULT_SETTINGS includes bestCaseEnabled: false");

  const publicMode = readMigratedSrc("src/store/publicMode.ts");
  assert(/bestCaseEnabled:\s*!!/.test(publicMode), "publicMode normalises bestCaseEnabled");

  const endpoint = readMigratedSrc("netlify/functions/get-public-settings.js");
  assert(/bestCaseEnabled:\s*!!\(settingsData/.test(endpoint), "Public settings endpoint exposes bestCaseEnabled");
}

console.log(`\n=== BEST-CASE ADMIN TOGGLE RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
