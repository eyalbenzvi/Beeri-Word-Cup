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

export function addUser(name, phone) {
  const users = getUsers();
  const id = name.toLowerCase().replace(/\s+/g, '-');
  if (users[id]) return id; // already exists
  const updated = { ...users };
  updated[id] = {
    id,
    displayName: name,
    phone: phone,
    formName: '',
    budgetNumber: '',
    isAdmin: Object.keys(users).length === 0,
    createdAt: new Date().toISOString(),
  };
  writeDoc('users', updated);
  return id;
}

export function findUserByPhone(phone) {
  const users = getUsers();
  const normalized = phone.replace(/\D/g, '').slice(-9); // last 9 digits
  return Object.values(users).find((u) => {
    const uNorm = (u.phone || '').replace(/\D/g, '').slice(-9);
    return uNorm === normalized && normalized.length >= 9;
  }) || null;
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
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: 'currentUser' } }));
}

// ============ PREDICTIONS ============

export function getAllPredictions() {
  return cache.predictions || {};
}

const DEFAULT_PREDICTIONS = { matches: {}, advancing: {}, champion: null, topScorer: '', status: 'draft' };

export function getFullUserPredictions(userId) {
  const all = getAllPredictions();
  return all[userId] || { userId, ...DEFAULT_PREDICTIONS };
}

export function getUserPredictions(userId) {
  const all = getAllPredictions();
  return all[userId]?.matches || {};
}

export function getUserPredictionStatus(userId) {
  const all = getAllPredictions();
  return all[userId]?.status || 'draft';
}

function ensureUser(all, userId) {
  if (!all[userId]) {
    all[userId] = { userId, ...DEFAULT_PREDICTIONS };
  }
  return all;
}

export function savePrediction(userId, matchId, prediction) {
  let all = { ...getAllPredictions() };
  all = ensureUser(all, userId);
  all[userId] = { ...all[userId], matches: { ...all[userId].matches } };
  if (all[userId].status !== 'draft') return;
  all[userId].matches[matchId] = prediction;
  all[userId].updatedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function saveAdvancingPrediction(userId, round, teams) {
  let all = { ...getAllPredictions() };
  all = ensureUser(all, userId);
  all[userId] = { ...all[userId], advancing: { ...(all[userId].advancing || {}) } };
  if (all[userId].status !== 'draft') return;
  all[userId].advancing[round] = teams;
  all[userId].updatedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function saveBonusPrediction(userId, field, value) {
  let all = { ...getAllPredictions() };
  all = ensureUser(all, userId);
  all[userId] = { ...all[userId] };
  if (all[userId].status !== 'draft') return;
  all[userId][field] = value;
  all[userId].updatedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function submitPredictions(userId) {
  let all = { ...getAllPredictions() };
  all = ensureUser(all, userId);
  all[userId] = { ...all[userId] };
  all[userId].status = 'pending';
  all[userId].submittedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function approvePredictions(userId) {
  const all = { ...getAllPredictions() };
  if (!all[userId]) return;
  all[userId] = { ...all[userId] };
  all[userId].status = 'approved';
  all[userId].approvedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

export function rejectPredictions(userId) {
  const all = { ...getAllPredictions() };
  if (!all[userId]) return;
  all[userId] = { ...all[userId] };
  all[userId].status = 'draft';
  all[userId].rejectedAt = new Date().toISOString();
  writeDoc('predictions', all);
}

// ============ MATCH RESULTS (admin) ============

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
