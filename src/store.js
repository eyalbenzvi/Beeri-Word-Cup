import { db } from "./firebase";
import {
  doc,
  setDoc,
  deleteDoc,
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

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

function gameDocRef(docName) {
  return doc(db, "gameData", docName);
}

function formDocRef(formId) {
  return doc(db, "predictions", formId);
}

const predictionsCollectionRef = collection(db, "predictions");

async function writeGameDoc(docName, data) {
  cache[docName] = data;
  notifyAndEmit(docName);
  emitSaving(docName);
  try {
    await withTimeout(setDoc(gameDocRef(docName), { data: structuredClone(data) }), 10000);
    emitSaved(docName);
    return true;
  } catch (err) {
    console.error(`Failed to write ${docName}:`, err);
    emitWriteError(docName, err);
    return false;
  }
}

async function writeFormDoc(formId, formData) {
  cache.predictions = { ...cache.predictions, [formId]: formData };
  notifyAndEmit("predictions");
  emitSaving("predictions");
  try {
    await withTimeout(setDoc(formDocRef(formId), structuredClone(formData)), 10000);
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
    if (cache.settings?.predictionsLocked) { delete pendingWrites[key]; return; }
    delete pendingWrites[key];
    setDoc(formDocRef(formId), structuredClone(formData))
      .then(() => emitSaved("predictions"))
      .catch((err) => {
        console.error(`Failed to write form ${formId}:`, err);
        emitWriteError("predictions", err);
      });
  }, delay);
}

