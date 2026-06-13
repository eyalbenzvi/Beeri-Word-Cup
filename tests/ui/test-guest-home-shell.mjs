// Regression tests for the guest-nav-on-home rollout.
//
// Goal: a logged-out visitor sees the same tab navigation on the welcome
// screen that they see on every other guest tab. Previously the welcome
// screen was a stand-alone full-page replacement with its own header and
// no nav — guests landing on /home had no way to discover the rest of
// the site (predict / leaderboard / results / stats / blog) without
// signing in first.
//
// Static-grep audits only — these lock the wiring in place so a future
// refactor can't silently regress.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== GUEST HOME SHELL REGRESSION ===\n");

const app = readMigratedSrc("src/App.jsx");
const welcome = readMigratedSrc("src/pages/WelcomeScreen.jsx");
const layout = readMigratedSrc("src/components/Layout.jsx");
const loginPrompt = readMigratedSrc("src/components/LoginPrompt.jsx");
const formsHub = readMigratedSrc("src/components/FormsHub.jsx");

// ============================================================
// 1. WelcomeScreen is now a body-only page (no chrome)
// ============================================================
console.log("--- 1. WelcomeScreen is body-only ---");

// No <header> tag — Layout owns the header now.
assert(!/<header/.test(welcome),
  "WelcomeScreen no longer renders its own <header>");
// No MenuOverlay import / state — Layout owns the menu.
assert(!/MenuOverlay/.test(welcome),
  "WelcomeScreen no longer imports MenuOverlay");
assert(!/menuOpen/.test(welcome),
  "WelcomeScreen no longer manages a menuOpen state");
// No outer min-h-dvh / bg-bg wrapper — AppShell handles viewport sizing.
assert(!/min-h-dvh/.test(welcome),
  "WelcomeScreen no longer reserves min-h-dvh on the outer wrapper");
assert(!/<div\s+className="min-h-dvh\s+bg-bg/.test(welcome),
  "WelcomeScreen drops the standalone bg-bg outer wrapper");
// No Menu icon import — that was for its own hamburger button.
assert(!/import\s*\{[^}]*\bMenu\b[^}]*\}\s+from\s+["']lucide-react["']/.test(welcome),
  "WelcomeScreen no longer imports the Menu icon");
// No Info icon either — that was for its own desktop info button.
assert(!/import\s*\{[^}]*\bInfo\b[^}]*\}\s+from\s+["']lucide-react["']/.test(welcome),
  "WelcomeScreen no longer imports the Info icon");

// Body content is still there — auth panel + countdown.
assert(/GoogleSignInButton/.test(welcome),
  "WelcomeScreen still imports GoogleSignInButton (auth panel preserved)");
assert(/PhoneSignIn/.test(welcome),
  "WelcomeScreen still imports PhoneSignIn (auth panel preserved)");
assert(/TournamentCountdown/.test(welcome),
  "WelcomeScreen still imports TournamentCountdown (panel preserved)");
assert(/UpcomingMatches/.test(welcome),
  "WelcomeScreen still imports UpcomingMatches (post-kickoff panel)");
assert(/LiveNowCard/.test(welcome),
  "WelcomeScreen still imports LiveNowCard (post-kickoff panel)");

// ============================================================
// 2. App.tsx routes guest home through AppShell
// ============================================================
console.log("\n--- 2. App routes guest home through AppShell ---");

// The old branch returned <WelcomeScreen /> directly for guest+home.
// We must NOT have a path that returns <WelcomeScreen/> outside an
// AppShell — that would re-introduce the no-tab-nav state.
assert(!/return\s*<WelcomeScreen\s*\/>/.test(app),
  "App.tsx no longer returns a bare <WelcomeScreen /> (every render goes through AppShell)");

// The guest fork sets a fallback Page = WelcomeScreen via the PAGES
// lookup pattern. Both the home and the unknown-page fallback collapse
// to WelcomeScreen but inside AppShell.
assert(/isGuestHome\s*=\s*page\s*===\s*"home"\s*\|\|\s*!GUEST_PAGES\.has\(page\)/.test(app),
  "App.tsx derives isGuestHome from the page id + GUEST_PAGES allow-list");
assert(/isGuestHome\s*\?\s*WelcomeScreen/.test(app),
  "App.tsx routes the guest home/unknown page to WelcomeScreen");
assert(/<AppShell\s+page=\{isGuestHome\s*\?\s*"home"\s*:\s*page\}/.test(app),
  "App.tsx forces the AppShell page-id back to 'home' when falling back");

// ============================================================
// 3. Layout exposes tab navigation to guests on every page
// ============================================================
console.log("\n--- 3. Layout shows nav tabs to guests (already locked) ---");

// (These overlap with test-offline-tabs.mjs — kept here so the guest-
// home rollout's regression suite is self-contained.)
for (const id of ["home", "predict", "leaderboard", "results", "stats"]) {
  assert(new RegExp(`id:\\s*"${id}"`).test(layout),
    `Layout nav lists "${id}" tab`);
}

