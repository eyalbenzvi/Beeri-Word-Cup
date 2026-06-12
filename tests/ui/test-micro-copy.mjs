// Regression lock: critical UI strings that MUST NOT change (contract with users
// or with other tests), and assertions that new copy is in place.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== MICRO-COPY CONTRACT TESTS ===\n");

const homeSrc = readMigratedSrc("src/pages/Home.jsx", "utf8");
const lockMessagesSrc = readMigratedSrc("src/constants/messages.js", "utf8");

// --- LOCKED STRINGS (per CLAUDE.md) ---
// The canonical copy lives in constants/messages.js. Home intentionally no
// longer shows the "submission closed" banner once predictions are locked
// (removed by request — the locked home page shows live/upcoming matches
// instead), so it must NOT reference the lock message anymore.
assert(
  lockMessagesSrc.includes("המשחקים התחילו — ההגשה נסגרה"),
  "LOCK_MESSAGES.tournamentStarted contains the canonical lock-state string"
);
assert(
  !homeSrc.includes("LOCK_MESSAGES.tournamentStarted"),
  "Home no longer shows the tournamentStarted lock banner"
);
assert(
  !homeSrc.includes("ההגשה נסגרה"),
  "Home does not hard-code the lock-state string either"
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

// Home countdown — header now comes through BRAND.countdownHeader
assert(
  lockMessagesSrc.includes("הזמן שנותר לפתיחה"),
  "BRAND.countdownHeader contains natural-Hebrew countdown header"
);
assert(
  homeSrc.includes("BRAND.countdownHeader") || homeSrc.includes("countdownHeader"),
  "Home consumes BRAND.countdownHeader"
);
assert(
  !homeSrc.includes("עוד עד שריקת הפתיחה"),
  "Home no longer uses broken 'עוד עד שריקת הפתיחה'"
);

// Predict submit toast
const predictSrc = readMigratedSrc("src/pages/Predict.jsx", "utf8");
assert(
  predictSrc.includes("נקלט") || predictSrc.includes("בהצלחה"),
  "Predict submit toast has short Hebrew copy"
);
assert(
  !/הטופס הוגש בהצלחה!\s*🎉/.test(predictSrc),
  "Predict no longer uses template 'הטופס הוגש בהצלחה! 🎉'"
);

// Profile save toast
const profileSrc = readMigratedSrc("src/pages/Profile.jsx", "utf8");
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
