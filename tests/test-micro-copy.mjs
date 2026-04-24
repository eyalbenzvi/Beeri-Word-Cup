// Regression lock: critical UI strings that MUST NOT change (contract with users
// or with other tests), and assertions that new copy is in place.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== MICRO-COPY CONTRACT TESTS ===\n");

const homeSrc = fs.readFileSync("src/pages/Home.jsx", "utf8");
const lockMessagesSrc = fs.readFileSync("src/constants/messages.js", "utf8");

// --- LOCKED STRINGS (per CLAUDE.md) ---
// The canonical copy now lives in constants/messages.js; Home consumes it via
// LOCK_MESSAGES.tournamentStarted. Both conditions must hold.
assert(
  lockMessagesSrc.includes("המשחקים התחילו — ההגשה נסגרה"),
  "LOCK_MESSAGES.tournamentStarted contains the canonical lock-state string"
);
assert(
  homeSrc.includes("LOCK_MESSAGES.tournamentStarted"),
  "Home references LOCK_MESSAGES.tournamentStarted"
);

// --- NEW COPY in place ---
// Home CTA
assert(
  homeSrc.includes("קדימה, מלאו טופס") || homeSrc.includes("קדימה, מלאו"),
  "Home CTA uses casual Hebrew 'קדימה, מלאו טופס'"
);
assert(
  !homeSrc.includes("צור את הטופס המנצח שלך"),
  "Home no longer uses AI-translated 'צור את הטופס המנצח שלך'"
);

// Home countdown
assert(
  homeSrc.includes("עוד עד שריקת הפתיחה") || homeSrc.includes("עד שריקת הפתיחה"),
  "Home countdown copy updated"
);

// Predict submit toast
const predictSrc = fs.readFileSync("src/pages/Predict.jsx", "utf8");
assert(
  predictSrc.includes("נקלט") || predictSrc.includes("בהצלחה"),
  "Predict submit toast has short Hebrew copy"
);
assert(
  !/הטופס הוגש בהצלחה!\s*🎉/.test(predictSrc),
  "Predict no longer uses template 'הטופס הוגש בהצלחה! 🎉'"
);

// Profile save toast
const profileSrc = fs.readFileSync("src/pages/Profile.jsx", "utf8");
assert(
  profileSrc.includes("עדכנתי") || profileSrc.includes("הפרופיל נשמר"),
  "Profile save toast present (either new or old acceptable)"
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
