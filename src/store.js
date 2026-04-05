// Firestore-based data store
// All data is shared between all users via Firebase
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// Each data type is a single document in the "gameData" collection
const DOCS = {
  users: 'users',
  predictions: 'predictions',
  matchResults: 'matchResults',
  actualAdvancing: 'actualAdvancing',
  actualBonuses: 'actualBonuses',
  settings: 'settings',
};

// Current user is local-only (each browser has its own login)
const CURRENT_USER_KEY = 'wc2026_currentUser';
// Currently active form for editing
const ACTIVE_FORM_KEY = 'wc2026_activeForm';

// ============ IN-MEMORY CACHE ============
// Firestore snapshots update this cache in real-time via listeners
const cache = {
  users: {},
  predictions: {},
  matchResults: {},
  actualAdvancing: {},
  actualBonuses: { champion: null, topScorers: [] },
  settings: { predictionsLocked: false, adminPin: '1234' },
  _ready: {},
};

// ============ FIRESTORE HELPERS ============

function docRef(docName) {
  return doc(db, 'gameData', docName);
}

async function writeDoc(docName, data) {
  cache[docName] = data;
  // Notify UI immediately from cache
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: docName } }));
  // Persist to Firestore
  try {
    await setDoc(docRef(docName), { data: JSON.parse(JSON.stringify(data)) });
  } catch (err) {
    console.error(`Failed to write ${docName}:`, err);
  }
}

// Subscribe to real-time updates from Firestore
// Called once at app startup
export function initRealtimeListeners() {
  for (const [key, docName] of Object.entries(DOCS)) {
    onSnapshot(docRef(docName), (snap) => {
      if (snap.exists()) {
        cache[key] = snap.data().data;
      }
      cache._ready[key] = true;
      window.dispatchEvent(new CustomEvent('store-updated', { detail: { key } }));
    }, (err) => {
      console.error(`Listener error for ${docName}:`, err);
      cache._ready[key] = true;
    });
  }
}

export function isStoreReady() {
  return Object.keys(DOCS).every((k) => cache._ready[k]);
}

// ============ USERS ============

export function getUsers() {
  return cache.users || {};
}

export function addUser(name, password) {
  const users = getUsers();
  const id = name.toLowerCase().replace(/\s+/g, '-');
  if (users[id]) return id; // already exists
  const updated = { ...users };
  updated[id] = {
    id,
    displayName: name,
    password: password,
    isAdmin: Object.keys(users).length === 0,
    createdAt: new Date().toISOString(),
  };
  writeDoc('users', updated);
  return id;
}

export function verifyPassword(userId, password) {
  const user = getUser(userId);
  if (!user) return false;
  return user.password === password;
}

export function updateUser(userId, fields) {
  const users = { ...getUsers() };
  if (!users[userId]) return;
  users[userId] = { ...users[userId], ...fields };
  writeDoc('users', users);
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
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: 'currentUser' } }));
}

export function logoutUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: 'currentUser' } }));
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
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: 'activeForm' } }));
}

// ============ PREDICTIONS (MULTI-FORM) ============
// predictions[formId] = { userId, formName, budgetNumber, matches, advancing, champion, topScorer, status, ... }
// formId format: "userId__1", "userId__2", etc.

export function getAllPredictions() {
  return cache.predictions || {};
}

const DEFAULT_FORM = { matches: {}, advancing: {}, champion: null, topScorer: '', status: 'draft' };

export function getFormsForUser(userId) {
  const all = getAllPredictions();
  const forms = [];
  for (const [formId, data] of Object.entries(all)) {
    if (data.userId === userId) {
      forms.push({ formId, ...data });
    }
  }
  // Sort by creation time
  forms.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
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
    budgetNumber: '',
    ...DEFAULT_FORM,
    createdAt: new Date().toISOString(),
  };
  writeDoc('predictions', all);
  setActiveFormId(formId);
  return formId;
}

export function deleteForm(formId) {
  const all = { ...getAllPredictions() };
  const form = all[formId];
  if (!form || form.status !== 'draft') return; // can only delete drafts
  delete all[formId];
  writeDoc('predictions', all);
  // If this was the active form, clear it
  if (getActiveFormId() === formId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: 'activeForm' } }));
  }
}

export function updateFormDetails(formId, fields) {
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId], ...fields };
  writeDoc('predictions', all);
}

export function savePrediction(formId, matchId, prediction) {
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId], matches: { ...all[formId].matches } };
  if (all[formId].status !== 'draft') return;
  all[formId].matches[matchId] = prediction;
  all[formId].updatedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function saveBonusPrediction(formId, field, value) {
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  if (all[formId].status !== 'draft') return;
  all[formId][field] = value;
  all[formId].updatedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function submitPredictions(formId) {
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  all[formId].status = 'submitted';
  all[formId].submittedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function reopenForm(formId) {
  const all = { ...getAllPredictions() };
  if (!all[formId]) return;
  all[formId] = { ...all[formId] };
  all[formId].status = 'draft';
  all[formId].reopenedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

// ============ MATCH RESULTS (admin) ============

export function clearMatchResults() {
  writeDoc('matchResults', {});
}

export function getMatchResults() {
  return cache.matchResults || {};
}

export function saveMatchResult(matchId, result) {
  const results = { ...getMatchResults() };
  results[matchId] = {
    ...result,
    updatedAt: new Date().toISOString(),
  };
  writeDoc('matchResults', results);
}

// ============ ACTUAL ADVANCING TEAMS (admin) ============

export function getActualAdvancing() {
  return cache.actualAdvancing || {};
}

export function saveActualAdvancing(round, teams) {
  const advancing = { ...getActualAdvancing() };
  advancing[round] = teams;
  writeDoc('actualAdvancing', advancing);
}

// ============ ACTUAL BONUSES (admin) ============

export function getActualBonuses() {
  return cache.actualBonuses || { champion: null, topScorers: [] };
}

export function saveActualBonuses(bonuses) {
  writeDoc('actualBonuses', bonuses);
}

// ============ SETTINGS ============

export function getSettings() {
  return cache.settings || { predictionsLocked: false, adminPin: '1234' };
}

export function updateSettings(newSettings) {
  const settings = { ...getSettings(), ...newSettings };
  writeDoc('settings', settings);
}

// ============ DATA EXPORT/IMPORT ============

export function exportAllData() {
  return {
    users: getUsers(),
    predictions: getAllPredictions(),
    matchResults: getMatchResults(),
    actualAdvancing: getActualAdvancing(),
    actualBonuses: getActualBonuses(),
    settings: getSettings(),
    exportedAt: new Date().toISOString(),
  };
}

export function clearAllData() {
  writeDoc('users', {});
  writeDoc('predictions', {});
  writeDoc('matchResults', {});
  writeDoc('actualAdvancing', {});
  writeDoc('actualBonuses', { champion: null, topScorers: [] });
  writeDoc('settings', { predictionsLocked: false, adminPin: '1234' });
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: 'all' } }));
}

export function importAllData(data) {
  if (data.users) writeDoc('users', data.users);
  if (data.predictions) writeDoc('predictions', data.predictions);
  if (data.matchResults) writeDoc('matchResults', data.matchResults);
  if (data.actualAdvancing) writeDoc('actualAdvancing', data.actualAdvancing);
  if (data.actualBonuses) writeDoc('actualBonuses', data.actualBonuses);
  if (data.settings) writeDoc('settings', data.settings);
}
