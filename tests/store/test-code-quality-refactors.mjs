// Regression guards for the code-quality cleanup pass.
// Each assertion pins an invariant that, if reverted, would re-introduce the
// duplication / magic-number / dead-code smell the cleanup removed. Written
// in the suite's native source-grep style so a future edit that re-inlines a
// literal or re-adds a dead export trips immediately.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const readRaw = (rel) => readFileSync(resolve(repoRoot, rel), "utf8");

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== CODE QUALITY REFACTORS — REGRESSION GUARDS ===\n");

// ============ 1. localStorage identity keys: single source of truth ============
console.log("--- 1. storageKeys.ts centralises the identity keys ---");
{
  const storageKeys = readMigratedSrc("src/constants/storageKeys.js");
  assert(/CURRENT_USER_KEY\s*=\s*"wc2026_currentUser"/.test(storageKeys),
    "storageKeys defines CURRENT_USER_KEY");
  assert(/ACTIVE_FORM_KEY\s*=\s*"wc2026_activeForm"/.test(storageKeys),
    "storageKeys defines ACTIVE_FORM_KEY");

  // No other module may re-declare the literal — they must import the const.
  const consumers = [
    "src/store/index.js",
    "src/store/usersRepo.js",
    "src/store/backupRestore.js",
    "src/store/predictionsRepo.js",
    "src/hooks/useStore.js",
    "src/App.jsx",
  ];
  for (const rel of consumers) {
    const src = readMigratedSrc(rel);
    assert(!/=\s*"wc2026_currentUser"/.test(src) && !/=\s*"wc2026_activeForm"/.test(src),
      `${rel} does not re-declare the identity key literals`);
    assert(/from\s+["'][^"']*constants\/storageKeys["']/.test(src),
      `${rel} imports the keys from constants/storageKeys`);
  }
}

// ============ 2. phone_ UID prefix: use the shared constant ============
console.log("--- 2. PHONE_UID_PREFIX replaces inline \"phone_\" ---");
{
  for (const rel of ["src/hooks/useStore.js", "src/components/AdminUsersTab.jsx"]) {
    const src = readMigratedSrc(rel);
    assert(/PHONE_UID_PREFIX/.test(src), `${rel} references PHONE_UID_PREFIX`);
    assert(!/startsWith\("phone_"\)/.test(src) && !/replace\("phone_"/.test(src),
      `${rel} has no inline "phone_" literal`);
  }
}

// ============ 3. PHONE_MAX_INPUT_LEN wired into the phone input ============
console.log("--- 3. PhoneSignIn uses PHONE_MAX_INPUT_LEN, not maxLength={20} ---");
{
  const src = readMigratedSrc("src/components/PhoneSignIn.jsx");
  assert(/maxLength=\{PHONE_MAX_INPUT_LEN\}/.test(src),
    "PhoneSignIn uses the PHONE_MAX_INPUT_LEN constant for the phone field");
  assert(!/maxLength=\{20\}/.test(src),
    "PhoneSignIn has no inline maxLength={20}");
}

// ============ 4. No PII logging in the OTP function ============
console.log("--- 4. phone-send-otp does not console.log the SMS response ---");
{
  const src = readRaw("netlify/functions/phone-send-otp.js");
  assert(!/console\.log/.test(src),
    "phone-send-otp.js has no console.log (avoid SMS-provider PII in logs)");
}

// ============ 5. Time-unit constants centralised ============
console.log("--- 5. HOUR_MS / DAY_MS / MINUTE_MS + ISRAEL_OFFSET_HOURS in constants ---");
{
  const constants = readMigratedSrc("src/utils/constants.js");
  assert(/MINUTE_MS\s*=/.test(constants), "constants defines MINUTE_MS");
  assert(/HOUR_MS\s*=/.test(constants), "constants defines HOUR_MS");
  assert(/DAY_MS\s*=/.test(constants), "constants defines DAY_MS");
  assert(/ISRAEL_OFFSET_HOURS\s*=\s*3/.test(constants), "constants defines ISRAEL_OFFSET_HOURS = 3");

  const matchTime = readMigratedSrc("src/utils/matchTime.js");
  assert(/from\s+["']\.\/constants["']/.test(matchTime), "matchTime imports from constants");
  assert(!/3600000/.test(matchTime) && !/86400000/.test(matchTime),
    "matchTime has no raw hour/day millisecond literals");
  assert(!/ISRAEL_OFFSET_HOURS\s*=\s*3/.test(matchTime),
    "matchTime no longer declares its own ISRAEL_OFFSET_HOURS");

  const countdown = readMigratedSrc("src/hooks/useCountdown.js");
  assert(/DAY_MS/.test(countdown) && /HOUR_MS/.test(countdown) && /MINUTE_MS/.test(countdown),
    "useCountdown uses the named time constants");
  assert(!/86400000/.test(countdown) && !/3600000/.test(countdown),
    "useCountdown has no raw hour/day millisecond literals");
}

// ============ 6. Dead code removed ============
console.log("--- 6. dead exports / orphaned file removed ---");
{
  assert(!/export function resetOnceKeys/.test(readMigratedSrc("src/sentry.js")),
    "sentry: resetOnceKeys removed");
  assert(!/export function isPublicModeInitialized/.test(readMigratedSrc("src/store/publicMode.js")),
    "publicMode: isPublicModeInitialized getter removed");
  assert(!/export function getCurrentListenerUserId/.test(readMigratedSrc("src/store/listeners.js")),
    "listeners: getCurrentListenerUserId getter removed");
  assert(!/FD_LIVE_STATUSES/.test(readMigratedSrc("src/utils/liveScores.js")),
    "liveScores: FD_LIVE_STATUSES removed");
  assert(!/export function encodeChips/.test(readMigratedSrc("src/utils/adminQuery/chipSerialize.js")),
    "chipSerialize: encodeChips removed");
  assert(!existsMigratedSrc("src/utils/adminQuery/promptBuilder.js"),
    "adminQuery: orphaned promptBuilder.ts deleted");
}

// ============ 7. Second-batch quality fixes ============
console.log("--- 7. second-batch fixes (VALID_MODALS, MatchCard, bestCase) ---");
{
  // VALID_MODALS is actually enforced in the URL read path (latent bug fixed).
  const useNav = readMigratedSrc("src/hooks/useNavigation.jsx");
  assert(/VALID_MODALS\.has\(/.test(useNav),
    "useNavigation enforces VALID_MODALS (drops bogus ?modal=…)");

  // MatchCard auto-advance uses a named single-digit bound, not a literal 9.
  const matchCard = readMigratedSrc("src/components/MatchCard.jsx");
  assert(/SINGLE_DIGIT_MAX\s*=\s*9/.test(matchCard), "MatchCard names SINGLE_DIGIT_MAX");
  assert(!/v <= 9\b/.test(matchCard), "MatchCard has no inline `v <= 9` literal");

  // bestCase shape-dedup indexes groupTeams by CODE (else shapeKey is always
  // empty and every combo collapses into one bucket).
  const bestCase = readMigratedSrc("src/utils/bestCase.js");
  assert(/GROUPS\[[^\]]*\][^\n]*\|\|\s*\[\]\)[\s\S]{0,40}\.map\(\([^)]*\)\s*=>\s*[a-zA-Z]+\.code\)/.test(bestCase),
    "bestCase builds groupTeams from team codes, not team objects");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