// Bottom-nav (mobile/tablet) and DesktopSideNav coexist.
assert(/<nav\s+className="fixed\s+bottom-0[^"]*xl:hidden/.test(layout),
  "Layout has bottom-nav scoped to xl:hidden (mobile/tablet)");
assert(/<DesktopSideNav\b/.test(layout),
  "Layout renders DesktopSideNav (xl+)");

// Header "התחבר" CTA is hidden on the home tab for guests — the
// welcome page renders its own auth card right below, and a duplicate
// primary button right above creates two competing CTAs.
assert(/page\s*!==\s*"home"\s*&&\s*\(/.test(layout),
  "Layout header hides the guest 'התחבר' CTA on the home tab");

// ============================================================
// 4. Guest URL normalisation — collapse unknown pages to home
// ============================================================
console.log("\n--- 4. Guest URL normalisation ---");

// Without this, a logged-out visitor on ?page=admin sees the welcome
// screen but the URL stays admin. Signing in via the auth panel would
// then route them straight into the Admin permission gate (a non-admin
// gets a "נדרשת גישת מנהל" lockout immediately after login). The effect
// rewrites the URL to home (replace, not push) so the address bar and
// the rendered view stay in sync.
assert(/page\s*!==\s*"home"\s*&&\s*!GUEST_PAGES\.has\(page\)/.test(app),
  "App.tsx detects a non-home, non-guest page id for the URL fix-up");
assert(/navigate\(\s*"home"\s*,\s*\{\s*\}\s*,\s*\{\s*replace:\s*true\s*\}\s*\)/.test(app),
  "App.tsx normalises the URL to home via replace-navigate (no Back trap)");

// Guard the unconditional public-mode init: the effect must NOT add a
// per-page guard (e.g. `&& page === "blog"`) — every guest tab needs
// the public listeners.
assert(/if\s*\(\s*authReady\s*&&\s*!isLoggedIn\s*\)\s*\{[\s\S]{0,80}initPublicReadonlyMode\(\)/.test(app),
  "initPublicReadonlyMode runs unconditionally on authReady && !isLoggedIn");
assert(!/authReady\s*&&\s*!isLoggedIn\s*&&\s*page\s*===\s*"[a-z]+"\s*\)\s*\{[\s\S]{0,80}initPublicReadonlyMode/.test(app),
  "initPublicReadonlyMode is NOT gated on a specific page id");

// ============================================================
// 5. Mobile/desktop responsiveness audit on the offline-mode rollout
// ============================================================
console.log("\n--- 5. Responsiveness of LoginPrompt + FormsHub ---");

// FormsHub tab buttons must hit the 44×44 minimum tap target on coarse
// pointers per the brand book. The `tap-44` utility class enforces it
// inside @media (pointer: coarse) {}; py-2.5 keeps the desktop pill
// visually tight. (Code-review nit on the second pass.)
const formsHubTapCount = (formsHub.match(/tap-44/g) || []).length;
assert(formsHubTapCount >= 2,
  `FormsHub tab buttons use tap-44 (at least 2 occurrences; found ${formsHubTapCount})`);
assert(/py-2\.5\s+text-sm/.test(formsHub),
  "FormsHub tab buttons use py-2.5 (≥36px desktop, ≥44px coarse via tap-44)");

// LoginPrompt card variant: capped to max-w-md, centered. Banner
// variant: scales padding p-3 → md:p-4. Inner buttons widen with
// max-w-sm so they don't stretch unreadably on a desktop banner.
assert(/max-w-md\s+mx-auto/.test(loginPrompt),
  "LoginPrompt card variant caps width at max-w-md and centers");
assert(/p-3\s+md:p-4/.test(loginPrompt),
  "LoginPrompt banner scales padding from mobile to desktop (p-3 md:p-4)");
assert(/max-w-sm\s+mx-auto/.test(loginPrompt),
  "LoginPrompt inner button column caps at max-w-sm (readable on wide screens)");
assert(/text-base\s+md:text-lg/.test(loginPrompt),
  "LoginPrompt title scales text-base → md:text-lg");

// FormsHub tabs are flex-1 (stretch to fill the row on every width).
assert(/flex-1\s+py-2\.5\s+text-sm/.test(formsHub),
  "FormsHub tab buttons stretch with flex-1 (mobile + desktop friendly)");
// The hub's content is wrapped in a regular <div> with no width cap,
// inheriting AppShell's main-column width — so it works in both the
// narrow mobile column and the desktop 1fr center column.
assert(!/max-w-/.test(formsHub.match(/return\s*\(\s*<div>[\s\S]*?<\/div>\s*\);/)?.[0] || ""),
  "FormsHub does not impose its own width cap (defers to AppShell)");

// WelcomeScreen body uses max-w-md on mobile / xl:max-w-xl on the
// countdown panel — ensures the auth card stays readable on wide
// desktop layouts while letting the countdown timer breathe.
assert(/max-w-md/.test(welcome),
  "WelcomeScreen caps the auth card column at max-w-md");
assert(/xl:max-w-xl/.test(welcome),
  "WelcomeScreen widens the countdown column to max-w-xl on xl+");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
