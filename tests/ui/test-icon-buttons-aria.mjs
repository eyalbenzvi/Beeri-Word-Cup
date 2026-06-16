// Scans icon-only / symbol buttons across key components and ensures they
// have aria-label for screen-reader users.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== ICON BUTTONS ARIA TESTS ===\n");

const files = [
  "src/components/Layout.jsx",
  "src/components/MatchCard.jsx",
  "src/components/MenuOverlay.jsx",
  "src/pages/WelcomeScreen.jsx",
];

for (const f of files) {
  const src = readMigratedSrc(f, "utf8");

  // Count <button> tags that contain only an icon (Menu, Info, X, lucide
  // imports, or a standalone +/− char). Each should either have aria-label
  // or be wrapped by a visible text sibling — the static check below just
  // looks for a correspondence between icon-only buttons and aria-label.
  const buttonMatches = src.match(/<button[^>]*>[^<]*<[A-Z]\w+\s[^>]*(size=|aria-hidden)[^>]*\/>\s*<\/button>/g) || [];

  for (const btn of buttonMatches) {
    const hasAria = /aria-label=/.test(btn);
    assert(hasAria, `${f}: icon-only button has aria-label — snippet: ${btn.slice(0, 80)}…`);
  }
}

// --- MatchCard +/− buttons are specifically checked ---
const matchCard = readMigratedSrc("src/components/MatchCard.jsx", "utf8");
const plusBtnCount = (matchCard.match(/aria-label=\{`הוסף גול ל/g) || []).length;
const minusBtnCount = (matchCard.match(/aria-label=\{`הורד גול מ/g) || []).length;
assert(plusBtnCount === 2, `MatchCard has 2 aria-labeled + buttons (found ${plusBtnCount})`);
assert(minusBtnCount === 2, `MatchCard has 2 aria-labeled − buttons (found ${minusBtnCount})`);

// --- SaveIndicator announces save state to screen readers ---
// The save/saved/error pill is a live region: an error must be assertive
// (interrupts), the saving/saved status polite. Without these, a blind user
// gets no feedback that their prediction was saved or failed.
const saveIndicator = readMigratedSrc("src/components/SaveIndicator.jsx", "utf8");
assert(
  /role="alert"[\s\S]{0,40}aria-live="assertive"/.test(saveIndicator),
  "SaveIndicator error state is an assertive live region (role=alert)",
);
assert(
  /role="status"[\s\S]{0,40}aria-live="polite"/.test(saveIndicator),
  "SaveIndicator saving/saved state is a polite live region (role=status)",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
