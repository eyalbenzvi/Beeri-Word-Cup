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

// Code review #4: teardown must zero the cache slices the public
// fetchers populated, so a re-rendered consumer can't read stale guest
// data in the gap between teardown and the first authed snapshot.
const teardownBlock = store.match(/export function teardownPublicReadonlyMode[\s\S]*?\n\}/)?.[0] || "";
assert(/cache\.predictions\s*=\s*\{\s*\}/.test(teardownBlock),
  "teardown zeros cache.predictions");
assert(/cache\.userDirectory\s*=\s*\{\s*\}/.test(teardownBlock),
  "teardown zeros cache.userDirectory");
assert(/cache\.actualBonuses\s*=\s*\{[\s\S]*?champion:\s*null/.test(teardownBlock),
  "teardown resets cache.actualBonuses to its empty shape");
assert(/cache\.actualAdvancing\s*=\s*\{\s*\}/.test(teardownBlock),
  "teardown zeros cache.actualAdvancing");

// Symmetric negative assertion: teardown must NOT clear cache.settings
// or cache.summaries. cache.settings drives the locked-state gate that
// the authed listener path also relies on; cache.summaries is owned by
// its own listener that gets re-subscribed on sign-in. Clearing either
// would cause a render flash where the locked panel briefly appears or
// the blog list briefly empties.
assert(!/cache\.settings\s*=\s*\{/.test(teardownBlock),
  "teardown does NOT clear cache.settings (would flash locked panel)");
assert(!/cache\.summaries\s*=\s*\{/.test(teardownBlock),
  "teardown does NOT clear cache.summaries (owned by summaries listener)");

// AllForms's filteredForms useMemo dep array must NOT include `users`
// (closure no longer reads it — kept tight so a directory tick doesn't
// recompute the filter). #6 from the code-review.
const allFormsSrc = readMigratedSrc("src/pages/AllForms.jsx");
const filteredFormsBlock = allFormsSrc.match(/const filteredForms\s*=\s*useMemo\([\s\S]*?\}\s*,\s*\[[^\]]*\]\)/)?.[0] || "";
assert(filteredFormsBlock.length > 0,
  "AllForms.filteredForms useMemo block found for dep audit");
assert(!/\busers\b/.test(filteredFormsBlock.match(/\[[^\]]*\]\)$/)?.[0] || ""),
  "AllForms.filteredForms dep array no longer includes `users`");


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

// Code review #5: a missing or malformed FIREBASE_SERVICE_ACCOUNT must
// NOT echo the raw JSON.parse / config error message to anonymous
// clients (would leak our internal config layout). Use a dedicated
// ConfigError class + sanitised generic message.
assert(/class\s+ConfigError\s+extends\s+Error/.test(netlifyFn),
  "Function defines a dedicated ConfigError class for env-var failures");
assert(/FIREBASE_SERVICE_ACCOUNT not set/.test(netlifyFn),
  "Function throws ConfigError when env var is missing");
assert(/throw\s+new\s+ConfigError\([^)]*parse failed/.test(netlifyFn),
  "Function wraps JSON.parse failure in ConfigError");
// Catch path must NOT echo err.message verbatim — should map to a
// stable string like 'Service unavailable' / 'Internal error'.
const catchBlock = netlifyFn.match(/\}\s*catch\s*\(err\)\s*\{[\s\S]*?\}\s*\}/)?.[0] || "";
assert(!/error:\s*err\?\.message/.test(catchBlock),
  "Catch block no longer echoes raw err.message in 500 body");
assert(/Service unavailable|Internal error/.test(catchBlock),
  "Catch block returns sanitised generic error strings");

// ConfigError catch path must call Sentry directly — withSentry only
// sees errors that escape the handler, and the handler swallows its
// own errors to return a sanitised body. Without an explicit capture,
// a misconfig would 500 silently with no ops signal. (Code-review
// second-pass nit A2.)
assert(/Sentry\.captureException/.test(netlifyFn),
  "get-public-tournament-data captures errors directly in its catch");

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

// Each guest-relevant page should import LoginPrompt — except Predict,
// which delegates the guest banner to FormsHub (post code-review #1
// fix). Leaderboard / Stats / Results render LoginPrompt inline.
for (const page of ["Leaderboard", "Stats", "Results"]) {
  const src = readMigratedSrc(`src/pages/${page}.jsx`);
  assert(/import\s+LoginPrompt/.test(src),
    `${page}.jsx imports LoginPrompt for guest fallback`);
}
// FormsHub imports LoginPrompt on Predict's behalf.
const formsHubSrc = readMigratedSrc("src/components/FormsHub.jsx");
assert(/import\s+LoginPrompt/.test(formsHubSrc),
  "FormsHub.jsx imports LoginPrompt (renders the Predict banner for guests)");

// ============================================================
// 6. FormsHub — tabbed shell with auth-aware default + single banner
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

// Single-banner contract (post code-review fix): for guests there is
// EXACTLY one LoginPrompt, rendered as a banner above the tabs. Both
// tabs share that banner — the mine-tab body must NOT render its own
// LoginPrompt card (that previously stacked two prompts under each
// other when Predict's outer banner was also present).
assert(/!user\s*&&[\s\S]{0,200}<LoginPrompt[\s\S]{0,200}variant="banner"/.test(formsHub),
  "FormsHub renders a single LoginPrompt banner for guests above the tabs");
