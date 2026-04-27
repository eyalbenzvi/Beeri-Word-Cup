// Validates WCAG 2.2 AA tap-target sizing (min 44×44 on pointer:coarse)
// for MatchCard +/− buttons. (The Leaderboard top-3 podium block was
// removed by user request — see PR fix-scores-mobile-layout.)
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== TAP TARGETS TESTS ===\n");

const css = fs.readFileSync("src/index.css", "utf8");
const matchCard = fs.readFileSync("src/components/MatchCard.jsx", "utf8");

// --- CSS utility exists and is gated on pointer:coarse ---
assert(
  /@media\s*\(\s*pointer:\s*coarse\s*\)\s*\{[^}]*\.tap-44\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s.test(css),
  "index.css defines .tap-44 inside @media (pointer: coarse) with min 44px",
);

// --- MatchCard uses tap-44 on all 4 +/− buttons (2 home, 2 away) ---
const tapCount = (matchCard.match(/tap-44/g) || []).length;
assert(tapCount >= 4, `MatchCard applies tap-44 to at least 4 +/− buttons (found ${tapCount})`);

// --- MatchCard +/− buttons have aria-label ---
assert(
  /aria-label=\{`הוסף גול ל/.test(matchCard),
  "MatchCard + button has aria-label (הוסף גול)",
);
assert(
  /aria-label=\{`הורד גול מ/.test(matchCard),
  "MatchCard − button has aria-label (הורד גול)",
);

// --- Leaderboard top-3 podium was removed by user request; assert it stays
//     gone so a future re-add doesn't slip in without a tap-target review.
const leaderboard = fs.readFileSync("src/pages/Leaderboard.jsx", "utf8");
assert(
  !/grid-cols-3[\s\S]{0,200}podium-gold[\s\S]{0,500}podium-silver[\s\S]{0,500}podium-bronze/.test(leaderboard),
  "Leaderboard top-3 podium block stays removed",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
