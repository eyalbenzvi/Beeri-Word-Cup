// Regression tests for the offline-mode rollout: every primary tab is
// reachable by a logged-out visitor, every guest page surfaces a
// LoginPrompt, and the AllForms refactor is wired through FormsHub with
// the correct default tab per auth state.
//
// Static-grep audits only — no runtime mounting. The intent is to lock the
// pattern in place so a future refactor can't silently regress to "guest
// dead-ends on WelcomeScreen".

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== OFFLINE-MODE TABS REGRESSION ===\n");

// ============================================================
// 1. App.jsx — guest visitors reach every primary tab
// ============================================================
console.log("--- 1. App routes every guest page through AppShell ---");
const app = readMigratedSrc("src/App.jsx");

assert(/GUEST_PAGES\s*=\s*new\s+Set\(/.test(app),
  "GUEST_PAGES allow-list is defined in App.jsx");

for (const id of ["home", "predict", "leaderboard", "results", "stats", "blog"]) {
  assert(new RegExp(`GUEST_PAGES\\s*=\\s*new\\s+Set\\(\\[[^\\]]*"${id}"`).test(app),
    `GUEST_PAGES allow-list includes "${id}"`);
}

// Guest branch: when not logged in, only HOME (or unknown pages) drops to
// WelcomeScreen — every other GUEST_PAGE renders inside AppShell so the
// shared shell + nav are present.
assert(/page\s*===\s*"home"\s*\|\|\s*!GUEST_PAGES\.has\(page\)/.test(app),
  "App routes guest 'home' (and unknown pages) to WelcomeScreen");
assert(/<AppShell\s+page=\{page\}\s+Page=\{Page\}\s*\/>/.test(app),
  "App renders AppShell for guest pages other than home");

// Public-mode init must run on EVERY guest page now (was blog-only).
assert(/initPublicReadonlyMode\(\)/.test(app), "App calls initPublicReadonlyMode");
assert(/authReady\s*&&\s*!isLoggedIn\b[\s\S]{0,80}initPublicReadonlyMode/.test(app),
  "Public mode init fires whenever an unauth visitor is in the app");
assert(!/authReady\s*&&\s*!isLoggedIn\s*&&\s*page\s*===\s*"blog"/.test(app),
  "Public mode init no longer gated on page === 'blog'");

// ============================================================
// 2. Layout.jsx — every primary tab visible for guests
// ============================================================
console.log("\n--- 2. Layout shows every nav tab to guests ---");
const layout = readMigratedSrc("src/components/Layout.jsx");

// Previous code had `user ? [allTabs] : [{home only}]` — the offline
// rollout makes the full list unconditional (admin/profile remain gated
// on user.isAdmin / user existence).
assert(!/user\s*\?\s*\[\s*\{[\s\S]{0,400}\}\s*\]\s*:\s*\[\s*\{\s*id:\s*"home",\s*label:\s*"בית"/.test(layout),
  "Layout no longer gates the nav list on `user` (guests see every primary tab)");
for (const id of ["home", "predict", "leaderboard", "results", "stats"]) {
  assert(new RegExp(`id:\\s*"${id}"`).test(layout), `Layout nav lists "${id}" tab`);
}
// admin/profile must still be gated.
assert(/user\?\.isAdmin/.test(layout), "Layout still gates admin tab on user.isAdmin");

// ============================================================
// 3. publicMode.ts — fetches tournament data for guests
// ============================================================
console.log("\n--- 3. publicMode fetches tournament data ---");
const store = readMigratedSrc("src/store.js");

assert(/get-public-tournament-data/.test(store),
  "publicMode hits the new get-public-tournament-data endpoint");
assert(/fetchPublicTournamentDataOnce/.test(store),
  "fetchPublicTournamentDataOnce helper exists in publicMode");
assert(/publicTournamentTimer\s*=\s*setInterval\(\s*fetchPublicTournamentDataOnce/.test(store),
  "Tournament data is polled on a setInterval");

// Watchdog must mark the new keys ready so leaderboard/stats don't hang
// on a guest viewer when the endpoint is unreachable.
assert(/cache\._ready\.predictions\s*=\s*true/.test(store),
  "Watchdog flips predictions ready");
assert(/cache\._ready\.userDirectory\s*=\s*true/.test(store),
  "Watchdog flips userDirectory ready");
assert(/cache\._ready\.actualBonuses\s*=\s*true/.test(store),
  "Watchdog flips actualBonuses ready");
assert(/cache\._ready\.actualAdvancing\s*=\s*true/.test(store),
  "Watchdog flips actualAdvancing ready");

// Teardown must clear the new timer to avoid a leak on logout/sign-in.
assert(/publicTournamentTimer\s*\)\s*\{[\s\S]{0,80}clearInterval\(publicTournamentTimer\)/.test(store),
  "teardownPublicReadonlyMode clears publicTournamentTimer");

// ============================================================
// 4. Netlify function — privacy gate on predictionsLocked
// ============================================================
console.log("\n--- 4. get-public-tournament-data privacy gate ---");
assert(existsMigratedSrc("netlify/functions/get-public-tournament-data.js"),
  "get-public-tournament-data.js exists");
const netlifyFn = readMigratedSrc("netlify/functions/get-public-tournament-data.js");
assert(/predictionsLocked/.test(netlifyFn),
  "Function reads predictionsLocked from settings");
assert(/if\s*\(\s*!predictionsLocked\s*\)/.test(netlifyFn),
  "Function gates the data return on predictionsLocked");
assert(/admin\.firestore\(\)/.test(netlifyFn),
  "Function uses Admin SDK (bypasses Firestore rules)");
assert(/withSentry/.test(netlifyFn),
  "Function is wrapped with Sentry instrumentation");
// Pre-lock response must not leak predictions/userDirectory.
const preLockBlock = netlifyFn.match(/if\s*\(\s*!predictionsLocked\s*\)[\s\S]*?body:\s*JSON\.stringify\(\s*\{[\s\S]*?\}\s*\)/)?.[0] || "";
assert(/predictions:\s*\{\s*\}/.test(preLockBlock),
  "Pre-lock response has empty predictions");
assert(/userDirectory:\s*\{\s*\}/.test(preLockBlock),
  "Pre-lock response has empty userDirectory");

// ============================================================
// 5. LoginPrompt component + usage
// ============================================================
console.log("\n--- 5. LoginPrompt component + page usage ---");
assert(existsMigratedSrc("src/components/LoginPrompt.jsx"),
  "LoginPrompt component exists");
const loginPrompt = readMigratedSrc("src/components/LoginPrompt.jsx");
assert(/GoogleSignInButton/.test(loginPrompt),
  "LoginPrompt offers Google sign-in");
assert(/PhoneSignIn/.test(loginPrompt),
  "LoginPrompt offers phone sign-in");
assert(/data-testid="login-prompt"/.test(loginPrompt),
  "LoginPrompt has stable data-testid for tests");

// Each guest-relevant page should import LoginPrompt.
for (const page of ["Predict", "Leaderboard", "Stats", "Results"]) {
  const src = readMigratedSrc(`src/pages/${page}.jsx`);
  assert(/import\s+LoginPrompt/.test(src),
    `${page}.jsx imports LoginPrompt for guest fallback`);
}

// ============================================================
// 6. FormsHub — tabbed shell with auth-aware default
// ============================================================
console.log("\n--- 6. FormsHub mine/all tabs ---");
assert(existsMigratedSrc("src/components/FormsHub.jsx"),
  "FormsHub component exists");
const formsHub = readMigratedSrc("src/components/FormsHub.jsx");
assert(/role="tablist"/.test(formsHub),
  "FormsHub has tablist semantics");
assert(/aria-selected/.test(formsHub),
  "FormsHub tabs use aria-selected");
assert(/הטפסים שלי/.test(formsHub) && /כל הטפסים/.test(formsHub),
  "FormsHub renders both Hebrew tab labels");
// Default-tab rule: mine for authed user, all for guest.
assert(/defaultTab[\s\S]{0,80}user\s*\?\s*"mine"\s*:\s*"all"/.test(formsHub),
  "FormsHub default tab is mine when authed, all when guest");
// Mine-tab guest fork: must show a LoginPrompt (no forms to display).
assert(/tab\s*===\s*"mine"[\s\S]{0,400}LoginPrompt/.test(formsHub),
  "FormsHub renders LoginPrompt for guest's 'mine' tab");
// All-tab uses the shared AllFormsView component.
assert(/AllFormsView/.test(formsHub), "FormsHub renders AllFormsView for all tab");

// FormList no longer renders the bottom 'צפייה בטפסים של כולם' button
// unconditionally — the tab is now the entry point. Onlu render when
// `onShowAllForms` is explicitly passed (back-compat shim).
const formList = readMigratedSrc("src/components/FormList.jsx");
assert(/onShowAllForms\s*&&[\s\S]{0,200}צפייה בטפסים של כולם/.test(formList),
  "FormList only shows 'browse all forms' button when onShowAllForms prop is provided");

// AllForms supports `hideHeader` so FormsHub can suppress the duplicate.
const allForms = readMigratedSrc("src/pages/AllForms.jsx");
assert(/hideHeader/.test(allForms),
  "AllForms accepts hideHeader prop");
assert(/!hideHeader\s*&&\s*\(\s*<PageHeader/.test(allForms),
  "AllForms only renders its PageHeader when hideHeader is false");
// `onBack` must be optional — FormsHub doesn't pass it.
assert(/onBack\?:/.test(allForms) || /onBack\s*=\s*[^,)]/.test(allForms),
  "AllForms onBack is optional");

// ============================================================
// 7. Predict — guest fork uses FormsHub instead of dead-end card
// ============================================================
console.log("\n--- 7. Predict guest renders FormsHub ---");
const predict = readMigratedSrc("src/pages/Predict.jsx");
assert(/<FormsHub/.test(predict),
  "Predict renders FormsHub when no active form");
assert(/!user[\s\S]{0,400}<FormsHub[\s\S]{0,200}user=\{null\}/.test(predict),
  "Predict guest fork renders FormsHub with user=null");
assert(/!user[\s\S]{0,400}<LoginPrompt/.test(predict),
  "Predict guest fork includes a LoginPrompt banner");
// The old 🔒 dead-end card with navigate('home') must be gone.
assert(!/loginRequiredTitle[\s\S]{0,200}navigate\("home"\)/.test(predict),
  "Predict no longer dead-ends guest at a navigate('home') card");

// ============================================================
// 8. Leaderboard guest mode — login prompt + no own-form panel
// ============================================================
console.log("\n--- 8. Leaderboard guest fork ---");
const leaderboard = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/isGuest\s*=\s*!user/.test(leaderboard),
  "Leaderboard derives an isGuest flag from useCurrentUser");
assert(/isGuest[\s\S]{0,200}<LoginPrompt/.test(leaderboard),
  "Leaderboard renders LoginPrompt for guest visitors");

// ============================================================
// 9. Stats guest mode — login prompt
// ============================================================
console.log("\n--- 9. Stats guest fork ---");
const stats = readMigratedSrc("src/pages/Stats.jsx");
assert(/isGuest\s*=\s*!currentUser/.test(stats),
  "Stats derives an isGuest flag from useCurrentUser");
assert(/isGuest[\s\S]{0,200}<LoginPrompt/.test(stats),
  "Stats renders LoginPrompt for guest visitors");

// ============================================================
// 10. Results guest mode — login prompt
// ============================================================
console.log("\n--- 10. Results guest fork ---");
const results = readMigratedSrc("src/pages/Results.jsx");
assert(/!user\s*&&[\s\S]{0,200}<LoginPrompt/.test(results),
  "Results renders LoginPrompt for guest visitors");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
