import { db } from "./firebase";
import { doc, setDoc, onSnapshot, writeBatch } from "firebase/firestore";

// ============ AUDIT LOG ============
const AUDIT_LOG_KEY = "wc2026_audit_log";
const auditLog = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || "[]");

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

const DOCS = {
  users: "users",
  predictions: "predictions",
  matchResults: "matchResults",
  actualAdvancing: "actualAdvancing",
  actualBonuses: "actualBonuses",
  settings: "settings",
};

const CURRENT_USER_KEY = "wc2026_currentUser";

const ACTIVE_FORM_KEY = "wc2026_activeForm";

const cache = {
  users: {},
  predictions: {},
  matchResults: {},
  actualAdvancing: {},
  actualBonuses: { champion: null, topScorers: [] },
  settings: { predictionsLocked: false },
  _ready: {},
};

function docRef(docName) {
  return doc(db, "gameData", docName);
}

async function writeDoc(docName, data) {
  cache[docName] = data;
  window.dispatchEvent(
    new CustomEvent("store-updated", { detail: { key: docName } }),
  );
  window.dispatchEvent(
    new CustomEvent("store-saving", { detail: { key: docName } }),
  );
  try {
    await setDoc(docRef(docName), { data: structuredClone(data) });
    window.dispatchEvent(
      new CustomEvent("store-saved", { detail: { key: docName } }),
    );
    return true;
  } catch (err) {
    console.error(`Failed to write ${docName}:`, err);
    window.dispatchEvent(
      new CustomEvent("store-write-error", {
        detail: { key: docName, error: err.message },
      }),
    );
    return false;
  }
}

const pendingWrites = {};

function debouncedWriteDoc(docName, data, delay = 500) {
  cache[docName] = data;
  window.dispatchEvent(
    new CustomEvent("store-updated", { detail: { key: docName } }),
  );
  window.dispatchEvent(
    new CustomEvent("store-saving", { detail: { key: docName } }),
  );
  clearTimeout(pendingWrites[docName]);
  pendingWrites[docName] = setTimeout(() => {
    delete pendingWrites[docName];
    setDoc(docRef(docName), { data: structuredClone(data) })
      .then(() => {
        window.dispatchEvent(
          new CustomEvent("store-saved", { detail: { key: docName } }),
        );
      })
      .catch((err) => {
        console.error(`Failed to write ${docName}:`, err);
        window.dispatchEvent(
          new CustomEvent("store-write-error", {
            detail: { key: docName, error: err.message },
          }),
        );
      });
  }, delay);
}

function flushPendingWrites() {
  for (const docName of Object.keys(pendingWrites)) {
    clearTimeout(pendingWrites[docName]);
    delete pendingWrites[docName];
    try {
      const data = structuredClone(cache[docName]);
      // Use keepalive fetch for reliability on page close
      setDoc(docRef(docName), { data }).catch((err) => {
        console.error(`Failed to flush ${docName}:`, err);
        window.dispatchEvent(
          new CustomEvent("store-write-error", { detail: { key: docName, error: err } }),
        );
      });
    } catch (err) {
      console.error(`Failed to clone ${docName} for flush:`, err);
    }
  }
}

export function hasPendingWrites() {
  return Object.keys(pendingWrites).length > 0;
}

let listenersInitialized = false;

export function initRealtimeListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
  window.addEventListener("pagehide", flushPendingWrites);

  for (const [key, docName] of Object.entries(DOCS)) {
    onSnapshot(
      docRef(docName),
      (snap) => {
        if (snap.exists()) {
          cache[key] = snap.data().data;
        }
        cache._ready[key] = true;
        window.dispatchEvent(
          new CustomEvent("store-updated", { detail: { key } }),
        );
      },
      (err) => {
        console.error(`Listener error for ${docName}:`, err);
        cache._ready[key] = true;
      },
    );
  }
}

export function isStoreReady() {
  return Object.keys(DOCS).every((k) => cache._ready[k]);
}

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

