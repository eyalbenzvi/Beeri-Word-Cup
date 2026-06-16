// User-data repo + admin operations.
//
// Owns:
//   - getUsers / getUserDirectory / getUserPrivate / getUserPrivateMap /
//     isUserPrivateReady — read accessors (subscriptions go through cache).
//   - getUser / getCurrentUser — own/other-user read with PII migration
//     Phase B fallback (merge userDirectory + userPrivate when cache.users
//     is empty for non-admins).
//   - DIRECTORY_FIELDS / USER_PRIVATE_FIELDS / pickKnown — field-routing
//     helpers shared with backupRestore.
//   - createUserField / updateUserField / removeUserField — atomic dual-write
//     across legacy users + userDirectory + userPrivate via writeBatch.
//   - ensureUserInStore — login bootstrap with single-flight guard.
//   - updateUser / updateUserProfile / touchUserLogin / demoteAdmin /
//     setAdminClaim / deleteUser — admin / profile mutation paths.
//   - writeGameDoc — generic single-doc admin writer with the
//     dont-shrink-shared-data safety guard. Lives here because users is
//     the primary consumer; matchResults / settings / actualBonuses
//     callers import from this module.
//   - requireAdmin — defense-in-depth client guard.

import {
  getDoc,
  setDoc,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { captureClientError, captureClientMessage } from "../sentry";
import { MAX_USERS_HARD_LIMIT } from "../utils/constants";
import {
  db,
  gameDocRef,
  formDocRef,
  userDirectoryDocRef,
  userPrivateDocRef,
  withTimeout,
  safeClone,
  maybeRefreshToken,
  retryOnPermissionDenied,
} from "./firestoreClient";
import {
  cache,
  notifyAndEmit,
  notifyAllListeners,
  emitSaving,
  emitSaved,
  emitWriteError,
} from "./cache";
import { writeAuditLog } from "./audit";

// PII migration Phase A: each user record is split across THREE Firestore
// locations and dual-written atomically:
//   1. gameData/users      — legacy doc (full record). Kept during the
//                            compat window so admin tabs and the
//                            set-admin-claim Netlify function keep
//                            working unchanged.
//   2. gameData/userDirectory — public-bounded {uid: {displayName, firstName?, lastName?}}.
//   3. userPrivate/{uid}   — per-user private doc (email, isAdmin,
//                            profileCompleted, lastLoginAt, createdAt,
//                            photoURL).
// These two arrays are the single source of truth for which destination
// each field belongs to. They MUST stay in sync with firestore.rules
// (userDirectoryEntryOk + userPrivateOwnerCreateOk).
export const DIRECTORY_FIELDS = ["displayName", "firstName", "lastName"];
export const USER_PRIVATE_FIELDS = [
  "id",
  "email",
  "isAdmin",
  "profileCompleted",
  "lastLoginAt",
  "createdAt",
  "photoURL",
];

// Pick the keys from `obj` that belong to `allowed`, dropping undefined.
export function pickKnown(obj: any, allowed: string[]) {
  const out: Record<string, any> = {};
  for (const k of allowed) {
    if (obj && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

import { CURRENT_USER_KEY } from "../constants/storageKeys";

const EMPTY_OBJ: Record<string, any> = {};

// ============ READ ACCESSORS ============

export function getUsers() {
  return cache.users || EMPTY_OBJ;
}

// PII migration Phase A: public-bounded directory of {uid: {displayName,
// firstName?, lastName?}}. Non-admin reads should prefer this over
// `getUsers()` so the legacy users doc can be tightened to admin-only.
export function getUserDirectory() {
  return cache.userDirectory || EMPTY_OBJ;
}

// Returns the current authenticated user's private record or null.
export function getUserPrivate(uid: string | null) {
  if (!uid) return null;
  return (cache.userPrivate || EMPTY_OBJ)[uid] || null;
}

// Whole map of {uid -> private record}. Used as the snapshot input for
// useSyncExternalStore so consumers re-render when the user's own private
// record changes (e.g. lastLoginAt updated, profileCompleted flipped).
export function getUserPrivateMap() {
  return cache.userPrivate || EMPTY_OBJ;
}

// Whether the userPrivate listener has fired at least once.
export function isUserPrivateReady() {
  return !!cache._ready.userPrivate;
}

// PII migration Phase B: cache.users is empty for non-admins (they get
// permission-denied on the legacy doc). Merge from userDirectory +
// userPrivate so own-user reads (Profile.tsx, getCurrentUser()) keep
// working. For other-user reads, only directory data is returned —
// non-admins never see another member's email / isAdmin / lastLoginAt
// because rules deny their userPrivate read.
export function getUser(userId: string | null) {
  if (!userId) return null;
  const fromUsers = (cache.users || EMPTY_OBJ)[userId];
  if (fromUsers) return fromUsers;
  const fromDirectory = (cache.userDirectory || EMPTY_OBJ)[userId] || null;
  const fromPrivate = (cache.userPrivate || EMPTY_OBJ)[userId] || null;
  if (!fromDirectory && !fromPrivate) return null;
  return { ...(fromDirectory || {}), ...(fromPrivate || {}) };
}

export function getCurrentUser() {
  try {
    const userId = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null");
    if (!userId) return null;
    return getUser(userId);
  } catch {
    return null;
  }
}

// Defense-in-depth: client-side admin guard (Firestore rules are the real security layer)
export function requireAdmin() {
  const u = getCurrentUser();
  if (!u?.isAdmin) {
    console.warn("Admin operation blocked: user is not admin");
    return false;
  }
  return true;
}

export function setCurrentUser(userId: string) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userId));
  notifyAndEmit("currentUser");
}

// ============ WRITE HELPERS ============

// Generic single-doc admin writer with the don't-shrink-shared-data safety
// guard. Used for users (legacy), matchResults, settings, actualBonuses,
// actualAdvancing. The shrink-block is users/matchResults specific (those
// are the high-cost docs an accidental clear could blow up).
export async function writeGameDoc(
  docName: string,
  data: any,
  { force = false }: { force?: boolean } = {},
) {
  if (!force && (docName === "users" || docName === "matchResults")) {
    const currentCount = Object.keys((cache as any)[docName] || {}).length;
    const newCount = Object.keys(data || {}).length;
    if (currentCount > 2 && newCount < currentCount * 0.5) {
      console.error(
        `[SAFETY] Blocked write to ${docName}: would shrink from ${currentCount} to ${newCount} entries.`,
      );
      writeAuditLog("blocked-dangerous-write", {
        docName,
        currentCount,
        newCount,
      });
      return false;
    }
  }
  if (docName === "users") {
    const currentCount = Object.keys((cache as any)[docName] || {}).length;
    const newCount = Object.keys(data || {}).length;
    writeAuditLog("users-bulk-write", { currentCount, newCount });
  }
  (cache as any)[docName] = data;
  notifyAndEmit(docName);
  emitSaving(docName);
  try {
    await withTimeout(
      setDoc(gameDocRef(docName), { data: safeClone(data) }),
      10000,
    );
    emitSaved(docName);
    return true;
  } catch (err: any) {
    console.error(`Failed to write ${docName}:`, err);
    emitWriteError(docName, err);
    captureClientError(err, { source: "writeGameDoc", docName, code: err?.code });
    await maybeRefreshToken(err);
    return false;
  }
}

// Update a user's record. Writes to legacy users + directory + userPrivate
// atomically via writeBatch. Caller passes whatever fields they want to
// change; this fans them out to the right destinations.
export async function updateUserField(uid: string, fields: Record<string, any>) {
  const dirFields = pickKnown(fields, DIRECTORY_FIELDS);
  const privFields = pickKnown(fields, USER_PRIVATE_FIELDS);

  // Optimistic cache updates.
  cache.users = {
    ...cache.users,
    [uid]: { ...cache.users[uid], ...fields },
  };
  if (Object.keys(dirFields).length > 0) {
    cache.userDirectory = {
      ...cache.userDirectory,
      [uid]: { ...cache.userDirectory[uid], ...dirFields },
    };
  }
  if (Object.keys(privFields).length > 0) {
    cache.userPrivate = {
      ...cache.userPrivate,
      [uid]: { ...cache.userPrivate[uid], ...privFields },
    };
  }
  notifyAndEmit("users");
  emitSaving("users");

  // Legacy users — dot-notation update.
  const legacyPayload: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    legacyPayload[`data.${uid}.${key}`] = value;
  }
  // Rebuilt per attempt (a committed WriteBatch can't be reused) so a
  // transient permission-denied on a freshly-minted token can be retried.
  const commitUserBatch = () => {
    const batch = writeBatch(db);
    batch.update(gameDocRef("users"), legacyPayload);
    // Directory — setDoc(merge:true) so first-ever write creates the doc.
    if (Object.keys(dirFields).length > 0) {
      batch.set(userDirectoryDocRef(), { data: { [uid]: dirFields } }, { merge: true });
    }
    // userPrivate/{uid} — setDoc(merge:true) for create-or-update.
    if (Object.keys(privFields).length > 0) {
      batch.set(userPrivateDocRef(uid), privFields, { merge: true });
    }
    return batch.commit();
  };

  try {
    await retryOnPermissionDenied(commitUserBatch);
    emitSaved("users");
    return true;
  } catch (err: any) {
    console.error(`Failed to update user ${uid}:`, err);
    emitWriteError("users", err);
    captureClientError(err, {
      source: "updateUserField",
      uid,
      fieldKeys: Object.keys(fields || {}),
      code: err?.code,
    });
    await maybeRefreshToken(err);
    return false;
  }
}

