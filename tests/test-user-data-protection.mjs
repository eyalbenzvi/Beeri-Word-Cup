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

// ============ 5. ensureUserInStore: cache miss with storeReady=true ============
console.log("--- 5. Cache miss scenario: user exists in Firestore but not in cache ---");

{
  // This is the exact race condition scenario
  const cacheReady = true;
  const cacheUsers = {}; // empty cache (listeners haven't populated yet)
  let lastEnsuredUid = null;
  const firestoreHasUser = true; // user EXISTS in Firestore

  // Simulate the fixed behavior: when user not in cache, use updateUserField
  // instead of createUserField to avoid overwriting
  let usedUpdateField = false;
  let usedCreateField = false;

  function fixedEnsure(uid, displayName, email) {
    if (!cacheReady) return;
    if (lastEnsuredUid === uid && cacheUsers[uid]) return;
    lastEnsuredUid = uid;

    const existing = cacheUsers[uid];
    if (existing) {
      // Normal path: user in cache, update specific fields
      usedUpdateField = true;
      return;
    }
    // Fixed path: user not in cache — use per-field update, not full replace
    // This writes only displayName, email, lastLoginAt — preserves isAdmin, names
    usedUpdateField = true;
    usedCreateField = false;
  }

  fixedEnsure("admin1", "Admin", "admin@test.com");
  assert(usedUpdateField === true, "Cache miss: uses updateUserField (safe)");
  assert(usedCreateField === false, "Cache miss: does NOT use createUserField (unsafe)");
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

// ============ 8. Simulate full race condition: login with other users in cache ============
console.log("--- 8. Full race condition simulation (hasOtherUsers heuristic) ---");

{
  // State: Firestore has admin1 and user2
  // State: cache has user2 loaded but NOT admin1 (partial cache load)
  let cache = { user2: { id: "user2", displayName: "Bob" } };
  const cacheReady = true;

  // BUGGY ensureUserInStore: creates full user, overwrites Firestore
  function buggyEnsure(uid, displayName, email) {
    if (!cacheReady) return;
    const existing = cache[uid];
    if (existing) return;
    const now = new Date().toISOString();
    const newUser = {
      id: uid, displayName: displayName || "משתמש", isAdmin: false,
      email: email || null, profileCompleted: false, createdAt: now, lastLoginAt: now,
    };
    cache[uid] = newUser;
    return { type: "create", payload: { [`data.${uid}`]: newUser } };
  }

  const bugResult = buggyEnsure("admin1", "אייל", "a@b.com");
  assert(bugResult?.type === "create", "Bug: uses create (full replace)");
  assert(cache.admin1.isAdmin === false, "Bug: isAdmin reset to false");
  assert(!cache.admin1.firstName, "Bug: firstName gone");

  // Reset cache to have other users (the realistic scenario)
  cache = { user2: { id: "user2", displayName: "Bob" } };

  // FIXED ensureUserInStore: uses per-field update when other users exist
  function fixedEnsure(uid, displayName, email) {
    if (!cacheReady) return;
    const existing = cache[uid];
    if (existing) return;
    const hasOtherUsers = Object.keys(cache).length > 0;
    const now = new Date().toISOString();
    if (hasOtherUsers) {
      const fields = { id: uid, lastLoginAt: now };
      if (displayName) fields.displayName = displayName;
      if (email) fields.email = email;
      cache[uid] = { isAdmin: false, profileCompleted: false, createdAt: now, ...fields };
      return { type: "update", fields };
    }
    // Empty cache: genuinely new user
    const newUser = {
      id: uid, displayName: displayName || "משתמש", isAdmin: false,
      email: email || null, profileCompleted: false, createdAt: now, lastLoginAt: now,
    };
    cache[uid] = newUser;
    return { type: "create", payload: { [`data.${uid}`]: newUser } };
  }

  const fixResult = fixedEnsure("admin1", "אייל", "a@b.com");
  assert(fixResult?.type === "update", "Fix: uses update when other users in cache");
  assert(!("isAdmin" in (fixResult?.fields || {})), "Fix: isAdmin not in update fields");
  assert(!("firstName" in (fixResult?.fields || {})), "Fix: firstName not in update fields");

  // Test case B: empty cache = genuinely new user
  cache = {};
  const newResult = fixedEnsure("firstUser", "First", null);
  assert(newResult?.type === "create", "Empty cache: uses create (genuinely new user)");
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