function flushPendingWrites() {
  for (const key of Object.keys(pendingWrites)) {
    clearTimeout(pendingWrites[key]);
    delete pendingWrites[key];
    try {
      if (key.startsWith("form:")) {
        const formId = key.slice(5);
        const data = structuredClone(cache.predictions[formId]);
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

function setupPredictionsListener(userId, showAll) {
  if (predictionsUnsub) predictionsUnsub();
  predictionsShowAll = showAll;

  const q = showAll
    ? predictionsCollectionRef
    : query(predictionsCollectionRef, where("userId", "==", userId));

  predictionsUnsub = onSnapshot(
    q,
    (snapshot) => {
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
      notifyAndEmit("predictions");
    },
    (err) => {
      console.error("Listener error for predictions:", err);
      listenersHadError = true;
      cache._ready.predictions = true;
      notifyAndEmit("predictions");
    },
  );
}

function maybeUpgradePredictionsListener() {
  if (predictionsShowAll || !currentListenerUserId) return;
  const isUserAdmin = cache.users?.[currentListenerUserId]?.isAdmin === true;
  const isLocked = cache.settings?.predictionsLocked === true;
  if (isUserAdmin || isLocked) {
    setupPredictionsListener(currentListenerUserId, true);
  }
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

  // Listen to gameData single documents
  for (const [key, docName] of Object.entries(DOCS)) {
    onSnapshot(
      gameDocRef(docName),
      (snap) => {
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
        cache._ready[key] = true;
        notifyAndEmit(key);
      },
    );
  }

  // Start with filtered predictions (own forms only)
  setupPredictionsListener(userId, false);
}

export function isStoreReady() {
  return (
    Object.keys(DOCS).every((k) => cache._ready[k]) &&
    cache._ready.predictions
  );
}

// ============ SUBSCRIPTIONS ============

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  for (const listener of listeners) listener();
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

export function ensureUserInStore(uid, displayName) {
  if (!cache._ready.users) return uid;
  // Prevent repeated writes for the same user in the same session
  if (lastEnsuredUid === uid && getUsers()[uid]) return uid;
  lastEnsuredUid = uid;

  const users = { ...getUsers() };
  const now = new Date().toISOString();
  if (users[uid]) {
    const needsUpdate =
      displayName && users[uid].displayName !== displayName;
    if (!needsUpdate) return uid; // nothing to update
    users[uid] = { ...users[uid], displayName };
    writeGameDoc("users", users);
    return uid;
  }
  users[uid] = {
    id: uid,
    displayName: displayName || "משתמש",
    isAdmin: false,
    createdAt: now,
    lastLoginAt: now,
  };
  writeGameDoc("users", users);
  return uid;
}

export function updateUser(userId, fields) {
  const users = { ...getUsers() };
  if (!users[userId]) return;
  users[userId] = { ...users[userId], ...fields };
  writeGameDoc("users", users);
}

export function touchUserLogin(uid) {
  const users = { ...getUsers() };
  if (!users[uid]) return;
  users[uid] = { ...users[uid], lastLoginAt: new Date().toISOString() };
  writeGameDoc("users", users);
}

export function demoteAdmin(userId) {
  const users = { ...getUsers() };
  if (!users[userId] || !users[userId].isAdmin) return;
  const adminCount = Object.values(users).filter((u) => u.isAdmin).length;
  if (adminCount <= 1) return;
  users[userId] = { ...users[userId], isAdmin: false };
  writeGameDoc("users", users);
}

export async function deleteUser(userId) {
  const users = { ...getUsers() };
  delete users[userId];

  // Delete user's forms
  const formsToDelete = Object.keys(cache.predictions).filter(
    (fid) => cache.predictions[fid]?.userId === userId,
  );

  cache.users = users;
  for (const fid of formsToDelete) {
    delete cache.predictions[fid];
  }
  cache.predictions = { ...cache.predictions };
  notifyListeners();

  const batch = writeBatch(db);
  batch.set(gameDocRef("users"), { data: structuredClone(users) });
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
  lastEnsuredUid = null;
  listenersInitialized = false;
  listenersHadError = false;
  if (predictionsUnsub) {
    predictionsUnsub();
    predictionsUnsub = null;
  }
  currentListenerUserId = null;
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
  const forms = [];
  for (const [formId, data] of Object.entries(all)) {
    if (data.userId === userId) {
      forms.push({ formId, ...data });
    }
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
  const nextIndex = userForms.length + 1;
  const formId = `${userId}__${nextIndex}`;

  const formData = {
    userId,
    formName: formName || `טופס ${nextIndex}`,
    budgetNumber: "",
    ...DEFAULT_FORM,
    createdAt: new Date().toISOString(),
  };
  writeFormDoc(formId, formData);
  setActiveFormId(formId);
  return formId;
}

export async function deleteForm(formId) {
  const form = getForm(formId);
  if (!form || form.status !== "draft") return;

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
    status: "submitted",
    submittedAt: new Date().toISOString(),
  };
  writeFormDoc(formId, updated);
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
  logAdminAction("force-submit", { formId });
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
  logAdminAction("reopen-form", { formId });
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
  logAdminAction("delete-form", { formId });
  flushPendingWrites();
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
  logAdminAction("clear-match-results");
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
  logAdminAction("clear-all-data");

  // Delete all form documents
  const snapshot = await getDocs(predictionsCollectionRef);
  const batch = writeBatch(db);
  snapshot.forEach((docSnap) => batch.delete(docSnap.ref));
  batch.set(gameDocRef("users"), { data: {} });
  batch.set(gameDocRef("matchResults"), { data: {} });
  batch.set(gameDocRef("actualAdvancing"), { data: {} });
  batch.set(gameDocRef("actualBonuses"), {
    data: { champion: null, topScorers: [] },
  });
  batch.set(gameDocRef("settings"), { data: { predictionsLocked: false } });
  await batch.commit();

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
  logAdminAction("import-data", { keys: Object.keys(data) });

  const batch = writeBatch(db);

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
      batch.set(gameDocRef(key), { data: structuredClone(data[key]) });
    }
  }

  // Write prediction forms as individual docs
  if (data.predictions) {
    // First delete existing forms
    const existing = await getDocs(predictionsCollectionRef);
    existing.forEach((docSnap) => batch.delete(docSnap.ref));

    // Then create new ones
    for (const [formId, formData] of Object.entries(data.predictions)) {
      batch.set(formDocRef(formId), structuredClone(formData));
    }
    cache.predictions = data.predictions;
  }

  notifyListeners();
  await batch.commit();
}