// Firestore document size limit is 1MB. Warn when approaching.
const MAX_USERS_WARNING = 1500;

// Create a new user record across all three locations atomically. Caller
// passes the full record; this splits the fields and dual-writes.
export async function createUserField(uid: string, userData: Record<string, any>) {
  const currentCount = Object.keys(cache.users).length;
  if (currentCount >= MAX_USERS_HARD_LIMIT) {
    console.error(
      `[SAFETY] Cannot create user: ${currentCount} users already at hard limit of ${MAX_USERS_HARD_LIMIT}`,
    );
    writeAuditLog("blocked-user-create", { currentCount, uid });
    return false;
  }
  if (currentCount >= MAX_USERS_WARNING) {
    console.warn(
      `[WARNING] User count (${currentCount}) approaching Firestore 1MB document limit.`,
    );
  }

  const dirFields = pickKnown(userData, DIRECTORY_FIELDS);
  const privFields = pickKnown(userData, USER_PRIVATE_FIELDS);

  // Optimistic cache updates.
  cache.users = { ...cache.users, [uid]: userData };
  cache.userDirectory = { ...cache.userDirectory, [uid]: dirFields };
  cache.userPrivate = { ...cache.userPrivate, [uid]: privFields };
  notifyAndEmit("users");
  emitSaving("users");
  writeAuditLog("user-create", {
    targetUser: uid,
    userCountAfter: Object.keys(cache.users).length,
  });

  // setDoc(merge:true) on the legacy users doc handles both first-user-ever
  // (doc not yet created) and subsequent additions without try/catch
  // fallbacks, and keeps the whole operation atomic under writeBatch.
  // Rebuilt per attempt — a committed WriteBatch can't be reused, and
  // retryOnPermissionDenied re-invokes this on a transient first-sign-in
  // permission-denied (token not yet propagated to the Firestore backend).
  const commitUserBatch = () => {
    const batch = writeBatch(db);
    batch.set(gameDocRef("users"), { data: { [uid]: userData } }, { merge: true });
    batch.set(userDirectoryDocRef(), { data: { [uid]: dirFields } }, { merge: true });
    batch.set(userPrivateDocRef(uid), privFields, { merge: true });
    return batch.commit();
  };

  try {
    await retryOnPermissionDenied(commitUserBatch);
    emitSaved("users");
    return true;
  } catch (err: any) {
    console.error(`Failed to create user ${uid}:`, err);
    emitWriteError("users", err);
    captureClientError(err, {
      source: "createUserField",
      uid,
      code: err?.code,
    });
    await maybeRefreshToken(err);
    return false;
  }
}

