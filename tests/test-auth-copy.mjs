// Ensures the unauthenticated CTA uses consistent wording ("התחבר" only).
// The older copy "הצטרף למשחק קודם" is the user-facing "title" — it
// contradicted the CTA "התחבר למשחק". Consolidated in constants/messages.js.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== AUTH COPY TESTS ===\n");

const messages = fs.readFileSync("src/constants/messages.js", "utf8");
const predict = fs.readFileSync("src/pages/Predict.jsx", "utf8");

// --- Constants file exports AUTH_COPY with the consolidated title ---
assert(/AUTH_COPY/.test(messages), "messages.js exports AUTH_COPY");
assert(
  /loginRequiredTitle:\s*"התחבר למשחק קודם"/.test(messages),
  "AUTH_COPY.loginRequiredTitle uses 'התחבר' wording (not 'הצטרף')",
);

// --- Predict page uses the constant, not hardcoded strings ---
assert(
  /AUTH_COPY\.loginRequiredTitle/.test(predict),
  "Predict.jsx uses AUTH_COPY.loginRequiredTitle",
);
assert(
  !/"הצטרף למשחק קודם"/.test(predict),
  "Predict.jsx no longer contains hardcoded 'הצטרף למשחק קודם'",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
