// Static audit of the random-hashed-UID migration scaffolding.
//
// We don't run a Firebase emulator here — adding it would mean shipping
// Java + a new dev dep for one test. Instead we lock in the contract via
// pattern-grep over the source files. Any future edit that breaks the
// PII-removal invariants (e.g. removing the feature flag, embedding the
// phone in the custom token, exposing the migration map to authed users)
// fails this test fast.
//
// Run: node tests/store/test-uid-hash-migration.mjs

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

let passed = 0,
  failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error("  FAIL: " + msg);
  }
}

const rules = readMigratedSrc(resolve(ROOT, "firestore.rules"), "utf8");
const verifyOtp = readMigratedSrc(
  resolve(ROOT, "netlify/functions/phone-verify-otp.js"),
  "utf8",
);
const uidHash = readMigratedSrc(
  resolve(ROOT, "src/utils/uidHash.ts"),
  "utf8",
);
const sentry = readMigratedSrc(resolve(ROOT, "src/sentry.ts"), "utf8");
const migrateScript = readMigratedSrc(
  resolve(ROOT, "scripts/migrate-uids.mjs"),
  "utf8",
);

console.log("=== RANDOM-HASHED-UID MIGRATION (Task 2) ===\n");

// ---------- src/utils/uidHash.ts ----------
console.log("--- src/utils/uidHash.ts ---");