// Remove a user from all three locations atomically. Admin-only path
// (deleteUser is gated by requireAdmin); rules permit admin deletes on
// userPrivate.
export async function removeUserField(uid: string) {
  const newUsers = { ...cache.users };
  delete newUsers[uid];
  cache.users = newUsers;
  const newDir = { ...cache.userDirectory };
  delete newDir[uid];
  cache.userDirectory = newDir;
  const newPriv = { ...cache.userPrivate };
  delete newPriv[uid];
  cache.userPrivate = newPriv;
  notifyAndEmit("users");
  emitSaving("users");

  const batch = writeBatch(db);
  batch.update(gameDocRef("users"), { [`data.${uid}`]: deleteField() });
  batch.update(userDirectoryDocRef(), { [`data.${uid}`]: deleteField() });
  batch.delete(userPrivateDocRef(uid));

  try {
    await withTimeout(batch.commit(), 10000);
    emitSaved("users");
    return true;
  } catch (err: any) {
    console.error(`Failed to remove user ${uid}:`, err);
    emitWriteError("users", err);
    captureClientError(err, { source: "removeUserField", uid, code: err?.code });
    return false;
  }
}

// ============ ENSURE USER IN STORE ============
//
// Login bootstrap. Idempotent + bounded retry + single-flight guard so
// parallel render cycles don't double-write the same uid.

