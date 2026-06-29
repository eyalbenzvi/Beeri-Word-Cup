// Regression test: the returning-visitor "new results" digest (#1) has been
// REMOVED from the home page (per the UI cleanup request). The home page must
// not import or render WelcomeBackDigest — the "תוצאות חדשות" box is gone.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== WELCOME-BACK DIGEST REMOVAL REGRESSION TESTS ===\n");

// The "new results" box must no longer appear on the home page.
const home = readMigratedSrc("src/pages/Home.jsx");
assert(!/WelcomeBackDigest/.test(home), "home page no longer references WelcomeBackDigest");
assert(!/תוצאות חדשות/.test(home), "home page no longer renders a 'new results' box");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
