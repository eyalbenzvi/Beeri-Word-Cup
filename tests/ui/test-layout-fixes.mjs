// Regression tests for the 4 layout issues fixed on claude/fix-layout-issues-ashQr:
//
// 1. Logged-out Welcome screen should fit in the viewport (no unnecessary
//    vertical scroll). We guard against re-introducing the taller padding/
//    emoji/card sizes that overflowed on 1366x768 laptops.
// 2. Home (desktop, logged-in, locked) should render UpcomingMatches in the
//    main content column — not injected into the right-rail via
//    useRightRail. Keeps hero and upcoming-matches list visually connected.
// 3. Desktop logged-out UpcomingMatches: MatchRow is centered/stacked rather
//    than split with flex justify-between (which pushed stage + meta apart
//    and broke centering in narrow cards).
// 4. Logged-out Welcome screen must render MatchdayHero when the tournament
//    is running, matching Home — so both user states see the same featured
//    match.

import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== LAYOUT FIXES REGRESSION TESTS ===\n");

const home = readMigratedSrc("src/pages/Home.jsx", "utf8");
const welcome = readMigratedSrc("src/pages/WelcomeScreen.jsx", "utf8");
const upcoming = readMigratedSrc("src/components/UpcomingMatches.jsx", "utf8");
const matchdayHero = readMigratedSrc("src/components/MatchdayHero.jsx", "utf8");

// ============================================================
// ISSUE #2: UpcomingMatches lives in the main column on Home,
// NOT in the right rail. `useRightRail` is no longer invoked
// and the `xl:hidden` dual-render is gone.
// ============================================================
console.log("--- Issue #2: UpcomingMatches in main column on Home ---");