let lastEnsuredUid: string | null = null;
const ensureRetryCount = new Map<string, number>();
const MAX_ENSURE_RETRIES = 3;
let ensureInFlight: Promise<string> | null = null;

export async function ensureUserInStore(uid: string, displayName: string, email: string | null) {
  if (!cache._ready.users) return uid;
  if (lastEnsuredUid === uid && getUsers()[uid]) return uid;
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = doEnsureUserInStore(uid, displayName, email).finally(() => {
    ensureInFlight = null;
  });
  return ensureInFlight;
}

async function doEnsureUserInStore(uid: string, displayName: string, email: string | null) {
  const existing = getUsers()[uid];
  if (existing) {
    // Do NOT overwrite displayName on subsequent logins — the user's custom
    // nickname (set via Profile / ProfileSetup) would be clobbered each time
    // by the Google name or phone number coming from Firebase Auth.
    const needsUpdate = email && !existing.email;
    if (!needsUpdate) {
      lastEnsuredUid = uid;
      return uid;
    }
    const fields = { email };
    const ok = await updateUserField(uid, fields);
    if (ok) lastEnsuredUid = uid;
    return uid;
  }

  // Bounded retry — avoid infinite loop on a permanent rule violation.
  const attempts = ensureRetryCount.get(uid) || 0;
  if (attempts >= MAX_ENSURE_RETRIES) {
    captureClientMessage("ensure-user-retry-exhausted", {
      uid,
      attempts,
      userCount: Object.keys(cache.users || {}).length,
    });
    return uid;
  }
  ensureRetryCount.set(uid, attempts + 1);

  // User not in cache. Two possibilities:
  //   A) Cache desync — user exists in Firestore. Per-field update preserves
  //      isAdmin/firstName/lastName/etc.
  //   B) Genuinely new user (or recreated after admin clearAllData) — not in
  //      Firestore. A per-field update would be REJECTED by Firestore rules:
  //      new entries require `isAdmin == false` in the resulting document.
  //      Without that, the SDK reverts the optimistic cache and the user
  //      vanishes — App.tsx then renders an infinite Loading screen because
  //      user becomes null.
  // Disambiguate via userPrivate/{uid} (owner-readable per firestore.rules
  // — works for admins AND non-admins). Reading the legacy gameData/users
  // doc here used to 403 every non-admin post-Phase B (admin-only read), so
  // a non-admin login after clearAllData wiped their record fell straight
  // into the catch and bailed without writing — the bouncing-ball trap.
  let firestoreUser: any = null;
  try {
    const snap = await retryOnPermissionDenied(() => getDoc(userPrivateDocRef(uid)));
    if (snap.exists()) firestoreUser = snap.data() as any;
  } catch (err: any) {
    console.error("Failed to verify user in Firestore:", err);
    captureClientError(err, {
      source: "ensureUserInStore.getDoc",
      uid,
      code: err?.code,
    });
    await maybeRefreshToken(err);
    return uid;
  }

  const now = new Date().toISOString();
  let ok;
  if (firestoreUser) {
    // Case A: per-field update preserves existing fields.
    const fields: Record<string, any> = { id: uid, lastLoginAt: now };
    if (email && !firestoreUser.email) fields.email = email;
    cache.users = { ...cache.users, [uid]: { ...firestoreUser, ...fields } };
    notifyAndEmit("users");
    ok = await updateUserField(uid, fields);
  } else {
    // Case B: write full record so isAdmin: false satisfies the create-rule.
    ok = await createUserField(uid, {
      id: uid,
      displayName: displayName || "משתמש",
      isAdmin: false,
      email: email || null,
      profileCompleted: false,
      createdAt: now,
      lastLoginAt: now,
    });
  }
  if (ok) {
    lastEnsuredUid = uid;
    ensureRetryCount.delete(uid);
  }
  return uid;
}

