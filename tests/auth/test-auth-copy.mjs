// Ensures the unauthenticated CTA uses consistent wording ("התחבר" only).
// The older copy "הצטרף למשחק קודם" is the user-facing "title" — it
// contradicted the CTA "התחבר למשחק". Consolidated in constants/messages.js.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== AUTH COPY TESTS ===\n");

const messages = readMigratedSrc("src/constants/messages.js", "utf8");
const predict = readMigratedSrc("src/pages/Predict.jsx", "utf8");
// FormsHub now owns the guest banner that previously lived inside
// Predict.jsx (offline-mode rollout — single-banner contract).
const formsHub = readMigratedSrc("src/components/FormsHub.jsx", "utf8");

// --- Constants file exports AUTH_COPY with the consolidated title ---
assert(/AUTH_COPY/.test(messages), "messages.js exports AUTH_COPY");
assert(
  /loginRequiredTitle:\s*"התחבר למשחק קודם"/.test(messages),
  "AUTH_COPY.loginRequiredTitle uses 'התחבר' wording (not 'הצטרף')",
);

// --- The guest banner uses the constant. Live in FormsHub now; we
// also check Predict to lock in that the constant isn't reintroduced
// hardcoded there.
assert(
  /AUTH_COPY\.loginRequiredTitle/.test(formsHub),
  "FormsHub.jsx uses AUTH_COPY.loginRequiredTitle (Predict guest banner moved here)",
);
assert(
  !/"הצטרף למשחק קודם"/.test(predict) && !/"הצטרף למשחק קודם"/.test(formsHub),
  "No file contains hardcoded 'הצטרף למשחק קודם'",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
