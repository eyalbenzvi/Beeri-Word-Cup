// Validates that Leaderboard's embedded mode stays clean (no rail, no rank delta).
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LEADERBOARD EMBEDDED MODE TESTS ===\n");

const src = readMigratedSrc("src/pages/Leaderboard.jsx", "utf8");

// --- embedded prop exists and is respected ---
assert(/embedded\s*=\s*false/.test(src), "Leaderboard accepts embedded prop with default=false");

// --- If rank delta is added, it must be gated behind !embedded ---
// (This test runs only once rank-delta widget is added. It's a regression lock.)
if (/TrendingUp|TrendingDown|rankDelta|previousRank/.test(src)) {
  // Rank delta exists — must be gated
  assert(/!embedded/.test(src) || /embedded\s*\?\s*null/.test(src),
    "when rank delta exists, it is gated by !embedded");
}

// --- Selecting a form must reset scroll to top (regression lock) ---
// Without this, opening a form deep in the leaderboard leaves the user
// scrolled past the form header. Scroll is routed through the #app-scroll
// container via scrollAppToTop (the document/body no longer scrolls).
assert(
  /selectedForm[\s\S]*scrollAppToTop|scrollAppToTop\(/.test(src),
  "selecting a form scrolls the app container to top (scrollAppToTop)",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
