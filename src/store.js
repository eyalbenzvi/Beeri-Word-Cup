// Simple localStorage-based data store
// All data lives in the browser - no server needed

const KEYS = {
  users: 'wc2026_users',
  currentUser: 'wc2026_currentUser',
  predictions: 'wc2026_predictions',
  matchResults: 'wc2026_matchResults',
  settings: 'wc2026_settings',
};

function read(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  // Dispatch event so other components can react
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key } }));
}

// ============ USERS ============

export function getUsers() {
  return read(KEYS.users) || {};
}

export function addUser(name) {
  const users = getUsers();
  const id = name.toLowerCase().replace(/\s+/g, '-');
  if (users[id]) return id; // already exists
  users[id] = {
    id,
    displayName: name,
    isAdmin: Object.keys(users).length === 0, // first user is admin
    createdAt: new Date().toISOString(),
  };
  write(KEYS.users, users);
  return id;
}

export function getUser(userId) {
  const users = getUsers();
  return users[userId] || null;
}

export function getCurrentUser() {
  const userId = read(KEYS.currentUser);
  if (!userId) return null;
  return getUser(userId);
}

export function setCurrentUser(userId) {
  write(KEYS.currentUser, userId);
}

export function logoutUser() {
  localStorage.removeItem(KEYS.currentUser);
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: KEYS.currentUser } }));
}

// ============ PREDICTIONS ============

export function getAllPredictions() {
  return read(KEYS.predictions) || {};
}

export function getUserPredictions(userId) {
  const all = getAllPredictions();
  return all[userId]?.matches || {};
}

export function savePrediction(userId, matchId, prediction) {
  const all = getAllPredictions();
  if (!all[userId]) {
    all[userId] = { userId, matches: {} };
  }
  all[userId].matches[matchId] = prediction;
  all[userId].updatedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

// ============ MATCH RESULTS (admin) ============

export function getMatchResults() {
  return read(KEYS.matchResults) || {};
}

export function saveMatchResult(matchId, result) {
  const results = getMatchResults();
  results[matchId] = {
    ...result,
    updatedAt: new Date().toISOString(),
  };
  write(KEYS.matchResults, results);
}

// ============ SETTINGS ============

export function getSettings() {
  return read(KEYS.settings) || {
    predictionsLocked: false,
    adminPin: '1234', // default admin PIN
  };
}

export function updateSettings(newSettings) {
  const settings = getSettings();
  write(KEYS.settings, { ...settings, ...newSettings });
}

// ============ DATA EXPORT/IMPORT ============
// So the admin can back up data or share it

export function exportAllData() {
  return {
    users: getUsers(),
    predictions: getAllPredictions(),
    matchResults: getMatchResults(),
    settings: getSettings(),
    exportedAt: new Date().toISOString(),
  };
}

export function importAllData(data) {
  if (data.users) write(KEYS.users, data.users);
  if (data.predictions) write(KEYS.predictions, data.predictions);
  if (data.matchResults) write(KEYS.matchResults, data.matchResults);
  if (data.settings) write(KEYS.settings, data.settings);
}
