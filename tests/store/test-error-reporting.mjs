// Regression guard: catch blocks on non-fatal async paths must REPORT
// (captureClientError) rather than swallow silently, so recurring failures
// (bad deploy / CDN chunk fetch / WebOTP breakage) surface in Sentry.
//
// Static source assertions — plain node, no loader.

import { readFileSync } from "node:fs";

let passed = 0,
  failed = 0;
const failures = [];
function assert(condition, msg) {
  if (condition) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

function read(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

console.log("=== ERROR REPORTING (no silent catches) TESTS ===\n");

// ---------- FormsHub: AllForms preload ----------
{
  const src = read("../../src/components/FormsHub.tsx");
  assert(
    /import\s*\{\s*captureClientError\s*\}\s*from\s*"\.\.\/sentry"/.test(src),
    "FormsHub imports captureClientError",
  );
  // The exact `.catch(() => {})` swallow must be gone.
  assert(
    !/loadAllForms\(\)\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(src),
    "FormsHub no longer swallows the preload error with an empty catch",
  );
  assert(
    /loadAllForms\(\)\.catch\(\([\s\S]*?captureClientError\(/.test(src),
    "FormsHub preload catch reports via captureClientError",
  );
}

// ---------- PhoneSignIn: WebOTP ----------
{
  const src = read("../../src/components/PhoneSignIn.tsx");
  assert(
    /import\s*\{\s*captureClientError\s*\}\s*from\s*"\.\.\/sentry"/.test(src),
    "PhoneSignIn imports captureClientError",
  );
  // The fully-silent WebOTP catch comment must be gone.
  assert(
    !/User dismissed the prompt or no SMS arrived — silent\./.test(src),
    "PhoneSignIn WebOTP catch is no longer fully silent",
  );
  assert(
    /PhoneSignIn\.webOtp/.test(src),
    "PhoneSignIn WebOTP catch reports with source tag PhoneSignIn.webOtp",
  );
  // Benign cases stay silent — must still skip AbortError + NotAllowedError.
  assert(
    /AbortError/.test(src) && /NotAllowedError/.test(src),
    "PhoneSignIn still ignores benign AbortError / NotAllowedError",
  );
}

// ---------- Summary ----------
console.log("\n=== SUMMARY ===");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
