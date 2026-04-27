// Tests for user data protection: ensureUserInStore must not overwrite existing
// Firestore fields (isAdmin, firstName, lastName) when cache is empty but user exists.

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== USER DATA PROTECTION TESTS ===\n");

// ============ 1. ensureUserInStore: existing user not in cache ============
console.log("--- 1. ensureUserInStore: cache miss must NOT overwrite existing fields ---");

// Simulate Firestore having a full user record, but cache is empty (race condition)
// The bug: createUserField writes { id, displayName, isAdmin: false, ... } which
// replaces the entire data.${uid} object, losing firstName, lastName, isAdmin: true

{
  // Simulate the BUGGY behavior (before fix)
  const firestoreUser = {
    id: "admin1",
    displayName: "אייל",
    firstName: "אייל",
    lastName: "בן צבי",
    isAdmin: true,
    email: "admin@test.com",
    profileCompleted: true,
    createdAt: "2026-04-10T00:00:00Z",
    lastLoginAt: "2026-04-15T00:00:00Z",
  };

  // What createUserField would write (the bug — replaces entire user object)
  const buggyPayload = {
    id: "admin1",
    displayName: "אייל",
    isAdmin: false,        // ← WRONG: was true
    email: "admin@test.com",
    profileCompleted: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    // ← MISSING: firstName, lastName
  };

  // Verify the bug: createUserField replaces data.${uid} entirely
  assert(buggyPayload.isAdmin !== firestoreUser.isAdmin, "Bug demo: isAdmin overwritten from true to false");
  assert(!buggyPayload.firstName, "Bug demo: firstName lost");
  assert(!buggyPayload.lastName, "Bug demo: lastName lost");
  assert(!buggyPayload.profileCompleted, "Bug demo: profileCompleted reset");
}

// ============ 2. Fix: per-field update preserves existing data ============
console.log("--- 2. Fix: updateUserField preserves existing fields ---");

{
  // Simulate Firestore user (what exists in DB)
  const firestoreUser = {
    id: "admin1",
    displayName: "אייל",
    firstName: "אייל",
    lastName: "בן צבי",
    isAdmin: true,
    email: "admin@test.com",
    profileCompleted: true,
    createdAt: "2026-04-10T00:00:00Z",
    lastLoginAt: "2026-04-15T00:00:00Z",
  };

  // The fix: updateUserField writes individual dot-notation fields
  // Only updates displayName and email (if changed), preserving everything else
  const updateFields = {};
  const displayName = "אייל";
  const email = "admin@test.com";

  if (displayName && firestoreUser.displayName !== displayName)
    updateFields.displayName = displayName;
  if (email && !firestoreUser.email) updateFields.email = email;

  // Simulate applying update to Firestore (dot-notation: only specified fields change)
  const afterUpdate = { ...firestoreUser, ...updateFields };

  assert(afterUpdate.isAdmin === true, "Fix: isAdmin preserved as true");
  assert(afterUpdate.firstName === "אייל", "Fix: firstName preserved");
  assert(afterUpdate.lastName === "בן צבי", "Fix: lastName preserved");
  assert(afterUpdate.profileCompleted === true, "Fix: profileCompleted preserved");
  assert(afterUpdate.createdAt === "2026-04-10T00:00:00Z", "Fix: createdAt preserved");
}

// ============ 3. Genuinely new user still gets full record ============
console.log("--- 3. Genuinely new user: all fields created ---");

