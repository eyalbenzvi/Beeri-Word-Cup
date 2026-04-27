// Static audit of firestore.rules + the dual-write contract in store.js.
//
// We don't run the Firebase emulator here — adding it would mean shipping
// Java + a new dev dep just for one test. Instead, we lock in the
// PII-migration invariants by pattern-grepping the rules file and the
// store implementation. If a future edit deletes a rule clause we depend
// on or moves the dual-write to a different shape, this test fails fast.
//
// Run: node tests/store/test-firestore-rules-pii.mjs

import { readFileSync } from "fs";
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

const rules = readFileSync(resolve(ROOT, "firestore.rules"), "utf8");
const store = readFileSync(resolve(ROOT, "src/store.js"), "utf8");

console.log("=== FIRESTORE RULES — PII MIGRATION (Phase A) ===\n");

// ---------- firestore.rules: userDirectory ----------
console.log("--- userDirectory rule ---");

assert(
  /match\s+\/gameData\/\{docId\}/.test(rules),
  "rules: gameData/{docId} match block exists",
);

assert(
  /docId\s*==\s*['"]userDirectory['"]/.test(rules),
  "rules: userDirectory has explicit docId branches",
);

assert(
  /userDirectoryEntryOk/.test(rules),
  "rules: userDirectoryEntryOk shape validator is defined and used",
);

assert(
  /e\.displayName\s+is\s+string/.test(rules) &&
    /e\.displayName\.size\(\)\s*<=\s*100/.test(rules),
  "rules: userDirectory entry has displayName type + size cap",
);

assert(
  /e\.firstName\s+is\s+string/.test(rules) &&
    /e\.firstName\.size\(\)\s*<=\s*50/.test(rules),
  "rules: userDirectory entry has firstName type + size cap (when present)",
);

assert(
  /e\.lastName\s+is\s+string/.test(rules) &&
    /e\.lastName\.size\(\)\s*<=\s*50/.test(rules),
  "rules: userDirectory entry has lastName type + size cap (when present)",
);

assert(
  /e\.keys\(\)\.hasOnly\(\['displayName',\s*'firstName',\s*'lastName'\]\)/.test(
    rules,
  ),
  "rules: userDirectory entry hasOnly the three allowed keys (no smuggling)",
);

// Non-admin update must restrict to own slot.
assert(
  /docId\s*==\s*['"]userDirectory['"][\s\S]{0,400}affectedKeys\(\)\.hasOnly\(\[request\.auth\.uid\]\)/
    .test(rules),
  "rules: userDirectory update restricts non-admin to own auth.uid slot",
);

// ---------- firestore.rules: userPrivate ----------
console.log("--- userPrivate rules ---");

assert(
  /match\s+\/userPrivate\/\{uid\}/.test(rules),
  "rules: userPrivate/{uid} match block exists",
);

// Read = owner OR admin
assert(
  /allow\s+read:\s+if\s+isAuth\(\)\s+&&\s+\(request\.auth\.uid\s+==\s+uid\s+\|\|\s+isAdmin\(\)\)/.test(
    rules,
  ),
  "rules: userPrivate read = owner OR admin",
);

// Owner-create with isAdmin == false defense-in-depth
assert(
  /userPrivateOwnerCreateOk/.test(rules),
  "rules: userPrivateOwnerCreateOk defined",
);
assert(
  /\(!\('isAdmin'\s+in\s+d\)\s+\|\|\s+d\.isAdmin\s+==\s+false\)/.test(rules),
  "rules: userPrivate owner-create — isAdmin must be false (defense-in-depth)",
);

// Owner-update CANNOT mutate isAdmin
assert(
  /userPrivateOwnerUpdateOk/.test(rules),
  "rules: userPrivateOwnerUpdateOk defined",
);
const updateMatch = rules.match(
  /function userPrivateOwnerUpdateOk[\s\S]+?affectedKeys\(\)\.hasOnly\(\[([^\]]+)\]\)/,
);
assert(
  updateMatch &&
    !/isAdmin/.test(updateMatch[1]) &&
    !/createdAt/.test(updateMatch[1]) &&
    !/['"]id['"]/.test(updateMatch[1]),
  "rules: userPrivate owner-update CANNOT change isAdmin / id / createdAt",
);

// Delete = admin only
const userPrivateBlock =
  rules.match(/match\s+\/userPrivate\/\{uid\}\s*\{[\s\S]+?^\s*\}/m)?.[0] || "";
assert(
  /allow\s+delete:\s+if\s+isAdmin\(\)/.test(userPrivateBlock),
  "rules: userPrivate delete = admin only",
);

// ---------- store.js: dual-write contract ----------
console.log("--- store.js dual-write ---");

assert(
  /const DIRECTORY_FIELDS\s*=\s*\[[^\]]*['"]displayName['"]/.test(store) &&
    /['"]firstName['"]/.test(store) &&
    /['"]lastName['"]/.test(store),
  "store: DIRECTORY_FIELDS includes displayName/firstName/lastName",
);

assert(
  /const USER_PRIVATE_FIELDS\s*=\s*\[[^\]]*['"]email['"]/.test(store) &&
    /['"]isAdmin['"]/.test(store) &&
    /['"]profileCompleted['"]/.test(store) &&
    /['"]lastLoginAt['"]/.test(store) &&
    /['"]createdAt['"]/.test(store),
  "store: USER_PRIVATE_FIELDS includes the 5 private fields",
);

// Critically: directory and private field sets must NOT overlap. Drift here
// would split a single field across two destinations and silently corrupt
// reads.
const dirMatch = store.match(/const DIRECTORY_FIELDS\s*=\s*\[([\s\S]*?)\]/);
const privMatch = store.match(/const USER_PRIVATE_FIELDS\s*=\s*\[([\s\S]*?)\]/);
const dirSet = new Set(
  (dirMatch?.[1] || "").match(/['"][^'"]+['"]/g)?.map((s) => s.slice(1, -1)) || [],
);
const privSet = new Set(
  (privMatch?.[1] || "").match(/['"][^'"]+['"]/g)?.map((s) => s.slice(1, -1)) || [],
);
const overlap = [...dirSet].filter((f) => privSet.has(f));
assert(
  overlap.length === 0,
  `store: DIRECTORY_FIELDS and USER_PRIVATE_FIELDS must not overlap (got: ${overlap.join(", ")})`,
);

// Each user write helper must use writeBatch (atomic) AND touch all three
// destinations.
function helperBlock(name) {
  const re = new RegExp(`async function ${name}\\([^)]*\\)[\\s\\S]+?\\n\\}`, "m");
  return store.match(re)?.[0] || "";
}

for (const helper of ["createUserField", "updateUserField", "removeUserField"]) {
  const block = helperBlock(helper);
  assert(block.length > 0, `store: ${helper} is defined`);
  assert(/writeBatch\(db\)/.test(block), `store: ${helper} uses writeBatch (atomic)`);
  assert(
    /gameDocRef\(["']users["']\)/.test(block),
    `store: ${helper} writes to legacy gameData/users`,
  );
  assert(
    /userDirectoryDocRef\(\)/.test(block),
    `store: ${helper} writes to gameData/userDirectory`,
  );
  assert(
    /userPrivateDocRef\(/.test(block),
    `store: ${helper} writes to userPrivate/{uid}`,
  );
}

// deleteUser also has to clean up directory + userPrivate.
{
  const block = (
    store.match(/export async function deleteUser\([\s\S]+?\n\}/) || []
  )[0] || "";
  assert(block.length > 0, "store: deleteUser is defined");
  assert(
    /userDirectoryDocRef\(\)/.test(block) &&
      /userPrivateDocRef\(/.test(block),
    "store: deleteUser cleans up directory + userPrivate",
  );
}

// clearAllData: nuke must also clear userPrivate collection.
{
  const block = (
    store.match(/export async function clearAllData\([\s\S]+?\n\}/) || []
  )[0] || "";
  assert(
    /userPrivateCollectionRef/.test(block) &&
      /gameDocRef\(["']userDirectory["']\)/.test(block),
    "store: clearAllData wipes userDirectory + userPrivate collection",
  );
}

// importAllData: re-derives directory + userPrivate from imported users.
{
  const block = (
    store.match(/export async function importAllData\([\s\S]+?\n\}/) || []
  )[0] || "";
  assert(
    /pickKnown\([^)]*DIRECTORY_FIELDS\)/.test(block) &&
      /pickKnown\([^)]*USER_PRIVATE_FIELDS\)/.test(block),
    "store: importAllData re-derives directory + private from imported users",
  );
  assert(
    /userPrivateCollectionRef/.test(block),
    "store: importAllData clears stale userPrivate docs before re-writing",
  );
}

// ---------- Phase B: cut-over assertions ----------
console.log("--- Phase B cut-over ---");

// isAdmin() reads from userPrivate, NOT gameData/users.
const isAdminBlock =
  rules.match(/function isAdmin\(\)\s*\{[\s\S]+?\n\s*\}/)?.[0] || "";
assert(
  /userPrivate\/\$\(request\.auth\.uid\)/.test(isAdminBlock),
  "rules: isAdmin() Firestore fallback reads userPrivate/{uid}",
);
assert(
  !/get\([^)]*gameData\/users[^)]*\)\.data\.data\[/.test(isAdminBlock),
  "rules: isAdmin() no longer reads gameData/users",
);
assert(
  /exists\([^;]*userPrivate/.test(isAdminBlock),
  "rules: isAdmin() guards Firestore fallback with exists() (no error on missing doc)",
);

// gameData/users read is admin-only. Settings is still public, other docs auth.
const gameDataReadBlock =
  rules.match(
    /match\s+\/gameData\/\{docId\}[\s\S]+?allow\s+read:[\s\S]+?;/,
  )?.[0] || "";
assert(
  /docId\s*==\s*['"]users['"][^?]*\?[\s\S]*?isAdmin\(\)/.test(gameDataReadBlock) ||
    /docId\s*==\s*['"]users['"][\s\S]+?isAdmin\(\)/.test(gameDataReadBlock),
  "rules: gameData/users read is gated on isAdmin()",
);
assert(
  /docId\s*==\s*['"]settings['"]/.test(gameDataReadBlock),
  "rules: settings doc remains publicly readable",
);

// store.js handles permission-denied on the legacy users listener as
// expected (Phase B non-admin path). Look for a guarded early-return
// inside the gameDoc listener error handler.
const usersPermDeniedPattern =
  /if\s*\(\s*key\s*===\s*["']users["'][\s\S]{0,200}?permission-denied[\s\S]{0,200}?cache\._ready\[key\]\s*=\s*true/;
assert(
  usersPermDeniedPattern.test(store),
  "store: gameDoc listener treats permission-denied on `users` as expected",
);

// isCurrentUserAdmin helper consults userPrivate (Phase B source of truth)
assert(
  /function\s+isCurrentUserAdmin\s*\(/.test(store),
  "store: isCurrentUserAdmin helper exists",
);
// The helper binds currentListenerUserId to a local and reads through
// cache.userPrivate first (Phase B source of truth).
const isCurrentUserAdminBlock =
  store.match(/function\s+isCurrentUserAdmin\s*\([^)]*\)\s*\{[\s\S]+?\n\}/)?.[0] || "";
assert(
  /cache\.userPrivate\?\.\[/.test(isCurrentUserAdminBlock) &&
    /\.isAdmin/.test(isCurrentUserAdminBlock),
  "store: isCurrentUserAdmin reads from cache.userPrivate (new source of truth)",
);

// getUser merges from userDirectory + userPrivate when cache.users is empty
const getUserBlock =
  store.match(/export function getUser\([\s\S]+?\n\}/)?.[0] || "";
assert(
  /cache\.userDirectory/.test(getUserBlock) &&
    /cache\.userPrivate/.test(getUserBlock),
  "store: getUser() falls back to userDirectory + userPrivate merge",
);

// useUsers consumers we explicitly migrated should now use useUserDirectory.
console.log("--- non-admin consumers migrated ---");
const migrated = [
  "src/pages/Leaderboard.jsx",
  "src/pages/AllForms.jsx",
  "src/pages/DailySummary.jsx",
  "src/components/SimulatorPanel.jsx",
  "src/components/SummaryEditor.jsx",
];
for (const f of migrated) {
  const src = readFileSync(resolve(ROOT, f), "utf8");
  assert(
    /useUserDirectory/.test(src) && !/\buseUsers\(/.test(src),
    `${f} uses useUserDirectory and not useUsers()`,
  );
}

// ---------- summary ----------
console.log("");
console.log(`=== FIRESTORE RULES PII RESULTS: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