// Called when a user signs in via Firebase Auth (Google or Phone)
// Creates/updates the user record in Firestore
export function ensureUserInStore(uid, displayName) {
  if (!cache._ready.users) return uid;

  const users = { ...getUsers() };
  const now = new Date().toISOString();
  if (users[uid]) {
    // Update display name if changed + touch lastLoginAt in one write
    const needsUpdate = (displayName && users[uid].displayName !== displayName);
    users[uid] = { ...users[uid], lastLoginAt: now };
    if (needsUpdate) users[uid].displayName = displayName;
    writeDoc("users", users);
    return uid;
  }
  users[uid] = {
    id: uid,
    displayName: displayName || "משתמש",
    isAdmin: Object.keys(users).length === 0,
    createdAt: now,
    lastLoginAt: now,
  };
  writeDoc("users", users);
  return uid;
}

export function updateUser(userId, fields) {
  const users = { ...getUsers() };
  if (!users[userId]) return;
  users[userId] = { ...users[userId], ...fields };
  writeDoc("users", users);
}

export function touchUserLogin(uid) {
  const users = { ...getUsers() };
  if (!users[uid]) return;
  users[uid] = { ...users[uid], lastLoginAt: new Date().toISOString() };
  writeDoc("users", users);
}

export function demoteAdmin(userId) {
  const users = { ...getUsers() };
  if (!users[userId] || !users[userId].isAdmin) return;
  const adminCount = Object.values(users).filter((u) => u.isAdmin).length;
  if (adminCount <= 1) return;
  users[userId] = { ...users[userId], isAdmin: false };
  writeDoc("users", users);
}

export async function deleteUser(userId) {
  const users = { ...getUsers() };
  delete users[userId];

  const predictions = { ...getAllPredictions() };
  for (const key of Object.keys(predictions)) {
    if (predictions[key].userId === userId) delete predictions[key];
  }

  // Atomic batch write — both docs update together or not at all
  cache.users = users;
  cache.predictions = predictions;
  notifyListeners();
  const batch = writeBatch(db);
  batch.set(docRef("users"), { data: structuredClone(users) });
  batch.set(docRef("predictions"), { data: structuredClone(predictions) });
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
  window.dispatchEvent(
    new CustomEvent("store-updated", { detail: { key: "currentUser" } }),
  );
}

export function logoutUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  window.dispatchEvent(
    new CustomEvent("store-updated", { detail: { key: "currentUser" } }),
  );
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
  window.dispatchEvent(
    new CustomEvent("store-updated", { detail: { key: "activeForm" } }),
  );
}

// ============ PREDICTIONS (MULTI-FORM) ============
// predictions[formId] = { userId, formName, budgetNumber, matches, advancing, champion, topScorer, status, ... }
// formId format: "userId__1", "userId__2", etc.

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
  // Sort by creation time
  forms.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return forms;
}

export function getForm(formId) {
  const all = getAllPredictions();
  return all[formId] || null;
}

const MAX_FORMS_PER_USER = 10;

export function createForm(userId, formName) {
  const all = { ...getAllPredictions() };
  const userForms = getFormsForUser(userId);
  if (userForms.length >= MAX_FORMS_PER_USER) {
    throw new Error(`מקסימום ${MAX_FORMS_PER_USER} טפסים למשתמש`);
  }
  const nextIndex = userForms.length + 1;
  const formId = `${userId}__${nextIndex}`;

  all[formId] = {
    userId,
    formName: formName || `טופס ${nextIndex}`,
    budgetNumber: "",
    ...DEFAULT_FORM,
    createdAt: new Date().toISOString(),
  };
  writeDoc("predictions", all);
  setActiveFormId(formId);
  return formId;
}

export function deleteForm(formId) {
  const all = { ...getAllPredictions() };
  const form = all[formId];
  if (!form || form.status !== "draft") return; // can only delete drafts
  delete all[formId];
  writeDoc("predictions", all);
  // If this was the active form, clear it
  if (getActiveFormId() === formId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    window.dispatchEvent(
      new CustomEvent("store-updated", { detail: { key: "activeForm" } }),
    );
  }
}

export function updateFormDetails(formId, fields) {
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId], ...fields };
  debouncedWriteDoc("predictions", all);
}

export function savePrediction(formId, matchId, prediction) {
  if (getSettings().predictionsLocked) return;
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId], matches: { ...all[formId].matches } };
  if (all[formId].status !== "draft") return;
  all[formId].matches[matchId] = prediction;
  all[formId].updatedAt = new Date().toISOString();
  debouncedWriteDoc("predictions", all);
}

