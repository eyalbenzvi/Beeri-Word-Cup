// Simple localStorage-based data store
// All data lives in the browser - no server needed

const KEYS = {
  users: 'wc2026_users',
  currentUser: 'wc2026_currentUser',
  predictions: 'wc2026_predictions',
  matchResults: 'wc2026_matchResults',
  actualAdvancing: 'wc2026_actualAdvancing',
  actualBonuses: 'wc2026_actualBonuses',
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
// Each user's predictions include:
//   matches: { matchId: { homeScore, awayScore } }
//   advancing: { R32: [teamCodes], R16: [...], QF: [...], SF: [...], F: [...] }
//   champion: teamCode
//   topScorer: "player name"

export function getAllPredictions() {
  return read(KEYS.predictions) || {};
}

export function getFullUserPredictions(userId) {
  const all = getAllPredictions();
  return all[userId] || { userId, matches: {}, advancing: {}, champion: null, topScorer: '' };
}

export function getUserPredictions(userId) {
  const all = getAllPredictions();
  return all[userId]?.matches || {};
}

export function savePrediction(userId, matchId, prediction) {
  const all = getAllPredictions();
  if (!all[userId]) {
    all[userId] = { userId, matches: {}, advancing: {}, champion: null, topScorer: '' };
  }
  all[userId].matches[matchId] = prediction;
  all[userId].updatedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

export function saveAdvancingPrediction(userId, round, teams) {
  const all = getAllPredictions();
  if (!all[userId]) {
    all[userId] = { userId, matches: {}, advancing: {}, champion: null, topScorer: '' };
  }
  if (!all[userId].advancing) all[userId].advancing = {};
  all[userId].advancing[round] = teams;
  all[userId].updatedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

export function saveBonusPrediction(userId, field, value) {
  const all = getAllPredictions();
  if (!all[userId]) {
    all[userId] = { userId, matches: {}, advancing: {}, champion: null, topScorer: '' };
  }
  all[userId][field] = value;
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

// ============ ACTUAL ADVANCING TEAMS (admin) ============
// Which teams actually advanced to each round
// { R32: [teamCodes], R16: [...], QF: [...], SF: [...], F: [...] }

export function getActualAdvancing() {
  return read(KEYS.actualAdvancing) || {};
}

export function saveActualAdvancing(round, teams) {
  const advancing = getActualAdvancing();
  advancing[round] = teams;
  write(KEYS.actualAdvancing, advancing);
}

// ============ ACTUAL BONUSES (admin) ============
// { champion: teamCode, topScorers: ["player1", "player2"] }

export function getActualBonuses() {
  return read(KEYS.actualBonuses) || { champion: null, topScorers: [] };
}

export function saveActualBonuses(bonuses) {
  write(KEYS.actualBonuses, bonuses);
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

export function importAllData(data) {
  if (data.users) write(KEYS.users, data.users);
  if (data.predictions) write(KEYS.predictions, data.predictions);
  if (data.matchResults) write(KEYS.matchResults, data.matchResults);
  if (data.actualAdvancing) write(KEYS.actualAdvancing, data.actualAdvancing);
  if (data.actualBonuses) write(KEYS.actualBonuses, data.actualBonuses);
  if (data.settings) write(KEYS.settings, data.settings);
}
