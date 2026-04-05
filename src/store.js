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

export function addUser(name, password) {
  const users = getUsers();
  const id = name.toLowerCase().replace(/\s+/g, '-');
  if (users[id]) return id; // already exists
  users[id] = {
    id,
    displayName: name,
    password: password,
    formName: '',
    budgetNumber: '',
    isAdmin: Object.keys(users).length === 0, // first user is admin
    createdAt: new Date().toISOString(),
  };
  write(KEYS.users, users);
  return id;
}

export function verifyPassword(userId, password) {
  const user = getUser(userId);
  if (!user) return false;
  return user.password === password;
}

export function updateUser(userId, fields) {
  const users = getUsers();
  if (!users[userId]) return;
  Object.assign(users[userId], fields);
  write(KEYS.users, users);
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

const DEFAULT_PREDICTIONS = { matches: {}, advancing: {}, champion: null, topScorer: '', status: 'draft' };
// status: 'draft' | 'pending' | 'approved'
// draft = user is still editing
// pending = user submitted, waiting for admin approval
// approved = admin approved, locked permanently

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
  let all = getAllPredictions();
  all = ensureUser(all, userId);
  // Can only edit if draft
  if (all[userId].status !== 'draft') return;
  all[userId].matches[matchId] = prediction;
  all[userId].updatedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

export function saveAdvancingPrediction(userId, round, teams) {
  let all = getAllPredictions();
  all = ensureUser(all, userId);
  if (all[userId].status !== 'draft') return;
  if (!all[userId].advancing) all[userId].advancing = {};
  all[userId].advancing[round] = teams;
  all[userId].updatedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

export function saveBonusPrediction(userId, field, value) {
  let all = getAllPredictions();
  all = ensureUser(all, userId);
  if (all[userId].status !== 'draft') return;
  all[userId][field] = value;
  all[userId].updatedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

// User submits predictions for admin approval
export function submitPredictions(userId) {
  let all = getAllPredictions();
  all = ensureUser(all, userId);
  all[userId].status = 'pending';
  all[userId].submittedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

// Admin approves user's predictions
export function approvePredictions(userId) {
  const all = getAllPredictions();
  if (!all[userId]) return;
  all[userId].status = 'approved';
  all[userId].approvedAt = new Date().toISOString();
  write(KEYS.predictions, all);
}

// Admin rejects user's predictions (sends back to draft)
export function rejectPredictions(userId) {
  const all = getAllPredictions();
  if (!all[userId]) return;
  all[userId].status = 'draft';
  all[userId].rejectedAt = new Date().toISOString();
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

export function clearAllData() {
  for (const key of Object.values(KEYS)) {
    localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent('store-updated', { detail: { key: 'all' } }));
}

export function importAllData(data) {
  if (data.users) write(KEYS.users, data.users);
  if (data.predictions) write(KEYS.predictions, data.predictions);
  if (data.matchResults) write(KEYS.matchResults, data.matchResults);
  if (data.actualAdvancing) write(KEYS.actualAdvancing, data.actualAdvancing);
  if (data.actualBonuses) write(KEYS.actualBonuses, data.actualBonuses);
  if (data.settings) write(KEYS.settings, data.settings);
}