assert(
  !/useRightRail/.test(home),
  "Home no longer calls useRightRail (UpcomingMatches renders inline)",
);
assert(
  !/from\s+["']\.\.\/hooks\/useRail["']/.test(home),
  "Home no longer imports from useRail",
);
assert(
  /<UpcomingMatches\s*\/>/.test(home),
  "Home renders UpcomingMatches inline (no dense/prop needed)",
);
assert(
  !/xl:hidden[^"'`]*>\s*<UpcomingMatches/.test(home),
  "Home does not hide UpcomingMatches on xl: anymore",
);
// And the `dense` variant is retired from UpcomingMatches itself.
assert(
  !/\bdense\b/.test(upcoming),
  "UpcomingMatches no longer takes/uses a `dense` prop",
);

// ============================================================
// ISSUE #4: WelcomeScreen renders MatchdayHero when the
// tournament is running (parity with Home).
// ============================================================
console.log("--- Issue #4: MatchdayHero on WelcomeScreen ---");

assert(
  /import\s+MatchdayHero/.test(welcome),
  "WelcomeScreen imports MatchdayHero",
);
assert(
  /<MatchdayHero\s+results=\{results\}\s*\/>/.test(welcome),
  "WelcomeScreen renders MatchdayHero (with results) when tournamentStarted",
);
// Logged-out visitors have no Firestore listeners, so the store's
// useMatchResults would be empty. WelcomeScreen must source match results
// from the public endpoint via usePublicSettings instead.
assert(
  /usePublicSettings/.test(welcome),
  "WelcomeScreen uses usePublicSettings (also carries matchResults) for MatchdayHero",
);
assert(
  !/from\s+["']\.\.\/hooks\/useStore["'][^;]*useMatchResults/.test(welcome),
  "WelcomeScreen does not import useMatchResults from the store (empty for logged-out users)",
);
// The hero must be conditionally rendered inside the tournamentStarted branch
// (so logged-out users before kickoff still see the countdown card).
{
  const heroMatch = welcome.match(/tournamentStarted\s*\?\s*\(([\s\S]*?)\)\s*:/);
  assert(
    heroMatch && /<MatchdayHero/.test(heroMatch[1]),
    "MatchdayHero is inside the tournamentStarted branch (not always rendered)",
  );
  assert(
    heroMatch && /<UpcomingMatches/.test(heroMatch[1]),
    "UpcomingMatches is inside the tournamentStarted branch (still shown when running)",
  );
}

// ============================================================
// ISSUE #3: MatchRow uses centered/stacked layout so narrow
// cards (two-col grid at ~240px wide) don't push stage +
// meta apart with justify-between.
// ============================================================
console.log("--- Issue #3: MatchRow centered/stacked layout ---");

// No `flex items-center justify-between mb-1.5` header row anymore.
assert(
  !/flex\s+items-center\s+justify-between\s+mb-1\.5/.test(upcoming),
  "MatchRow no longer splits header row with justify-between",
);
// Stage label row is explicitly centered.
assert(
  /text-secondary\/90\s+text-center/.test(upcoming),
  "Stage label row is text-center (centered layout)",
);
// Teams row uses justify-center (teams centered with dash between).
assert(
  /flex\s+items-center\s+justify-center\s+gap-2/.test(upcoming),
  "Teams row uses flex items-center justify-center",
);
// Meta is its own centered line below the teams.
assert(
  /text-ink-muted\s+text-center\s+mt-1/.test(upcoming),
  "Meta (date · time · venue) renders on its own centered line",
);
// Team name columns get min-w-0 so long names truncate rather than pushing
// the layout sideways.
assert(
  /flex-1\s+min-w-0\s+text-center/.test(upcoming),
  "Team columns use flex-1 min-w-0 text-center (truncation friendly)",
);

// ============================================================
// ISSUE #1: WelcomeScreen vertical spacing is tight enough to
// fit in a 1366x768 (768px) viewport without scrolling.
// We guard against the previous too-tall values.
// ============================================================
console.log("--- Issue #1: WelcomeScreen vertical spacing tightened ---");

// As of the offline-mode rollout WelcomeScreen no longer owns its own
// header / outer min-h-dvh wrapper — the page is rendered inside
// AppShell so Layout supplies the surrounding padding (pt-3 md:pt-6).
// What's left to pin here is the WelcomeScreen body's own outer flex
// and inner gap so the previously-tight 1366x768 viewport fit doesn't
// regress as the component is moved.
assert(
  /flex\s+flex-col\s+items-center\s+gap-3/.test(welcome),
  "Body wrapper uses flex flex-col items-center gap-3 (tight inner gap)",
);
assert(
  !/min-h-dvh/.test(welcome),
  "Body no longer reserves min-h-dvh (delegated to AppShell)",
);
assert(
  !/<header/.test(welcome),
  "WelcomeScreen no longer renders its own <header> (Layout owns chrome)",
);
// Auth card padding: p-4 md:p-5 (not p-5 md:p-6)
assert(
  /rounded-3xl\s+p-4\s+md:p-5/.test(welcome),
  "Auth card uses p-4 md:p-5 (tighter than prior p-5 md:p-6)",
);
// Branding emoji shrunk: text-4xl md:text-5xl (not text-5xl md:text-6xl)
assert(
  /text-4xl\s+md:text-5xl\s+mb-1[^"`]*animate-pop-in/.test(welcome),
  "Emoji downsized to text-4xl md:text-5xl mb-1",
);
// Pre-tournament countdown uses .card-duo (not .card-duo-lg) to save 16px.
{
  const preTournamentMatch = welcome.match(/\)\s*:\s*\(\s*<div\s+className="card-duo[^"]*"/);
  assert(
    preTournamentMatch && !/card-duo-lg/.test(preTournamentMatch[0]),
    "Pre-tournament countdown uses card-duo (not card-duo-lg)",
  );
}

// ============================================================
// Sanity: MatchdayHero contract unchanged — still needs
// `results` prop, still filters by today's Israel-date key.
// ============================================================
console.log("--- Sanity: MatchdayHero contract ---");

assert(
  /function\s+MatchdayHero\s*\(\s*\{\s*results\s*\}\s*\)/.test(matchdayHero),
  "MatchdayHero still accepts { results } prop",
);
assert(
  /getMatchIsraelDateKey/.test(matchdayHero),
  "MatchdayHero still filters by Israel-date key",
);

// ============================================================
// Sanity: Home + WelcomeScreen both import UpcomingMatches and
// MatchdayHero from the same component modules (single source).
// ============================================================
console.log("--- Sanity: Shared component imports ---");

assert(
  /import\s+UpcomingMatches\s+from\s+["']\.\.\/components\/UpcomingMatches["']/.test(home),
  "Home imports UpcomingMatches",
);
assert(
  /import\s+UpcomingMatches\s+from\s+["']\.\.\/components\/UpcomingMatches["']/.test(welcome),
  "WelcomeScreen imports UpcomingMatches",
);
assert(
  /import\s+MatchdayHero\s+from\s+["']\.\.\/components\/MatchdayHero["']/.test(home),
  "Home imports MatchdayHero",
);
assert(
  /import\s+MatchdayHero\s+from\s+["']\.\.\/components\/MatchdayHero["']/.test(welcome),
  "WelcomeScreen imports MatchdayHero",
);

// ============================================================
console.log(`\n=== LAYOUT FIXES RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(failed > 0 ? 1 : 0);