// Mine-tab guest fork must use EmptyState, not a second LoginPrompt.
assert(/tab\s*===\s*"mine"\s*\?[\s\S]{0,400}<EmptyState/.test(formsHub),
  "FormsHub guest mine-tab body is an EmptyState (no duplicate LoginPrompt)");
const loginPromptCount = (formsHub.match(/<LoginPrompt/g) || []).length;
assert(loginPromptCount === 1,
  `FormsHub has exactly one <LoginPrompt> usage (found ${loginPromptCount})`);

// All-tab uses the shared AllFormsView component.
assert(/AllFormsView/.test(formsHub), "FormsHub renders AllFormsView for all tab");

// Eager-preload of the AllForms chunk so first tab switch doesn't flash
// a Suspense fallback. Implemented as a useEffect calling the same
// loader the lazy() factory uses (module-cached single fetch).
assert(/loadAllForms\s*=\s*\(\)\s*=>\s*import\(/.test(formsHub),
  "FormsHub defines a shared loadAllForms loader for lazy + preload");
assert(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,150}loadAllForms\(\)/.test(formsHub),
  "FormsHub eagerly preloads the AllForms chunk on mount");

// The login CTA inside FormsHub's guest mine-tab EmptyState must be
// wired to scroll back to the banner — otherwise a phone user who's
// scrolled past the banner sees only an empty state with no reachable
// affordance to sign in. (Code-review second-pass nit A1.)
assert(/forms-hub-login-banner/.test(formsHub),
  "FormsHub banner has a stable id for the EmptyState CTA to target");
assert(/scrollIntoView/.test(formsHub),
  "FormsHub guest EmptyState CTA scrolls back to the LoginPrompt banner");

// FormList no longer renders the bottom 'צפייה בטפסים של כולם' button
// unconditionally — the tab is now the entry point. Only render when
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
// 7. Predict — guest fork hands off to FormsHub (single banner only)
// ============================================================
console.log("\n--- 7. Predict guest renders FormsHub ---");
const predict = readMigratedSrc("src/pages/Predict.jsx");
assert(/<FormsHub/.test(predict),
  "Predict renders FormsHub when no active form");
assert(/!user[\s\S]{0,400}<FormsHub[\s\S]{0,200}user=\{null\}/.test(predict),
  "Predict guest fork renders FormsHub with user=null");
// Important: post code-review fix, Predict no longer renders its own
// LoginPrompt for the guest path — FormsHub owns the prompt now.
// Stacking two banners on /predict produced duplicate sign-in cards.
assert(!/import\s+LoginPrompt/.test(predict),
  "Predict no longer imports LoginPrompt (FormsHub owns it)");
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

// ============================================================
// 11. Guest auth observer must NOT wipe the public-mode cache
// ============================================================
// Regression for "blog shows 'אין עדיין סיכומים' for logged-out visitors":
// onAuthStateChanged fires every newly-registered observer immediately with
// the current state, so useCurrentUser's null branch runs on EVERY guest
// page mount. An unconditional store.logoutUser() there wiped cache.summaries
// + cache._ready on every guest navigation; the public-mode watchdog then
// flipped readiness over an empty cache and the blog rendered its empty
// state despite published posts. logoutUser must be gated on a genuine
// signed-in → signed-out transition.
console.log("\n--- 11. useCurrentUser guest branch keeps public cache ---");
const useStoreSrc = readMigratedSrc("src/hooks/useStore.js");

assert(/let\s+sawFirebaseUser\s*=\s*false/.test(useStoreSrc),
  "useStore tracks sawFirebaseUser at module level");
assert(/sawFirebaseUser\s*=\s*true/.test(useStoreSrc),
  "Flag is set when a Firebase user appears");
assert(/else\s+if\s*\(sawFirebaseUser\)\s*\{[\s\S]{0,200}store\.logoutUser\(\)/.test(useStoreSrc),
  "Full logoutUser teardown only runs on a real signed-in → signed-out transition");
assert(!/\}\s*else\s*\{\s*store\.logoutUser\(\)/.test(useStoreSrc),
  "No unconditional store.logoutUser() in the null-auth branch");
// The never-signed-in branch must still clear stale identity keys without
// touching the cache (remote revocation between visits). The literal key
// strings were centralised in src/constants/storageKeys.ts, so useStore now
// references the imported CURRENT_USER_KEY / ACTIVE_FORM_KEY constants rather
// than inline literals — assert the cleanup still targets both keys and that
// the constants module remains their single source of truth.
assert(/removeItem\(CURRENT_USER_KEY\)/.test(useStoreSrc) && /removeItem\(ACTIVE_FORM_KEY\)/.test(useStoreSrc),
  "Guest branch clears stale localStorage identity keys (via storageKeys constants)");
const storageKeysSrc = readMigratedSrc("src/constants/storageKeys.js");
assert(/CURRENT_USER_KEY\s*=\s*"wc2026_currentUser"/.test(storageKeysSrc) &&
  /ACTIVE_FORM_KEY\s*=\s*"wc2026_activeForm"/.test(storageKeysSrc),
  "storageKeys.ts is the single source of truth for the identity keys");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
