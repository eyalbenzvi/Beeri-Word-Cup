// Verifies lock-state messages are centralised in constants/messages.js
// and consumed by Home, FormList, and AllForms (avoids drift between pages).
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== LOCK MESSAGES TESTS ===\n");

const messages = fs.readFileSync("src/constants/messages.js", "utf8");
const home = fs.readFileSync("src/pages/Home.jsx", "utf8");
const formList = fs.readFileSync("src/components/FormList.jsx", "utf8");
const allForms = fs.readFileSync("src/pages/AllForms.jsx", "utf8");

// --- Constants file defines all three keys ---
assert(/LOCK_MESSAGES/.test(messages), "messages.js exports LOCK_MESSAGES");
assert(
  /tournamentStarted:\s*"המשחקים התחילו — ההגשה נסגרה"/.test(messages),
  "LOCK_MESSAGES.tournamentStarted matches canonical lock copy",
);
assert(
  /formsUnavailable:\s*"לא ניתן ליצור טפסים חדשים לאחר תחילת המשחקים"/.test(messages),
  "LOCK_MESSAGES.formsUnavailable matches canonical copy",
);
assert(
  /predictionsHiddenBeforeLock:/.test(messages),
  "LOCK_MESSAGES.predictionsHiddenBeforeLock exists",
);

// --- Consumers reference the constant by name (not a duplicated string) ---
assert(/LOCK_MESSAGES/.test(home), "Home.jsx references LOCK_MESSAGES");
assert(/LOCK_MESSAGES/.test(formList), "FormList.jsx references LOCK_MESSAGES");
assert(/LOCK_MESSAGES/.test(allForms), "AllForms.jsx references LOCK_MESSAGES");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
