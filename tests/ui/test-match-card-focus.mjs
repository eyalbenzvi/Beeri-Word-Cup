// Static audit: verifies MatchCard keeps its DOM contract that focusNextInput
// depends on (data-match-card attribute, two number inputs, direct children
// structure for sibling traversal).
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== MATCH CARD FOCUS CONTRACT ===\n");

const src = readMigratedSrc("src/components/MatchCard.jsx", "utf8");

// --- Required DOM attribute for focusNextInput sibling traversal ---
assert(/data-match-card/.test(src), "MatchCard renders data-match-card attribute");

// --- Two number inputs exist (home/away) ---
const numberInputs = (src.match(/type="number"/g) || []).length;
assert(numberInputs >= 2, `MatchCard has at least 2 number inputs (got ${numberInputs})`);

// --- Refs for focus management (homeInputRef, awayInputRef) ---
assert(/homeInputRef/.test(src), "MatchCard has homeInputRef for focus");
assert(/awayInputRef/.test(src), "MatchCard has awayInputRef for focus");

// --- focusNextInput helper still present and uses DOM sibling traversal ---
assert(/focusNextInput/.test(src), "focusNextInput helper exists");
assert(/nextElementSibling/.test(src), "uses nextElementSibling traversal (grid-safe)");

// --- auto-advance from home to away on single digit ---
assert(/awayInputRef\.current\?\.focus/.test(src), "home input auto-advances to away ref");

// --- Usage sites (Predict.jsx, Leaderboard.jsx) still pass MatchCard through ---
const predictSrc = readMigratedSrc("src/pages/Predict.jsx", "utf8");
assert(/MatchCard/.test(predictSrc), "Predict.jsx still imports MatchCard");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