export function saveBonusPrediction(formId, field, value) {
  if (getSettings().predictionsLocked) return;
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  if (all[formId].status !== "draft") return;
  all[formId][field] = value;
  all[formId].updatedAt = new Date().toISOString();
  debouncedWriteDoc("predictions", all);
}

export function submitPredictions(formId) {
  if (getSettings().predictionsLocked) return;
  flushPendingWrites();
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  all[formId].status = "submitted";
  all[formId].submittedAt = new Date().toISOString();
  writeDoc("predictions", all);
}

export function reopenForm(formId) {
  if (getSettings().predictionsLocked) return;
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  all[formId].status = "draft";
  all[formId].reopenedAt = new Date().toISOString();
  writeDoc("predictions", all);
}

export function adminForceSubmitForm(formId) {
  logAdminAction("force-submit", { formId });
  flushPendingWrites();
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  all[formId].status = "submitted";
  all[formId].submittedAt = new Date().toISOString();
  all[formId].adminSubmittedAt = new Date().toISOString();
  writeDoc("predictions", all);
}

export function adminReopenForm(formId) {
  logAdminAction("reopen-form", { formId });
  flushPendingWrites();
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  all[formId].status = "draft";
  all[formId].reopenedAt = new Date().toISOString();
  all[formId].adminReopenedAt = new Date().toISOString();
  writeDoc("predictions", all);
}

export function adminDeleteForm(formId) {
  logAdminAction("delete-form", { formId });
  flushPendingWrites();
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  delete all[formId];
  writeDoc("predictions", all);
  if (getActiveFormId() === formId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    window.dispatchEvent(
      new CustomEvent("store-updated", { detail: { key: "activeForm" } }),
    );
  }
}

export function adminUpdateForm(formId, fields) {
  flushPendingWrites();
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = {
    ...all[formId],
    ...fields,
    updatedAt: new Date().toISOString(),
  };
  if (fields.adminNote != null) {
    all[formId].adminEditedAt = new Date().toISOString();
  }
  writeDoc("predictions", all);
}

export function adminSaveMatchPrediction(formId, matchId, prediction) {
  flushPendingWrites();
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId], matches: { ...all[formId].matches } };
  all[formId].matches[matchId] = prediction;
  all[formId].updatedAt = new Date().toISOString();
  writeDoc("predictions", all);
}

// ============ MATCH RESULTS (admin) ============

export function clearMatchResults() {
  logAdminAction("clear-match-results");
  writeDoc("matchResults", {});
}

export function getMatchResults() {
  return cache.matchResults || EMPTY_OBJ;
}

export function saveMatchResult(matchId, result) {
  const results = { ...getMatchResults() };
  results[matchId] = {
    ...result,
    updatedAt: new Date().toISOString(),
  };
  writeDoc("matchResults", results);
}

export function deleteMatchResult(matchId) {
  const results = { ...getMatchResults() };
  delete results[matchId];
  writeDoc("matchResults", results);
}

// ============ ACTUAL BONUSES (admin) ============

export function getActualBonuses() {
  return cache.actualBonuses || DEFAULT_BONUSES;
}

export function saveActualBonuses(bonuses) {
  writeDoc("actualBonuses", bonuses);
}

// ============ SETTINGS ============

export function getSettings() {
  return cache.settings || DEFAULT_SETTINGS;
}

export function updateSettings(newSettings) {
  const settings = { ...getSettings(), ...newSettings };
  writeDoc("settings", settings);
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

export function clearAllData() {
  logAdminAction("clear-all-data");
  writeDoc("users", {});
  writeDoc("predictions", {});
  writeDoc("matchResults", {});
  writeDoc("actualAdvancing", {});
  writeDoc("actualBonuses", { champion: null, topScorers: [] });
  writeDoc("settings", { predictionsLocked: false });
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  window.dispatchEvent(
    new CustomEvent("store-updated", { detail: { key: "all" } }),
  );
}

export async function importAllData(data) {
  logAdminAction("import-data", { keys: Object.keys(data) });
  // Use batched write for atomicity
  const batch = writeBatch(db);
  const keys = ["users", "predictions", "matchResults", "actualAdvancing", "actualBonuses", "settings"];
  for (const key of keys) {
    if (data[key]) {
      cache[key] = data[key];
      batch.set(docRef(key), { data: structuredClone(data[key]) });
    }
  }
  notifyListeners();
  await batch.commit();
}
