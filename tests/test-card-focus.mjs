// Regression tests for the card focus/hover contract.
// Issue: cards using .card-duo-hover while also containing internal buttons
// produce a "broken border" artifact when the first internal button receives
// focus — the card lift competes with the button outline.
// Fix: cards with internal buttons use focus-within ring on the wrapper and
// suppress per-button outlines inside; cards that are themselves the click
// target keep .card-duo-hover.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== CARD FOCUS / HOVER CONTRACT TESTS ===\n");

const css = fs.readFileSync("src/index.css", "utf8");
const formList = fs.readFileSync("src/components/FormList.jsx", "utf8");
const results = fs.readFileSync("src/pages/Results.jsx", "utf8");
const matchCard = fs.readFileSync("src/components/MatchCard.jsx", "utf8");
const leaderboard = fs.readFileSync("src/pages/Leaderboard.jsx", "utf8");

// --- FormList: card-duo-hover replaced with focus-within ring ---
assert(
  !/card-duo-hover/.test(formList),
  "FormList no longer uses card-duo-hover (compets with button focus)",
);
assert(
  /focus-within:ring-2/.test(formList) && /focus-within:ring-secondary/.test(formList),
  "FormList card uses focus-within ring (wrapper-level focus indicator)",
);
assert(
  /focus-within:ring-offset-2/.test(formList),
  "FormList card applies ring offset for legibility",
);

// --- Results: card is not clickable, so no hover lift ---
assert(
  !/card-duo-hover/.test(results),
  "Results match card no longer uses card-duo-hover (non-interactive card)",
);

// --- MatchCard: still uses card-duo-hover (the whole card IS the interaction) ---
assert(
  /card-duo-hover/.test(matchCard),
  "MatchCard keeps card-duo-hover (card IS the interactive target)",
);

// --- Leaderboard: entry is a <button>, keeps card-duo-hover ---
assert(
  /card-duo-hover/.test(leaderboard),
  "Leaderboard entries keep card-duo-hover (button cards)",
);

// --- index.css: documents the pattern and suppresses inner button outlines ---
assert(
  /focus-within:ring.*focus-within button:focus-visible/s.test(css) ||
    /focus-within\\:ring-2:focus-within button:focus-visible/.test(css),
  "index.css suppresses button outlines inside focus-within cards",
);
assert(
  /Do NOT use on a[\s\S]*?card that contains internal buttons/.test(css),
  "index.css documents card-duo-hover usage constraint",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
