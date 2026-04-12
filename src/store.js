import { db } from "./firebase";
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

// ============ AUDIT LOG ============
const AUDIT_LOG_KEY = "wc2026_audit_log";
let auditLog;
try {
  auditLog = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || "[]");
} catch {
  auditLog = [];
}

export function logAdminAction(action, details = {}) {
  const entry = {
    action,
    ...details,
    userId: getCurrentUser()?.id || "unknown",
    timestamp: new Date().toISOString(),
  };
  auditLog.unshift(entry);
  if (auditLog.length > 200) auditLog.length = 200;
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(auditLog));
}

function writeAuditLog(action, details = {}) {
  const entry = {
    action,
    ...details,
    userId: getCurrentUser()?.id || "unknown",
    timestamp: new Date().toISOString(),
  };
  // Keep local log
  logAdminAction(action, details);
  // Also write to Firestore
  const auditRef = doc(
    db,
    "auditLog",
    `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  setDoc(auditRef, entry).catch((err) =>
    console.error("Audit log write failed:", err),
  );
}

export function getAuditLog() {
  return auditLog;
}

// ============ DOCUMENT STRUCTURE ============
// gameData/{users, matchResults, actualAdvancing, actualBonuses, settings} — single docs
// predictions/{formId} — one document per form (NEW)

const DOCS = {
  users: "users",
  matchResults: "matchResults",
  actualAdvancing: "actualAdvancing",
  actualBonuses: "actualBonuses",
  settings: "settings",
};

const CURRENT_USER_KEY = "wc2026_currentUser";
const ACTIVE_FORM_KEY = "wc2026_activeForm";

const cache = {
  users: {},
  predictions: {}, // formId -> formData (assembled from individual docs)
  matchResults: {},
  actualAdvancing: {},
  actualBonuses: { champion: null, topScorers: [] },
  settings: { predictionsLocked: false },
  _ready: {},
};

// ============ FIRESTORE HELPERS ============

const BATCH_LIMIT = 400; // Firestore limit is 500, use 400 for safety margin

// Splits operations across multiple batches when exceeding Firestore's 500 op limit
export async function commitInBatches(operations) {
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const chunk = operations.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === "set") batch.set(op.ref, op.data);
      else if (op.type === "update") batch.update(op.ref, op.data);
      else if (op.type === "delete") batch.delete(op.ref);
    }
    await batch.commit();
  }
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

// Lightweight clone using JSON parse/stringify — faster than structuredClone for plain data
function safeClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return structuredClone(obj);
  }
}

function gameDocRef(docName) {
  return doc(db, "gameData", docName);
}

function formDocRef(formId) {
  return doc(db, "predictions", formId);
}

const predictionsCollectionRef = collection(db, "predictions");

async function writeGameDoc(docName, data) {
  // Safety guard: block writes that would dramatically shrink shared data
  if (docName === "users" || docName === "matchResults") {
    const currentCount = Object.keys(cache[docName] || {}).length;
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
    const currentCount = Object.keys(cache[docName] || {}).length;
    const newCount = Object.keys(data || {}).length;
    writeAuditLog("users-bulk-write", { currentCount, newCount });
  }
  cache[docName] = data;
  notifyAndEmit(docName);
  emitSaving(docName);
  try {
    await withTimeout(
      setDoc(gameDocRef(docName), { data: safeClone(data) }),
      10000,
    );
    emitSaved(docName);
    return true;
  } catch (err) {
    console.error(`Failed to write ${docName}:`, err);
    emitWriteError(docName, err);
    return false;
  }
}

// Safe single-user field update via dot-notation (no full-doc overwrite)
async function updateUserField(uid, fields) {
  const updatePayload = {};
  for (const [key, value] of Object.entries(fields)) {
    updatePayload[`data.${uid}.${key}`] = value;
  }
  cache.users = {
    ...cache.users,
    [uid]: { ...cache.users[uid], ...fields },
  };
  notifyAndEmit("users");
  emitSaving("users");
  try {
    await withTimeout(updateDoc(gameDocRef("users"), updatePayload), 10000);
    emitSaved("users");
    return true;
  } catch (err) {
    console.error(`Failed to update user ${uid}:`, err);
    emitWriteError("users", err);
    return false;
  }
}

// Firestore document size limit is 1MB. Warn when approaching.
const MAX_USERS_WARNING = 1500;
const MAX_USERS_HARD_LIMIT = 2000;

// Safe new-user creation via dot-notation (no full-doc overwrite)
async function createUserField(uid, userData) {
  const currentCount = Object.keys(cache.users).length;
  if (currentCount >= MAX_USERS_HARD_LIMIT) {
    console.error(`[SAFETY] Cannot create user: ${currentCount} users already at hard limit of ${MAX_USERS_HARD_LIMIT}`);
    writeAuditLog("blocked-user-create", { currentCount, uid });
    return false;
  }
  if (currentCount >= MAX_USERS_WARNING) {
    console.warn(`[WARNING] User count (${currentCount}) approaching Firestore 1MB document limit.`);
  }
  const updatePayload = { [`data.${uid}`]: userData };
  cache.users = { ...cache.users, [uid]: userData };
  notifyAndEmit("users");
  emitSaving("users");
  writeAuditLog("user-create", {
    targetUser: uid,
    userCountAfter: Object.keys(cache.users).length,
  });
  try {
    await withTimeout(updateDoc(gameDocRef("users"), updatePayload), 10000);
    emitSaved("users");
    return true;
  } catch (err) {
    if (err.code === "not-found") {
      // Document doesn't exist yet (first user ever) — create it
      await withTimeout(
        setDoc(gameDocRef("users"), { data: { [uid]: userData } }),
        10000,
      );
      emitSaved("users");
      return true;
    }
    console.error(`Failed to create user ${uid}:`, err);
    emitWriteError("users", err);
    return false;
  }
}

// Safe user removal via deleteField (no full-doc overwrite)
async function removeUserField(uid) {
  const updatePayload = { [`data.${uid}`]: deleteField() };
  const newUsers = { ...cache.users };
  delete newUsers[uid];
  cache.users = newUsers;
  notifyAndEmit("users");
  emitSaving("users");
  try {
    await withTimeout(updateDoc(gameDocRef("users"), updatePayload), 10000);
    emitSaved("users");
    return true;
  } catch (err) {
    console.error(`Failed to remove user ${uid}:`, err);
    emitWriteError("users", err);
    return false;
  }
}

async function writeFormDoc(formId, formData) {
  cache.predictions = { ...cache.predictions, [formId]: formData };
  notifyAndEmit("predictions");
  emitSaving("predictions");
  try {
    await withTimeout(
      setDoc(formDocRef(formId), safeClone(formData)),
      10000,
    );
    emitSaved("predictions");
    return true;
  } catch (err) {
    console.error(`Failed to write form ${formId}:`, err);
    emitWriteError("predictions", err);
    return false;
  }
}

const pendingWrites = {};

function debouncedWriteForm(formId, formData, delay = 500) {
  cache.predictions = { ...cache.predictions, [formId]: formData };
  notifyAndEmit("predictions");
  emitSaving("predictions");
  const key = `form:${formId}`;
  clearTimeout(pendingWrites[key]);
  pendingWrites[key] = setTimeout(() => {
    if (cache.settings?.predictionsLocked) {
      delete pendingWrites[key];
      return;
    }
    delete pendingWrites[key];
    setDoc(formDocRef(formId), safeClone(formData))
      .then(() => emitSaved("predictions"))
      .catch((err) => {
        console.error(`Failed to write form ${formId}:`, err);
        emitWriteError("predictions", err);
      });
  }, delay);
}

export function clearPendingWritesForForm(formId) {
  const key = `form:${formId}`;
  if (pendingWrites[key]) {
    clearTimeout(pendingWrites[key]);
    delete pendingWrites[key];
  }
}

function flushPendingWrites() {
  for (const key of Object.keys(pendingWrites)) {
    clearTimeout(pendingWrites[key]);
    delete pendingWrites[key];
    try {
      if (key.startsWith("form:")) {
        const formId = key.slice(5);
        const data = safeClone(cache.predictions[formId]);
        if (data) {
          setDoc(formDocRef(formId), data).catch((err) =>
            console.error(`Failed to flush ${key}:`, err),
          );
        }
      }
    } catch (err) {
      console.error(`Failed to clone for flush ${key}:`, err);
    }
  }
}

function notifyAndEmit(key) {
  window.dispatchEvent(new CustomEvent("store-updated", { detail: { key } }));
}
function emitSaving(key) {
  window.dispatchEvent(new CustomEvent("store-saving", { detail: { key } }));
}
function emitSaved(key) {
  window.dispatchEvent(new CustomEvent("store-saved", { detail: { key } }));
}
function emitWriteError(key, error) {
  window.dispatchEvent(
    new CustomEvent("store-write-error", {
      detail: { key, error: error?.message || String(error) },
    }),
  );
}

export function hasPendingWrites() {
  return Object.keys(pendingWrites).length > 0;
}

// ============ REALTIME LISTENERS ============

let listenersInitialized = false;
let listenersHadError = false;
let windowListenersAttached = false;
let currentListenerUserId = null;
let predictionsUnsub = null;
let predictionsShowAll = false;
let gameDocUnsubs = [];
let predictionsListenerGeneration = 0;
let retryCount = 0;
let retryInProgress = false;

function setupPredictionsListener(userId, showAll) {
  if (predictionsUnsub) predictionsUnsub();
  predictionsShowAll = showAll;
  const myGeneration = ++predictionsListenerGeneration;

  const q = showAll
    ? predictionsCollectionRef
    : query(predictionsCollectionRef, where("userId", "==", userId));

  predictionsUnsub = onSnapshot(
    q,
    (snapshot) => {
      if (myGeneration !== predictionsListenerGeneration) return;
      retryCount = 0;
      if (showAll) {
        // Full collection: replace entire cache
        const preds = {};
        snapshot.forEach((docSnap) => {
          preds[docSnap.id] = docSnap.data();
        });
        cache.predictions = preds;
      } else {
        // Filtered: merge own forms into cache (keep any previously loaded data)
        const preds = { ...cache.predictions };
        // Remove old entries for this user (in case a form was deleted)
        for (const key of Object.keys(preds)) {
          if (preds[key]?.userId === userId) delete preds[key];
        }
        snapshot.forEach((docSnap) => {
          preds[docSnap.id] = docSnap.data();
        });
        cache.predictions = preds;
      }
      cache._ready.predictions = true;
      rebuildUserFormIndex();
      notifyAndEmit("predictions");
    },
    (err) => {
      console.error("Listener error for predictions:", err);
      listenersHadError = true;
      notifyAndEmit("predictions");
      if (retryInProgress) return;
      if (retryCount < 3 && currentListenerUserId) {
        retryCount++;
        retryInProgress = true;
        setTimeout(() => {
          retryInProgress = false;
          initRealtimeListeners(currentListenerUserId);
        }, 5000);
      }
    },
  );
}

let upgradeTimer = null;
function maybeUpgradePredictionsListener() {
  if (predictionsShowAll || !currentListenerUserId) return;
  // Debounce: settings and users may fire in quick succession
  clearTimeout(upgradeTimer);
  upgradeTimer = setTimeout(() => {
    if (predictionsShowAll || !currentListenerUserId) return;
    const isUserAdmin = cache.users?.[currentListenerUserId]?.isAdmin === true;
    const isLocked = cache.settings?.predictionsLocked === true;
    if (isUserAdmin || isLocked) {
      setupPredictionsListener(currentListenerUserId, true);
    }
  }, 100);
}

export function initRealtimeListeners(userId) {
  // Only restart if first time or if previous attempt had errors
  if (listenersInitialized && !listenersHadError) return;
  listenersInitialized = true;
  listenersHadError = false;
  currentListenerUserId = userId;

  if (!windowListenersAttached) {
    windowListenersAttached = true;
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushPendingWrites();
    });
    window.addEventListener("pagehide", flushPendingWrites);
  }

  // Unsubscribe all existing gameDoc listeners before creating new ones
  gameDocUnsubs.forEach((u) => u());
  gameDocUnsubs = [];

  // Listen to gameData single documents
  for (const [key, docName] of Object.entries(DOCS)) {
    gameDocUnsubs.push(
      onSnapshot(
        gameDocRef(docName),
        (snap) => {
          retryCount = 0;
          if (snap.exists()) cache[key] = snap.data().data;
          cache._ready[key] = true;
          notifyAndEmit(key);
          // When settings or users load, check if we should upgrade to all predictions
          if (key === "settings" || key === "users") {
            maybeUpgradePredictionsListener();
          }
        },
        (err) => {
          console.error(`Listener error for ${docName}:`, err);
          listenersHadError = true;
          notifyAndEmit(key);
          if (retryInProgress) return;
          if (retryCount < 3 && currentListenerUserId) {
            retryCount++;
            retryInProgress = true;
            setTimeout(() => {
              retryInProgress = false;
              initRealtimeListeners(currentListenerUserId);
            }, 5000);
          }
        },
      ),
    );
  }

  // Start with filtered predictions (own forms only)
  setupPredictionsListener(userId, false);
}

export function isStoreReady() {
  return (
    Object.keys(DOCS).every((k) => cache._ready[k]) && cache._ready.predictions
  );
}

// ============ SUBSCRIPTIONS ============

const listeners = new Set();
const keyedListeners = new Map(); // key -> Set<listener>

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Subscribe only to changes for a specific key (e.g., "predictions", "users")
export function subscribeToKey(key, listener) {
  if (!keyedListeners.has(key)) keyedListeners.set(key, new Set());
  keyedListeners.get(key).add(listener);
  return () => {
    const set = keyedListeners.get(key);
    if (set) { set.delete(listener); if (set.size === 0) keyedListeners.delete(key); }
  };
}

function notifyListeners(event) {
  for (const listener of listeners) listener();
  // Also notify keyed listeners
  const key = event?.detail?.key;
  if (key && keyedListeners.has(key)) {
    for (const listener of keyedListeners.get(key)) listener();
  }
}

window.addEventListener("store-updated", notifyListeners);

// ============ USERS ============

const EMPTY_OBJ = {};
const DEFAULT_BONUSES = { champion: null, topScorers: [] };
const DEFAULT_SETTINGS = { predictionsLocked: false };

export function getUsers() {
  return cache.users || EMPTY_OBJ;
}

let lastEnsuredUid = null;

export function ensureUserInStore(uid, displayName, email) {
  if (!cache._ready.users) return uid;
  // Prevent repeated writes for the same user in the same session
  if (lastEnsuredUid === uid && getUsers()[uid]) return uid;
  lastEnsuredUid = uid;

  const existing = getUsers()[uid];
  if (existing) {
    const needsUpdate =
      (displayName && existing.displayName !== displayName) ||
      (email && !existing.email);
    if (!needsUpdate) return uid;
    const fields = {};
    if (displayName && existing.displayName !== displayName)
      fields.displayName = displayName;
    if (email && !existing.email) fields.email = email;
    updateUserField(uid, fields);
    return uid;
  }
  const now = new Date().toISOString();
  createUserField(uid, {
    id: uid,
    displayName: displayName || "משתמש",
    isAdmin: false,
    email: email || null,
    profileCompleted: false,
    createdAt: now,
    lastLoginAt: now,
  });
  return uid;
}

export function updateUser(userId, fields) {
  if (!getUsers()[userId]) return;
  updateUserField(userId, fields);
}

export function updateUserProfile(uid, profileFields) {
  if (!getUsers()[uid]) return;
  const { firstName, lastName, displayName, profileCompleted } = profileFields;
  const fields = {};
  if (firstName !== undefined) fields.firstName = firstName;
  if (lastName !== undefined) fields.lastName = lastName;
  if (displayName !== undefined) fields.displayName = displayName;
  if (profileCompleted !== undefined)
    fields.profileCompleted = profileCompleted;
  if (Object.keys(fields).length > 0) {
    updateUserField(uid, fields);
  }
}

export function touchUserLogin(uid) {
  if (!getUsers()[uid]) return;
  updateUserField(uid, { lastLoginAt: new Date().toISOString() });
}

export function demoteAdmin(userId) {
  const users = getUsers();
  if (!users[userId] || !users[userId].isAdmin) return;
  const adminCount = Object.values(users).filter((u) => u.isAdmin).length;
  if (adminCount <= 1) return;
  updateUserField(userId, { isAdmin: false });
}

export async function deleteUser(userId) {
  const userCountBefore = Object.keys(getUsers()).length;

  // Find user's forms to delete
  const formsToDelete = Object.keys(cache.predictions).filter(
    (fid) => cache.predictions[fid]?.userId === userId,
  );

  // Update local cache
  const newUsers = { ...cache.users };
  delete newUsers[userId];
  cache.users = newUsers;
  for (const fid of formsToDelete) {
    delete cache.predictions[fid];
  }
  cache.predictions = { ...cache.predictions };
  notifyListeners();

  writeAuditLog("user-delete", {
    targetUser: userId,
    userCountBefore,
    userCountAfter: Object.keys(newUsers).length,
    formsDeleted: formsToDelete.length,
  });

  // Use batch: remove user field + delete form docs
  const batch = writeBatch(db);
  batch.update(gameDocRef("users"), { [`data.${userId}`]: deleteField() });
  for (const fid of formsToDelete) {
    batch.delete(formDocRef(fid));
  }
  await batch.commit();
}

export function getUser(userId) {
  const users = getUsers();
  return users[userId] || null;
}

export function getCurrentUser() {
  try {
    const userId = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
    if (!userId) return null;
    return getUser(userId);
  } catch {
    return null;
  }
}

export function setCurrentUser(userId) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userId));
  notifyAndEmit("currentUser");
}

export function logoutUser() {
  flushPendingWrites();
  lastEnsuredUid = null;
  listenersInitialized = false;
  listenersHadError = false;
  if (predictionsUnsub) {
    predictionsUnsub();
    predictionsUnsub = null;
  }
  gameDocUnsubs.forEach((u) => u());
  gameDocUnsubs = [];
  currentListenerUserId = null;
  // Reset cache to prevent stale data after re-login
  cache.users = {};
  cache.predictions = {};
  cache.matchResults = {};
  cache.actualAdvancing = {};
  cache.actualBonuses = { champion: null, topScorers: [] };
  cache.settings = { predictionsLocked: false };
  cache._ready = {};
  rebuildUserFormIndex();
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  notifyAndEmit("currentUser");
}

// ============ ACTIVE FORM (local per-browser) ============

export function getActiveFormId() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_FORM_KEY)) || null;
  } catch {
    return null;
  }
}

export function setActiveFormId(formId) {
  localStorage.setItem(ACTIVE_FORM_KEY, JSON.stringify(formId));
  notifyAndEmit("activeForm");
}

// ============ PREDICTIONS (PER-FORM DOCUMENTS) ============

// userId -> Set<formId> index for O(1) user form lookup
const userFormIndex = {};

function rebuildUserFormIndex() {
  for (const key of Object.keys(userFormIndex)) delete userFormIndex[key];
  for (const [formId, data] of Object.entries(cache.predictions || {})) {
    const uid = data.userId;
    if (uid) {
      if (!userFormIndex[uid]) userFormIndex[uid] = new Set();
      userFormIndex[uid].add(formId);
    }
  }
}

function indexAddForm(formId, userId) {
  if (!userId) return;
  if (!userFormIndex[userId]) userFormIndex[userId] = new Set();
  userFormIndex[userId].add(formId);
}

function indexRemoveForm(formId, userId) {
  if (!userId || !userFormIndex[userId]) return;
  userFormIndex[userId].delete(formId);
  if (userFormIndex[userId].size === 0) delete userFormIndex[userId];
}

export function getAllPredictions() {
  return cache.predictions || EMPTY_OBJ;
}

const DEFAULT_FORM = {
  matches: {},
  advancing: {},
  champion: null,
  topScorer: "",
  status: "draft",
};

export function getFormsForUser(userId) {
  const all = getAllPredictions();
  const formIds = userFormIndex[userId];
  if (!formIds || formIds.size === 0) return [];
  const forms = [];
  for (const formId of formIds) {
    const data = all[formId];
    if (data) forms.push({ formId, ...data });
  }
  forms.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return forms;
}

export function getForm(formId) {
  const all = getAllPredictions();
  return all[formId] || null;
}

const MAX_FORMS_PER_USER = 10;

export function createForm(userId, formName) {
  const userForms = getFormsForUser(userId);
  if (userForms.length >= MAX_FORMS_PER_USER) {
    throw new Error(`מקסימום ${MAX_FORMS_PER_USER} טפסים למשתמש`);
  }
  const formId = `${userId}__${Date.now()}`;
  const displayIndex = userForms.length + 1;

  const formData = {
    userId,
    formName: formName || `טופס ${displayIndex}`,
    budgetNumber: "",
    ...DEFAULT_FORM,
    createdAt: new Date().toISOString(),
  };
  indexAddForm(formId, userId);
  writeFormDoc(formId, formData);
  setActiveFormId(formId);
  return formId;
}

export async function deleteForm(formId) {
  const form = getForm(formId);
  if (!form || (form.status !== "draft" && form.status !== "pending")) return;

  indexRemoveForm(formId, form.userId);
  const newPreds = { ...cache.predictions };
  delete newPreds[formId];
  cache.predictions = newPreds;
  notifyAndEmit("predictions");

  await deleteDoc(formDocRef(formId));

  if (getActiveFormId() === formId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    notifyAndEmit("activeForm");
  }
}

export function updateFormDetails(formId, fields) {
  const form = getForm(formId);
  if (!form) return;
  const updated = { ...form, ...fields };
  debouncedWriteForm(formId, updated);
}

export function savePrediction(formId, matchId, prediction) {
  if (getSettings().predictionsLocked) return;
  const form = getForm(formId);
  if (!form || form.status !== "draft") return;
  const updated = {
    ...form,
    matches: { ...form.matches, [matchId]: prediction },
    updatedAt: new Date().toISOString(),
  };
  debouncedWriteForm(formId, updated);
}

export function savePredictionsBatch(formId, matchPredictions) {
  if (getSettings().predictionsLocked) return;
  const form = getForm(formId);
  if (!form || form.status !== "draft") return;
  const updated = {
    ...form,
    matches: { ...form.matches, ...matchPredictions },
    updatedAt: new Date().toISOString(),
  };
  // Use writeFormDoc (not debounced) for immediate batch write
  writeFormDoc(formId, updated);
}

export function saveBonusPrediction(formId, field, value) {
  if (getSettings().predictionsLocked) return;
  const form = getForm(formId);
  if (!form || form.status !== "draft") return;
  const updated = {
    ...form,
    [field]: value,
    updatedAt: new Date().toISOString(),
  };
  debouncedWriteForm(formId, updated);
}

export function submitPredictions(formId) {
  if (getSettings().predictionsLocked) return;
  flushPendingWrites();
  const form = getForm(formId);
  if (!form) return;
  const updated = {
    ...form,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };
  writeFormDoc(formId, updated);
}

export function adminApprovePrediction(formId) {
  writeAuditLog("approve-form", { formId });
  const form = getForm(formId);
  if (!form || form.status !== "pending") return;
  writeFormDoc(formId, {
    ...form,
    status: "submitted",
    approvedAt: new Date().toISOString(),
  });
}

export function reopenForm(formId) {
  if (getSettings().predictionsLocked) return;
  const form = getForm(formId);
  if (!form) return;
  const updated = {
    ...form,
    status: "draft",
    reopenedAt: new Date().toISOString(),
  };
  writeFormDoc(formId, updated);
}

export function adminForceSubmitForm(formId) {
  writeAuditLog("force-submit", { formId });
  flushPendingWrites();
  const form = getForm(formId);
  if (!form) return;
  const now = new Date().toISOString();
  writeFormDoc(formId, {
    ...form,
    status: "submitted",
    submittedAt: now,
    adminSubmittedAt: now,
  });
}

export function adminReopenForm(formId) {
  writeAuditLog("reopen-form", { formId });
  flushPendingWrites();
  const form = getForm(formId);
  if (!form) return;
  const now = new Date().toISOString();
  writeFormDoc(formId, {
    ...form,
    status: "draft",
    reopenedAt: now,
    adminReopenedAt: now,
  });
}

export async function adminDeleteForm(formId) {
  writeAuditLog("delete-form", { formId });
  flushPendingWrites();
  await deleteDoc(formDocRef(formId));
  // Only update cache after successful delete
  const newPreds = { ...cache.predictions };
  delete newPreds[formId];
  cache.predictions = newPreds;
  notifyAndEmit("predictions");
  if (getActiveFormId() === formId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    notifyAndEmit("activeForm");
  }
}

export function adminUpdateForm(formId, fields) {
  flushPendingWrites();
  const form = getForm(formId);
  if (!form) return;
  const updated = {
    ...form,
    ...fields,
    updatedAt: new Date().toISOString(),
  };
  if (fields.adminNote != null) {
    updated.adminEditedAt = new Date().toISOString();
  }
  writeFormDoc(formId, updated);
}

export function adminSaveMatchPrediction(formId, matchId, prediction) {
  flushPendingWrites();
  const form = getForm(formId);
  if (!form) return;
  writeFormDoc(formId, {
    ...form,
    matches: { ...form.matches, [matchId]: prediction },
    updatedAt: new Date().toISOString(),
  });
}

// ============ MATCH RESULTS (admin) ============

export function clearMatchResults() {
  writeAuditLog("clear-match-results");
  writeGameDoc("matchResults", {});
}

export function getMatchResults() {
  return cache.matchResults || EMPTY_OBJ;
}

export function saveMatchResult(matchId, result) {
  const results = { ...getMatchResults() };
  results[matchId] = { ...result, updatedAt: new Date().toISOString() };
  writeGameDoc("matchResults", results);
}

export function deleteMatchResult(matchId) {
  const results = { ...getMatchResults() };
  delete results[matchId];
  writeGameDoc("matchResults", results);
}

// ============ ACTUAL BONUSES (admin) ============

export function getActualBonuses() {
  return cache.actualBonuses || DEFAULT_BONUSES;
}

export function saveActualBonuses(bonuses) {
  writeGameDoc("actualBonuses", bonuses);
}

// ============ SETTINGS ============

export function getSettings() {
  return cache.settings || DEFAULT_SETTINGS;
}

export function updateSettings(newSettings) {
  const settings = { ...getSettings(), ...newSettings };
  writeGameDoc("settings", settings);
}

// ============ DATA EXPORT/IMPORT ============

export function exportAllData() {
  return {
    users: getUsers(),
    predictions: getAllPredictions(),
    matchResults: getMatchResults(),
    actualAdvancing: cache.actualAdvancing || {},
    actualBonuses: getActualBonuses(),
    settings: getSettings(),
    exportedAt: new Date().toISOString(),
  };
}

export async function clearAllData() {
  writeAuditLog("clear-all-data");

  // Delete all form documents using batched operations
  const snapshot = await getDocs(predictionsCollectionRef);
  const ops = [];
  snapshot.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  ops.push({ type: "set", ref: gameDocRef("users"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("matchResults"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("actualAdvancing"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("actualBonuses"), data: { data: { champion: null, topScorers: [] } } });
  ops.push({ type: "set", ref: gameDocRef("settings"), data: { data: { predictionsLocked: false } } });
  await commitInBatches(ops);

  cache.users = {};
  cache.predictions = {};
  cache.matchResults = {};
  cache.actualAdvancing = {};
  cache.actualBonuses = { champion: null, topScorers: [] };
  cache.settings = { predictionsLocked: false };
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  notifyAndEmit("all");
}

export async function importAllData(data) {
  writeAuditLog("import-data", { keys: Object.keys(data) });

  // Validate imported data structure
  if (!data || typeof data !== "object") throw new Error("נתונים לא תקינים");
  if (data.users && typeof data.users !== "object")
    throw new Error("מבנה משתמשים לא תקין");
  if (data.predictions && typeof data.predictions !== "object")
    throw new Error("מבנה ניחושים לא תקין");
  if (data.matchResults && typeof data.matchResults !== "object")
    throw new Error("מבנה תוצאות לא תקין");

  const ops = [];

  // Write gameData docs
  const gameKeys = [
    "users",
    "matchResults",
    "actualAdvancing",
    "actualBonuses",
    "settings",
  ];
  for (const key of gameKeys) {
    if (data[key]) {
      cache[key] = data[key];
      ops.push({ type: "set", ref: gameDocRef(key), data: { data: structuredClone(data[key]) } });
    }
  }

  // Write prediction forms as individual docs
  if (data.predictions) {
    // First delete existing forms
    const existing = await getDocs(predictionsCollectionRef);
    existing.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));

    // Then create new ones
    for (const [formId, formData] of Object.entries(data.predictions)) {
      ops.push({ type: "set", ref: formDocRef(formId), data: structuredClone(formData) });
    }
    cache.predictions = data.predictions;
  }

  notifyListeners();
  await commitInBatches(ops);
}
