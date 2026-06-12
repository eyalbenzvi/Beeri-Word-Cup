// Verifies lock-state messages are centralised in constants/messages.js
// and consumed by FormList and AllForms (avoids drift between pages).
// Home no longer shows a lock banner — removed by request: once locked,
// the home page shows live/upcoming matches without a "submission closed"
// message at the bottom.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== LOCK MESSAGES TESTS ===\n");

const messages = readMigratedSrc("src/constants/messages.js", "utf8");
const home = readMigratedSrc("src/pages/Home.jsx", "utf8");
const formList = readMigratedSrc("src/components/FormList.jsx", "utf8");
const allForms = readMigratedSrc("src/pages/AllForms.jsx", "utf8");

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
assert(/LOCK_MESSAGES/.test(formList), "FormList.jsx references LOCK_MESSAGES");
assert(/LOCK_MESSAGES/.test(allForms), "AllForms.jsx references LOCK_MESSAGES");

// --- Home dropped its lock banner (intentional) ---
assert(!/LOCK_MESSAGES/.test(home), "Home.jsx no longer renders a lock banner");
assert(!/ההגשה נסגרה/.test(home), "Home.jsx does not duplicate the lock string");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
