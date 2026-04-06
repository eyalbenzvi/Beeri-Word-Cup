import { db } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

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
  settings: { predictionsLocked: false, adminPin: "1234" },
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
    await setDoc(docRef(docName), { data: JSON.parse(JSON.stringify(data)) });
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
    setDoc(docRef(docName), { data: JSON.parse(JSON.stringify(data)) })
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
    setDoc(docRef(docName), {
      data: JSON.parse(JSON.stringify(cache[docName])),
    }).catch(() => {});
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
const DEFAULT_SETTINGS = { predictionsLocked: false, adminPin: "1234" };

export function getUsers() {
  return cache.users || EMPTY_OBJ;
}

// Called when a user signs in via Firebase Auth (Google or Phone)
// Creates/updates the user record in Firestore
export function ensureUserInStore(uid, displayName) {
  if (!cache._ready.users) return uid;

  const users = { ...getUsers() };
  if (users[uid]) {
    if (displayName && users[uid].displayName !== displayName) {
      users[uid] = { ...users[uid], displayName };
      writeDoc("users", users);
    }
    return uid;
  }
  users[uid] = {
    id: uid,
    displayName: displayName || "משתמש",
    isAdmin: Object.keys(users).length === 0,
    createdAt: new Date().toISOString(),
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

export function deleteUser(userId) {
  const users = { ...getUsers() };
  delete users[userId];
  writeDoc("users", users);

  const predictions = { ...getAllPredictions() };
  let removed = false;
  for (const key of Object.keys(predictions)) {
    if (predictions[key].userId === userId) {
      delete predictions[key];
      removed = true;
    }
  }
  if (removed) {
    writeDoc("predictions", predictions);
  }
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

export function createForm(userId, formName) {
  const all = { ...getAllPredictions() };
  // Find next index for this user
  const userForms = getFormsForUser(userId);
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

// ============ MATCH RESULTS (admin) ============

export function clearMatchResults() {
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
  writeDoc("users", {});
  writeDoc("predictions", {});
  writeDoc("matchResults", {});
  writeDoc("actualAdvancing", {});
  writeDoc("actualBonuses", { champion: null, topScorers: [] });
  writeDoc("settings", { predictionsLocked: false, adminPin: "1234" });
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  window.dispatchEvent(
    new CustomEvent("store-updated", { detail: { key: "all" } }),
  );
}

export function importAllData(data) {
  if (data.users) writeDoc("users", data.users);
  if (data.predictions) writeDoc("predictions", data.predictions);
  if (data.matchResults) writeDoc("matchResults", data.matchResults);
  if (data.actualAdvancing) writeDoc("actualAdvancing", data.actualAdvancing);
  if (data.actualBonuses) writeDoc("actualBonuses", data.actualBonuses);
  if (data.settings) writeDoc("settings", data.settings);
}