assert(
  /export function deriveHashedUid\(/.test(uidHash),
  "uidHash: deriveHashedUid is exported",
);
assert(
  /createHash\(["']sha256["']\)/.test(uidHash),
  "uidHash: uses SHA-256",
);
// Salt must be applied BEFORE the phone (so a pre-image attacker can't
// reuse a single intermediate hash for many phones).
assert(
  /\.update\(salt\)[\s\S]{0,80}\.update\(phone\)/.test(uidHash),
  "uidHash: salt is fed to the digest before the phone",
);
// Truncate to 16 hex chars (64 bits) — small enough to keep UIDs short,
// big enough that a collision in the user base is astronomically unlikely.
assert(
  /\.slice\(0,\s*16\)/.test(uidHash),
  "uidHash: truncates digest to 16 hex chars",
);
assert(
  /export const PHONE_UID_PREFIX\s*=\s*["']phone_["']/.test(uidHash),
  "uidHash: PHONE_UID_PREFIX is exported with the expected value",
);
assert(
  /export function isPhoneUid\(/.test(uidHash),
  "uidHash: isPhoneUid is exported (works for both legacy & hashed)",
);
// Must throw on empty inputs — silent fallback to a constant UID would
// merge unrelated users.
assert(
  /throw new Error\(["']deriveHashedUid: phone is required["']\)/.test(
    uidHash,
  ) &&
    /throw new Error\(["']deriveHashedUid: salt is required["']\)/.test(
      uidHash,
    ),
  "uidHash: throws on empty phone or empty salt",
);

// ---------- netlify/functions/phone-verify-otp.js ----------
console.log("--- phone-verify-otp.js ---");

// Imports the shared hasher (no copy-pasted SHA logic).
assert(
  /import\s*\{\s*deriveHashedUid\s*\}\s*from\s*["']\.\.\/\.\.\/src\/utils\/uidHash\.js["']/
    .test(verifyOtp),
  "verify-otp: imports deriveHashedUid from src/utils/uidHash.js",
);

// Feature-flag gate — if either USE_HASHED_UID or OTP_SALT is missing the
// function MUST stay on the legacy UID. This is what makes the PR inert
// until the operator deliberately flips both env vars.
assert(
  /process\.env\.USE_HASHED_UID\s*===\s*["']true["']/.test(verifyOtp),
  "verify-otp: gates hashed UID on USE_HASHED_UID === 'true'",
);
assert(
  /process\.env\.OTP_SALT/.test(verifyOtp),
  "verify-otp: reads OTP_SALT env var",
);
// Both flags required together (defense-in-depth — a bare USE_HASHED_UID
// without a salt would crash deriveHashedUid).
assert(
  /useHashed\s*&&\s*salt/.test(verifyOtp),
  "verify-otp: requires BOTH the flag and the salt before computing hashedUid",
);

// gameData/uidMigrationMap consulted to honour explicit overrides.
assert(
  /collection\(["']gameData["']\)\s*\.doc\(["']uidMigrationMap["']\)/.test(
    verifyOtp,
  ) ||
    /doc\(["']gameData\/uidMigrationMap["']\)/.test(verifyOtp),
  "verify-otp: consults gameData/uidMigrationMap",
);

// Custom token MUST NOT carry the phone number as a claim — we explicitly
// dropped { phone: cleanPhone } when introducing the hashed UID, otherwise
// the whole point of the hash is defeated by leaking PII via the JWT.
assert(
  !/createCustomToken\([^,]+,\s*\{\s*phone\s*:/.test(verifyOtp),
  "verify-otp: createCustomToken does NOT include phone in custom claims",
);

// Default (legacy) fallback path is preserved.
assert(
  /let\s+uid\s*=\s*`phone_\$\{cleanPhone\}`/.test(verifyOtp),
  "verify-otp: default uid is the legacy `phone_<phone>` (used when flag is off)",
);

// ---------- firestore.rules: gameData/uidMigrationMap ----------
console.log("--- firestore.rules: uidMigrationMap ---");

const gameDataReadBlock =
  rules.match(
    /match\s+\/gameData\/\{docId\}[\s\S]+?allow\s+read:[\s\S]+?;/,
  )?.[0] || "";

assert(
  /uidMigrationMap/.test(gameDataReadBlock),
  "rules: gameData read clause mentions uidMigrationMap",
);
assert(
  /uidMigrationMap[\s\S]*isAdmin\(\)/.test(gameDataReadBlock),
  "rules: uidMigrationMap read is gated on isAdmin()",
);

// Write must be in the admin-only allowlist.
assert(
  /allow\s+write:\s+if\s+isAdmin\(\)\s*&&\s*docId\s+in\s+\[[^\]]*['"]uidMigrationMap['"]/
    .test(rules),
  "rules: gameData/uidMigrationMap write is in the admin-only allowlist",
);

// Settings remains publicly readable (regression guard — the new clause
// must NOT have demoted settings).
assert(
  /docId\s*==\s*['"]settings['"]/.test(gameDataReadBlock),
  "rules: settings doc remains publicly readable",
);

// ---------- src/sentry.ts: PII scrubber ----------
console.log("--- sentry.ts: phone-UID scrubber ---");

assert(
  /export function scrubPhoneUid\(/.test(sentry),
  "sentry: scrubPhoneUid is exported (testable)",
);
assert(
  /phone_<redacted>/.test(sentry),
  "sentry: scrubber rewrites legacy `phone_<phone>` to `phone_<redacted>`",
);
assert(
  /beforeBreadcrumb/.test(sentry),
  "sentry: beforeBreadcrumb scrub hook is wired in init()",
);
assert(
  /beforeSend/.test(sentry),
  "sentry: beforeSend scrub hook is wired in init()",
);

// ---------- scripts/migrate-uids.mjs ----------
console.log("--- scripts/migrate-uids.mjs ---");

assert(
  /--dry-run/.test(migrateScript) && /--confirm-prod/.test(migrateScript),
  "migrate-uids: supports --dry-run and --confirm-prod (no surprise writes)",
);
assert(
  /predictionsLocked/.test(migrateScript),
  "migrate-uids: refuses to run unless predictions are locked",
);
assert(
  /HASH COLLISION/.test(migrateScript),
  "migrate-uids: aborts on hash collision before any writes",
);
assert(
  /OTP_SALT/.test(migrateScript),
  "migrate-uids: reads OTP_SALT (must match Netlify env var)",
);
assert(
  /uidMigrationMap/.test(migrateScript),
  "migrate-uids: writes the legacy→hashed mapping",
);
// Idempotency: skip uids already present in the map.
assert(
  /existingMap\[uid\]/.test(migrateScript),
  "migrate-uids: skips uids already present in uidMigrationMap (idempotent)",
);
// Predictions get renamed by formId, not just userId-rewritten in place.
assert(
  /\$\{hashedUid\}__\$\{ts\}/.test(migrateScript),
  "migrate-uids: renames prediction docs to <hashedUid>__<ts>",
);

// ---------- summary ----------
console.log("");
console.log(
  `=== UID HASH MIGRATION RESULTS: ${passed} passed, ${failed} failed ===`,
);
process.exit(failed > 0 ? 1 : 0);