// Resets the per-uid bootstrap counters. logoutUser calls this so a
// re-login on the same browser starts from a clean retry budget.
export function resetEnsureUserState() {
  lastEnsuredUid = null;
  ensureRetryCount.clear();
}

// Sentry's listener-error path uses this to detect a "user vanished"
// race (we wrote the optimistic cache, the SDK reverted on a rule
// rejection, lastEnsuredUid is stale).
export function getLastEnsuredUid() {
  return lastEnsuredUid;
}
export function clearLastEnsuredUid() {
  lastEnsuredUid = null;
}

// ============ PROFILE / ADMIN MUTATION ============

export function updateUser(userId: string, fields: Record<string, any>) {
  if (!getUsers()[userId]) return;
  updateUserField(userId, fields);
}

export async function updateUserProfile(uid: string, profileFields: Record<string, any>) {
  if (!getUsers()[uid]) return false;
  const { firstName, lastName, displayName, profileCompleted } = profileFields;
  const fields: Record<string, any> = {};
  if (firstName !== undefined) fields.firstName = firstName;
  if (lastName !== undefined) fields.lastName = lastName;
  if (displayName !== undefined) fields.displayName = displayName;
  if (profileCompleted !== undefined) fields.profileCompleted = profileCompleted;
  if (Object.keys(fields).length === 0) return true;
  return await updateUserField(uid, fields);
}

export function touchUserLogin(uid: string) {
  if (!getUsers()[uid]) return;
  updateUserField(uid, { lastLoginAt: new Date().toISOString() });
}

export function demoteAdmin(userId: string) {
  const users = getUsers();
  if (!users[userId] || !users[userId].isAdmin) return;
  const adminCount = Object.values(users).filter((u: any) => u.isAdmin).length;
  if (adminCount <= 1) return;
  updateUserField(userId, { isAdmin: false });
}

/**
 * Set admin custom claim via server-side Netlify function.
 * This sets Firebase Custom Claims (tamper-proof) and updates Firestore.
 * Returns { success, error } object.
 */
export async function setAdminClaim(targetUid: string, action: "promote" | "demote") {
  if (!requireAdmin()) return { error: "Not admin" };
  try {
    const { auth: firebaseAuth } = await import("../firebase");
    const idToken = await firebaseAuth.currentUser?.getIdToken();
    if (!idToken) return { error: "Not authenticated" };

    const res = await fetch("/.netlify/functions/set-admin-claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ targetUid, action }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return { error: data?.error || `Error ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    console.error("setAdminClaim error:", err);
    return { error: err.message };
  }
}

export async function deleteUser(userId: string) {
  if (!requireAdmin()) return;
  const userCountBefore = Object.keys(getUsers()).length;

  // Find user's forms to delete
  const formsToDelete = Object.keys(cache.predictions).filter(
    (fid) => (cache.predictions[fid] as any)?.userId === userId,
  );

  // Update local cache (legacy + directory + private + predictions)
  const newUsers = { ...cache.users };
  delete newUsers[userId];
  cache.users = newUsers;
  const newDir = { ...cache.userDirectory };
  delete newDir[userId];
  cache.userDirectory = newDir;
  const newPriv = { ...cache.userPrivate };
  delete newPriv[userId];
  cache.userPrivate = newPriv;
  for (const fid of formsToDelete) {
    delete cache.predictions[fid];
  }
  cache.predictions = { ...cache.predictions };
  notifyAllListeners();

  writeAuditLog("user-delete", {
    targetUser: userId,
    userCountBefore,
    userCountAfter: Object.keys(newUsers).length,
    formsDeleted: formsToDelete.length,
  });

  // Single batch: remove user from all three locations + delete form docs.
  // PII migration Phase A: dual-delete keeps the directory + userPrivate
  // in sync with the legacy users doc.
  const batch = writeBatch(db);
  batch.update(gameDocRef("users"), { [`data.${userId}`]: deleteField() });
  batch.update(userDirectoryDocRef(), { [`data.${userId}`]: deleteField() });
  batch.delete(userPrivateDocRef(userId));
  for (const fid of formsToDelete) {
    batch.delete(formDocRef(fid));
  }
  await batch.commit();
}