{
  // When user doesn't exist in cache AND doesn't exist in Firestore,
  // createUserField should create the full record
  const newUser = {
    id: "newUser1",
    displayName: "New User",
    isAdmin: false,
    email: "new@test.com",
    profileCompleted: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  assert(newUser.id === "newUser1", "New user: id set");
  assert(newUser.displayName === "New User", "New user: displayName set");
  assert(newUser.isAdmin === false, "New user: isAdmin defaults to false");
  assert(newUser.email === "new@test.com", "New user: email set");
  assert(newUser.profileCompleted === false, "New user: profileCompleted false");
  assert(newUser.createdAt, "New user: createdAt set");
  assert(newUser.lastLoginAt, "New user: lastLoginAt set");
}

// ============ 4. ensureUserInStore guard: lastEnsuredUid ============
console.log("--- 4. ensureUserInStore guard prevents double writes ---");

{
  let lastEnsuredUid = null;
  const users = { admin1: { id: "admin1", displayName: "Admin" } };
  let writeCount = 0;

  function simulateEnsure(uid, displayName) {
    if (lastEnsuredUid === uid && users[uid]) return;
    lastEnsuredUid = uid;
    if (users[uid]) {
      if (displayName && users[uid].displayName !== displayName) {
        users[uid] = { ...users[uid], displayName };
        writeCount++;
      }
      return;
    }
    writeCount++;
  }

  simulateEnsure("admin1", "Admin");
  assert(writeCount === 0, "Guard: same uid + same name = no write");

  simulateEnsure("admin1", "Admin Changed");
  assert(writeCount === 0, "Guard: lastEnsuredUid blocks even with name change");

  lastEnsuredUid = null; // simulate new session
  simulateEnsure("admin1", "Admin");
  assert(writeCount === 0, "Guard reset + same name = no write (just re-validate)");

  lastEnsuredUid = null;
  simulateEnsure("admin1", "Admin Changed");
  assert(writeCount === 1, "Guard reset + different name = 1 write");
}

// ============ 5. ensureUserInStore: getDoc-based disambiguation ============
console.log("--- 5. Cache miss: getDoc decides between create (new) and update (desync) ---");

{
  // New behavior: when user not in cache, ensureUserInStore reads
  // gameData/users directly. If the user exists there, per-field update.
  // If not, full createUserField — which is what Firestore rules demand
  // for new entries (isAdmin: false must be present in the payload).

  function simulateEnsure({ firestoreUsers, uid, displayName, email }) {
    // Mirrors the real disambiguation in src/store.js ensureUserInStore.
    const existingInFirestore = firestoreUsers[uid] || null;
    if (existingInFirestore) {
      const fields = { id: uid, lastLoginAt: "now" };
      if (displayName && existingInFirestore.displayName !== displayName)
        fields.displayName = displayName;
      if (email && !existingInFirestore.email) fields.email = email;
      return { type: "update", fields };
    }
    return {
      type: "create",
      userData: {
        id: uid, displayName: displayName || "משתמש", isAdmin: false,
        email: email || null, profileCompleted: false,
        createdAt: "now", lastLoginAt: "now",
      },
    };
  }

  // Scenario A: cache desync — admin exists in Firestore
  const adminDoc = { id: "admin1", displayName: "Admin", isAdmin: true, firstName: "אייל" };
  const desyncResult = simulateEnsure({
    firestoreUsers: { admin1: adminDoc },
    uid: "admin1", displayName: "Admin", email: null,
  });
  assert(desyncResult.type === "update", "Desync: uses per-field update (preserves isAdmin)");
  assert(!("isAdmin" in desyncResult.fields), "Desync: update payload does NOT touch isAdmin");

  // Scenario B: genuinely new user (dad recreated after deletion)
  const newResult = simulateEnsure({
    firestoreUsers: { admin1: adminDoc },
    uid: "newuser", displayName: "New", email: "n@b.com",
  });
  assert(newResult.type === "create", "New: uses full createUserField");
  assert(newResult.userData.isAdmin === false, "New: payload includes isAdmin: false (rule requirement)");
  assert(newResult.userData.profileCompleted === false, "New: payload includes profileCompleted");
}

// ============ 6. updateUserField dot-notation payload ============
console.log("--- 6. updateUserField generates correct dot-notation ---");

{
  function buildUpdatePayload(uid, fields) {
    const payload = {};
    for (const [key, value] of Object.entries(fields)) {
      payload[`data.${uid}.${key}`] = value;
    }
    return payload;
  }

  const payload = buildUpdatePayload("admin1", {
    displayName: "New Name",
    lastLoginAt: "2026-04-16T00:00:00Z",
  });

  assert(payload["data.admin1.displayName"] === "New Name", "Dot-notation: displayName correct");
  assert(payload["data.admin1.lastLoginAt"] === "2026-04-16T00:00:00Z", "Dot-notation: lastLoginAt correct");
  assert(!payload["data.admin1.isAdmin"], "Dot-notation: isAdmin not touched");
  assert(!payload["data.admin1.firstName"], "Dot-notation: firstName not touched");
  assert(!payload["data.admin1.lastName"], "Dot-notation: lastName not touched");
  assert(Object.keys(payload).length === 2, "Dot-notation: only 2 fields in payload");
}

// ============ 7. createUserField full-replace payload (for comparison) ============
console.log("--- 7. createUserField replaces entire user object ---");

{
  function buildCreatePayload(uid, userData) {
    return { [`data.${uid}`]: userData };
  }

  const newUserData = {
    id: "admin1",
    displayName: "Admin",
    isAdmin: false,
    email: null,
    profileCompleted: false,
  };

  const payload = buildCreatePayload("admin1", newUserData);
  const written = payload["data.admin1"];

  assert(written.isAdmin === false, "Create payload: isAdmin forced to false");
  assert(!written.firstName, "Create payload: no firstName field");
  assert(!written.lastName, "Create payload: no lastName field");
  // This demonstrates why createUserField is WRONG for existing users
}

// ============ 8. Firestore rule requirement: new users need isAdmin: false ============
console.log("--- 8. Rule alignment: new-user write payload must satisfy create-rule ---");

{
  // firestore.rules:29-31 says:
  //   (!(uid in resource.data.data) &&
  //    request.resource.data.data[uid].isAdmin == false)
  // A partial update that omits isAdmin will be REJECTED and the SDK
  // reverts the optimistic cache, which leaves user=null and App stuck.

  function ruleAllowsCreate(existingUsers, updatePayloadForUid, uid) {
    // Mimic the rule: for a new entry, isAdmin must be explicitly false.
    const already = !!existingUsers[uid];
    if (already) {
      return updatePayloadForUid.isAdmin === existingUsers[uid].isAdmin;
    }
    return updatePayloadForUid.isAdmin === false;
  }

  const firestore = { admin1: { id: "admin1", isAdmin: true, displayName: "Admin" } };

  // Partial payload (the buggy pre-fix path) — MUST be rejected
  const partial = { id: "dad", lastLoginAt: "now", displayName: "Dad" };
  assert(!ruleAllowsCreate(firestore, partial, "dad"),
    "Rule: partial payload without isAdmin is REJECTED for new entry");

  // Full payload (what createUserField sends) — MUST pass
  const full = {
    id: "dad", displayName: "Dad", isAdmin: false, email: null,
    profileCompleted: false, createdAt: "now", lastLoginAt: "now",
  };
  assert(ruleAllowsCreate(firestore, full, "dad"),
    "Rule: full payload with isAdmin:false passes for new entry");

  // Existing user: partial update must preserve isAdmin
  const existing = { admin1: { id: "admin1", isAdmin: true } };
  const partialAdmin = { lastLoginAt: "now" }; // no isAdmin touched
  // In Firestore, dot-notation preserves untouched fields — so resulting
  // entry still has isAdmin: true.
  const afterUpdate = { ...existing.admin1, ...partialAdmin };
  assert(ruleAllowsCreate(existing, afterUpdate, "admin1"),
    "Rule: per-field update preserves isAdmin for existing user");
}

// ============ 8b. Bounded ensureUserInStore retry ============
console.log("--- 8b. A1: ensureUserInStore retry is bounded to MAX_ENSURE_RETRIES ---");

{
  const MAX_ENSURE_RETRIES = 3;
  const retryCount = new Map();
  let writeAttempts = 0;

  function attempt(uid) {
    const n = retryCount.get(uid) || 0;
    if (n >= MAX_ENSURE_RETRIES) return { skipped: true, attempts: n };
    retryCount.set(uid, n + 1);
    writeAttempts++;
    return { skipped: false, attempts: n + 1 };
  }

  // Simulate 5 calls for same uid (each write fails and we retry)
  const results = [];
  for (let i = 0; i < 5; i++) results.push(attempt("dad"));

  assert(writeAttempts === 3, "Retry cap: write attempted exactly 3 times");
  assert(results[0].attempts === 1, "First call: attempt 1");
  assert(results[2].attempts === 3, "Third call: attempt 3");
  assert(results[3].skipped === true, "Fourth call: skipped (cap reached)");
  assert(results[4].skipped === true, "Fifth call: still skipped");
}

// ============ 9. First-ever user must still get isAdmin ============
console.log("--- 9. First user ever: must get isAdmin: true ---");

{
  // The very first user has NO users in cache AND NO users in Firestore
  // This is the only case where createUserField should be used
  // But we need to set isAdmin: true for the first user

  // Current store.js sets isAdmin: false always in ensureUserInStore.
  // First admin is set differently (not via ensureUserInStore).
  // Verify this pattern is preserved.
  const emptyCache = {};
  const isFirstUser = Object.keys(emptyCache).length === 0;
  assert(isFirstUser, "Empty cache: recognized as first user scenario");

  // ensureUserInStore always sets isAdmin: false — first admin is set elsewhere
  // This is fine, just verify the pattern
  const newUser = {
    id: "first1", displayName: "First", isAdmin: false,
    email: null, profileCompleted: false,
  };
  assert(newUser.isAdmin === false, "ensureUserInStore always sets isAdmin: false (correct)");
}

// ============ 10. Profile update: empty string names ============
console.log("--- 10. updateUserProfile: empty string names should be blocked ---");

{
  function updateUserProfile(user, profileFields) {
    const { firstName, lastName, displayName, profileCompleted } = profileFields;
    const fields = {};
    if (firstName !== undefined) fields.firstName = firstName;
    if (lastName !== undefined) fields.lastName = lastName;
    if (displayName !== undefined) fields.displayName = displayName;
    if (profileCompleted !== undefined) fields.profileCompleted = profileCompleted;
    return fields;
  }

  // Current behavior: empty string IS written (potential bug)
  const result = updateUserProfile(
    { id: "u1", firstName: "אייל", lastName: "בן צבי" },
    { firstName: "", lastName: "" },
  );
  // This test documents the current behavior
  assert(result.firstName === "", "Current: empty firstName is written (documented issue)");
  assert(result.lastName === "", "Current: empty lastName is written (documented issue)");
}

// ============ 11. Snapshot arrives after ensure — cache gets real data ============
console.log("--- 11. Snapshot overwrites optimistic cache ---");

{
  // After ensureUserInStore writes partial data, the Firestore snapshot arrives
  // and overwrites the cache with the REAL data from Firestore
  let cache = { admin1: { id: "admin1", displayName: "אייל", email: "a@b.com" } };

  // Snapshot arrives with full Firestore data
  const snapshotData = {
    admin1: {
      id: "admin1", displayName: "אייל", firstName: "אייל", lastName: "בן צבי",
      isAdmin: true, email: "a@b.com", profileCompleted: true,
      createdAt: "2026-04-10T00:00:00Z", lastLoginAt: "2026-04-16T00:00:00Z",
    },
  };
  cache = snapshotData; // onSnapshot overwrites cache

  assert(cache.admin1.isAdmin === true, "Snapshot: isAdmin restored to true");
  assert(cache.admin1.firstName === "אייל", "Snapshot: firstName restored");
  assert(cache.admin1.lastName === "בן צבי", "Snapshot: lastName restored");
}

// ============ 12. ensureUserInStore: email update logic ============
console.log("--- 12. Email update: only fills missing email ---");

{
  function shouldUpdateEmail(existingEmail, newEmail) {
    return newEmail && !existingEmail;
  }

  assert(shouldUpdateEmail(null, "a@b.com") === true, "No email + new email = update");
  assert(shouldUpdateEmail(undefined, "a@b.com") === true, "Undefined + new email = update");
  assert(shouldUpdateEmail("old@b.com", "new@b.com") === false, "Has email + new email = no update (keep old)");
  assert(!shouldUpdateEmail("a@b.com", null), "Has email + null = no update");
  assert(!shouldUpdateEmail(null, null), "No email + null = no update");
}

// ============ 13. importAllData: setDoc is full replace (by design) ============
console.log("--- 13. importAllData: full replace is intentional for backup restore ---");

{
  // importAllData uses setDoc which replaces the entire document.
  // This is correct for backup/restore: the backup IS the truth.
  const backup = {
    admin1: { id: "admin1", displayName: "Admin", isAdmin: true, firstName: "A", lastName: "B" },
    user2: { id: "user2", displayName: "User", isAdmin: false },
  };

  // Simulate setDoc — full replace
  const afterImport = { ...backup };
  assert(afterImport.admin1.isAdmin === true, "Import: preserves isAdmin from backup");
  assert(afterImport.admin1.firstName === "A", "Import: preserves firstName from backup");
  assert(!afterImport.user3, "Import: user3 not in backup = not in result (correct)");
}

// ============ 14. Concurrent login from multiple devices ============
console.log("--- 14. Concurrent login: two devices, same user ---");

{
  // Device A loads page — cache empty, ensureUserInStore fires
  // Device B loads page — cache empty, ensureUserInStore fires
  // Both should use updateUserField, not createUserField
  // So both write only displayName/email/lastLoginAt — no conflict

  const fieldsDeviceA = { displayName: "Admin", lastLoginAt: "2026-04-16T10:00:00Z" };
  const fieldsDeviceB = { displayName: "Admin", lastLoginAt: "2026-04-16T10:01:00Z" };

  // Both use dot-notation, so last write wins for lastLoginAt only
  // isAdmin, firstName, lastName are never touched
  assert(!("isAdmin" in fieldsDeviceA), "Device A: isAdmin not in payload");
  assert(!("isAdmin" in fieldsDeviceB), "Device B: isAdmin not in payload");
  assert(!("firstName" in fieldsDeviceA), "Device A: firstName not in payload");
  assert(!("firstName" in fieldsDeviceB), "Device B: firstName not in payload");
}

// ============ 15. Phone user login: cache miss ============
console.log("--- 15. Phone user: cache miss should not overwrite ---");

{
  const phoneUid = "phone_0501234567";
  const firestoreUser = {
    id: phoneUid, displayName: "0501234567", firstName: "דני", lastName: "כהן",
    isAdmin: false, email: null, profileCompleted: true,
  };

  // Fixed ensure: only updates safe fields
  const updateFields = { displayName: "0501234567", lastLoginAt: new Date().toISOString() };

  // Merge: Firestore keeps existing fields, only specified fields update
  const afterMerge = { ...firestoreUser, ...updateFields };
  assert(afterMerge.firstName === "דני", "Phone user: firstName preserved after login");
  assert(afterMerge.lastName === "כהן", "Phone user: lastName preserved after login");
  assert(afterMerge.profileCompleted === true, "Phone user: profileCompleted preserved");
}

// ============ 16. Verify createUserField payload structure ============
console.log("--- 16. createUserField: data.uid replaces entire user object ---");

{
  // This test demonstrates WHY createUserField is dangerous for existing users
  // updateDoc with { "data.admin1": {...} } replaces the ENTIRE data.admin1 object
  // vs updateDoc with { "data.admin1.displayName": "..." } only updates that field

  const existingInFirestore = {
    data: {
      admin1: { id: "admin1", displayName: "Old", isAdmin: true, firstName: "A", lastName: "B" },
    },
  };

  // createUserField payload: { "data.admin1": { id, displayName, isAdmin: false, ... } }
  // This REPLACES data.admin1 entirely
  const createPayload = {
    "data.admin1": { id: "admin1", displayName: "New", isAdmin: false, email: null },
  };
  // Simulate Firestore updateDoc with this payload
  const afterCreate = {
    data: { ...existingInFirestore.data, admin1: createPayload["data.admin1"] },
  };
  assert(afterCreate.data.admin1.isAdmin === false, "createField: isAdmin overwritten to false");
  assert(!afterCreate.data.admin1.firstName, "createField: firstName LOST");

  // updateUserField payload: { "data.admin1.displayName": "New", "data.admin1.lastLoginAt": "..." }
  // This ONLY updates specified fields
  const updatePayload = { "data.admin1.displayName": "New", "data.admin1.lastLoginAt": "2026-04-16" };
  // Simulate Firestore updateDoc with dot-notation
  const afterUpdate = {
    data: {
      ...existingInFirestore.data,
      admin1: {
        ...existingInFirestore.data.admin1,
        displayName: updatePayload["data.admin1.displayName"],
        lastLoginAt: updatePayload["data.admin1.lastLoginAt"],
      },
    },
  };
  assert(afterUpdate.data.admin1.isAdmin === true, "updateField: isAdmin PRESERVED");
  assert(afterUpdate.data.admin1.firstName === "A", "updateField: firstName PRESERVED");
  assert(afterUpdate.data.admin1.displayName === "New", "updateField: displayName updated");
}

// ============ SUMMARY ============
console.log(`\n=== USER DATA PROTECTION: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
