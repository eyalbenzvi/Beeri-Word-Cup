import { db, auth } from "./firebase";
import {
  doc,
  getDoc,
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
import { captureClientError, captureClientMessage } from "./sentry";

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
  setDoc(auditRef, entry).catch((err) => {
    console.error("Audit log write failed:", err);
    captureClientError(err, { source: "auditLog.setDoc", action });
  });
}

// ============ TOKEN REFRESH HELPER (A2) ============
// Force a single ID-token refresh per uid per session when Firestore returns
// permission-denied. Safeguards against rate-limit abuse if the denial is
// genuinely a rule violation (in which case the refresh won't help anyway).
const tokenRefreshedFor = new Set();
async function maybeRefreshToken(err) {
  if (err?.code !== "permission-denied") return false;
  const u = auth.currentUser;
  if (!u || tokenRefreshedFor.has(u.uid)) return false;
  tokenRefreshedFor.add(u.uid);
  try {
    await u.getIdToken(true);
    captureClientMessage("token-refreshed-after-denied", { uid: u.uid });
    return true;
  } catch (refreshErr) {
    captureClientError(refreshErr, {
      source: "maybeRefreshToken",
      originalCode: err?.code,
    });
    return false;
  }
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

async function writeGameDoc(docName, data, { force = false } = {}) {
  // Safety guard: block writes that would dramatically shrink shared data.
  // Pass { force: true } for explicit admin-initiated clears.
  if (!force && (docName === "users" || docName === "matchResults")) {
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
    captureClientError(err, { source: "writeGameDoc", docName, code: err?.code });
    await maybeRefreshToken(err);
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
    captureClientError(err, {
      source: "createUserField",
      uid,
      code: err?.code,
    });
    await maybeRefreshToken(err);
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
    captureClientError(err, { source: "removeUserField", uid, code: err?.code });
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
    captureClientError(err, { source: "writeFormDoc", formId, code: err?.code });
    await maybeRefreshToken(err);
    return false;
  }
}

const pendingWrites = {};

function debouncedWriteForm(formId, formData, delay = 500) {
  // Block writes immediately if predictions are locked
  if (cache.settings?.predictionsLocked) return;
  cache.predictions = { ...cache.predictions, [formId]: formData };
  notifyAndEmit("predictions");
  emitSaving("predictions");
  const key = `form:${formId}`;
  clearTimeout(pendingWrites[key]);
  pendingWrites[key] = setTimeout(() => {
    delete pendingWrites[key];
    if (cache.settings?.predictionsLocked) return; // double-check at write time
    setDoc(formDocRef(formId), safeClone(formData))
      .then(() => emitSaved("predictions"))
      .catch((err) => {
        console.error(`Failed to write form ${formId}:`, err);
        emitWriteError("predictions", err);
        captureClientError(err, {
          source: "debouncedWriteForm",
          formId,
          code: err?.code,
        });
        maybeRefreshToken(err);
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
const retryState = {}; // key -> { count, inProgress }

function getRetryState(key) {
  if (!retryState[key]) retryState[key] = { count: 0, inProgress: false };
  return retryState[key];
}

// Compute backoff delay: 2s, 4s, 8s, 16s, 30s, 30s, 30s, ...
function retryDelay(attempt) {
  return Math.min(2000 * Math.pow(2, attempt), 30000);
}

// Fallback: one-shot read when realtime listener fails, then schedule next retry
async function fallbackLoadGameDoc(key, docName) {
  try {
    const snap = await withTimeout(getDoc(gameDocRef(docName)), 10000);
    if (snap.exists()) cache[key] = snap.data().data;
    cache._ready[key] = true;
    getRetryState(key).count = 0;
    notifyAndEmit(key);
    if (key === "settings" || key === "users") {
      maybeUpgradePredictionsListener();
    }
  } catch (err) {
    console.error(`Fallback load failed for ${docName}:`, err);
    captureClientError(err, {
      source: "fallbackLoadGameDoc",
      key,
      docName,
      code: err?.code,
      retryCount: getRetryState(key).count,
    });
    await maybeRefreshToken(err);
    // Schedule another retry with increasing backoff — never give up
    scheduleRetry(key, () => fallbackLoadGameDoc(key, docName));
  }
}

async function fallbackLoadPredictions(userId) {
  try {
    const q = query(predictionsCollectionRef, where("userId", "==", userId));
    const snapshot = await withTimeout(getDocs(q), 15000);
    const preds = { ...cache.predictions };
    for (const k of Object.keys(preds)) {
      if (preds[k]?.userId === userId) delete preds[k];
    }
    snapshot.forEach((docSnap) => { preds[docSnap.id] = docSnap.data(); });
    cache.predictions = preds;
    cache._ready.predictions = true;
    getRetryState("predictions").count = 0;
    rebuildUserFormIndex();
    notifyAndEmit("predictions");
  } catch (err) {
    console.error("Fallback load failed for predictions:", err);
    captureClientError(err, {
      source: "fallbackLoadPredictions",
      userId,
      code: err?.code,
      retryCount: getRetryState("predictions").count,
    });
    await maybeRefreshToken(err);
    scheduleRetry("predictions", () => fallbackLoadPredictions(userId));
  }
}

function scheduleRetry(key, retryFn) {
  if (!currentListenerUserId) return;
  const rs = getRetryState(key);
  if (rs.inProgress) return;
  rs.count++;
  rs.inProgress = true;
  const delay = retryDelay(rs.count);
  setTimeout(() => {
    rs.inProgress = false;
    if (currentListenerUserId && !cache._ready[key]) retryFn();
  }, delay);
}

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
      getRetryState("predictions").count = 0;
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
      captureClientError(err, {
        source: "predictionsListener",
        code: err?.code,
        retryCount: getRetryState("predictions").count,
        showAll: predictionsShowAll,
      });
      maybeRefreshToken(err);
      listenersHadError = true;
      notifyAndEmit("predictions");
      const rs = getRetryState("predictions");
      if (rs.inProgress) return;
      if (rs.count < 3 && currentListenerUserId) {
        rs.count++;
        rs.inProgress = true;
        setTimeout(() => {
          rs.inProgress = false;
          setupPredictionsListener(currentListenerUserId, predictionsShowAll);
        }, 5000);
      } else if (currentListenerUserId) {
        fallbackLoadPredictions(currentListenerUserId);
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
      if (document.visibilityState === "hidden") {
        flushPendingWrites();
      } else if (document.visibilityState === "visible" && !isStoreReady() && currentListenerUserId) {
        // Tab became visible and store isn't ready — retry loading
        listenersHadError = true;
        initRealtimeListeners(currentListenerUserId);
      }
    });
    window.addEventListener("pagehide", flushPendingWrites);
    // When network comes back online, retry if store isn't ready
    window.addEventListener("online", () => {
      if (!isStoreReady() && currentListenerUserId) {
        listenersHadError = true;
        initRealtimeListeners(currentListenerUserId);
      }
    });
  }

  // Reopen cross-tab sync channel (closed during logout)
  openBroadcastChannel();

  // Unsubscribe all existing gameDoc listeners before creating new ones
  gameDocUnsubs.forEach((u) => u());
  gameDocUnsubs = [];

  // Listen to gameData single documents
  for (const [key, docName] of Object.entries(DOCS)) {
    gameDocUnsubs.push(
      onSnapshot(
        gameDocRef(docName),
        (snap) => {
          getRetryState(key).count = 0;
          const prevUsers = key === "users" ? cache.users || {} : null;
          if (snap.exists()) cache[key] = snap.data().data;
          cache._ready[key] = true;
          // A7: if we just wrote our own user and the server snapshot has no
          // record of them, the write was rejected and the SDK reverted the
          // optimistic cache. Clear lastEnsuredUid so ensureUserInStore can
          // try again, and report to Sentry with context.
          if (key === "users" && lastEnsuredUid) {
            const stillThere = (cache.users || {})[lastEnsuredUid];
            const wasThere = prevUsers && prevUsers[lastEnsuredUid];
            if (wasThere && !stillThere) {
              captureClientMessage("user-cache-reverted", {
                uid: lastEnsuredUid,
                userCount: Object.keys(cache.users || {}).length,
              });
              lastEnsuredUid = null;
            }
          }
          notifyAndEmit(key);
          // When settings or users load, check if we should upgrade to all predictions
          if (key === "settings" || key === "users") {
            maybeUpgradePredictionsListener();
          }
        },
        (err) => {
          console.error(`Listener error for ${docName}:`, err);
          captureClientError(err, {
            source: "gameDocListener",
            docName,
            key,
            code: err?.code,
            retryCount: getRetryState(key).count,
          });
          maybeRefreshToken(err);
          listenersHadError = true;
          notifyAndEmit(key);
          const rs = getRetryState(key);
          if (rs.inProgress) return;
          if (rs.count < 3 && currentListenerUserId) {
            rs.count++;
            rs.inProgress = true;
            setTimeout(() => {
              rs.inProgress = false;
              initRealtimeListeners(currentListenerUserId);
            }, 5000);
          } else {
            fallbackLoadGameDoc(key, docName);
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

export function getMissingReadyKeys() {
  const missing = [];
  for (const k of Object.keys(DOCS)) if (!cache._ready[k]) missing.push(k);
  if (!cache._ready.predictions) missing.push("predictions");
  return missing;
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

// Registered once at module load — notifyListeners dispatched via notifyAndEmit
if (!window.__storeListenerRegistered) {
  window.__storeListenerRegistered = true;
  window.addEventListener("store-updated", notifyListeners);
}

// Cross-tab sync: notify other tabs when active form changes
let broadcastChannel = null;
function openBroadcastChannel() {
  if (broadcastChannel) return; // already open
  try {
    broadcastChannel = new BroadcastChannel("beeri-wc-sync");
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === "activeForm-changed") {
        // Another tab changed the active form — re-read from localStorage
        notifyAndEmit("activeForm");
      }
    };
  } catch {
    // BroadcastChannel not supported — graceful fallback (no cross-tab sync)
  }
}
function closeBroadcastChannel() {
  try { broadcastChannel?.close(); } catch { /* already closed */ }
  broadcastChannel = null;
}
openBroadcastChannel();

// ============ USERS ============

const EMPTY_OBJ = {};
const DEFAULT_BONUSES = { champion: null, topScorers: [] };
const DEFAULT_SETTINGS = { predictionsLocked: false };

export function getUsers() {
  return cache.users || EMPTY_OBJ;
}

let lastEnsuredUid = null;
// A1: bounded retry counter per uid. Prevents infinite loop when the write
// keeps failing for a permanent reason (rule violation we can't fix client-side).
const ensureRetryCount = new Map();
const MAX_ENSURE_RETRIES = 3;
let ensureInFlight = null; // single-flight guard across parallel renders

export async function ensureUserInStore(uid, displayName, email) {
  if (!cache._ready.users) return uid;
  // Skip if we already succeeded for this uid (cache has the user).
  if (lastEnsuredUid === uid && getUsers()[uid]) return uid;
  // Single-flight guard — parallel render cycles must not double-write.
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = doEnsureUserInStore(uid, displayName, email).finally(() => {
    ensureInFlight = null;
  });
  return ensureInFlight;
}

async function doEnsureUserInStore(uid, displayName, email) {
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
  //   B) Genuinely new user (or recreated after deletion) — not in Firestore.
  //      A per-field update would be REJECTED by Firestore rules: new entries
  //      require `isAdmin == false` in the resulting document. Without that,
  //      the SDK reverts the optimistic cache and the user vanishes — App.jsx
  //      then renders an infinite Loading screen because user becomes null.
  // Disambiguate with a one-shot read (cheap, only on login) before writing.
  let firestoreUser = null;
  try {
    const snap = await withTimeout(getDoc(gameDocRef("users")), 10000);
    if (snap.exists()) firestoreUser = snap.data().data?.[uid] || null;
  } catch (err) {
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
    // Case A: per-field update preserves existing fields (isAdmin, names, etc.).
    // Don't overwrite displayName — preserve the user's custom nickname.
    const fields = { id: uid, lastLoginAt: now };
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

export function updateUser(userId, fields) {
  if (!getUsers()[userId]) return;
  updateUserField(userId, fields);
}

export async function updateUserProfile(uid, profileFields) {
  if (!getUsers()[uid]) return false;
  const { firstName, lastName, displayName, profileCompleted } = profileFields;
  const fields = {};
  if (firstName !== undefined) fields.firstName = firstName;
  if (lastName !== undefined) fields.lastName = lastName;
  if (displayName !== undefined) fields.displayName = displayName;
  if (profileCompleted !== undefined)
    fields.profileCompleted = profileCompleted;
  if (Object.keys(fields).length === 0) return true;
  return await updateUserField(uid, fields);
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

/**
 * Set admin custom claim via server-side Netlify function.
 * This sets Firebase Custom Claims (tamper-proof) and updates Firestore.
 * Returns { success, error } object.
 */
export async function setAdminClaim(targetUid, action) {
  if (!requireAdmin()) return { error: "Not admin" };
  try {
    const { auth: firebaseAuth } = await import("./firebase.js");
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
  } catch (err) {
    console.error("setAdminClaim error:", err);
    return { error: err.message };
  }
}

export async function deleteUser(userId) {
  if (!requireAdmin()) return;
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

// Defense-in-depth: client-side admin guard (Firestore rules are the real security layer)
function requireAdmin() {
  const u = getCurrentUser();
  if (!u?.isAdmin) {
    console.warn("Admin operation blocked: user is not admin");
    return false;
  }
  return true;
}

export function setCurrentUser(userId) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userId));
  notifyAndEmit("currentUser");
}

export function logoutUser() {
  flushPendingWrites();
  lastEnsuredUid = null;
  ensureRetryCount.clear();
  tokenRefreshedFor.clear();
  listenersInitialized = false;
  listenersHadError = false;
  for (const key of Object.keys(retryState)) delete retryState[key];
  clearTimeout(upgradeTimer);
  upgradeTimer = null;
  closeBroadcastChannel();
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
  try { broadcastChannel?.postMessage({ type: "activeForm-changed" }); } catch {}
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
  if (getSettings().predictionsLocked) {
    throw new Error("ההגשה נסגרה — לא ניתן ליצור טפסים חדשים");
  }
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

  clearPendingWritesForForm(formId);
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
  if (getSettings().predictionsLocked) return;
  const form = getForm(formId);
  if (!form || form.status !== "draft") return;
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
  if (!requireAdmin()) return;
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
  // Firestore rules only allow the owner to transition pending -> draft.
  // A 'submitted' form can only be reopened by an admin (adminReopenForm).
  if (form.status !== "pending") return;
  const updated = {
    ...form,
    status: "draft",
    reopenedAt: new Date().toISOString(),
  };
  writeFormDoc(formId, updated);
}

export function adminForceSubmitForm(formId) {
  if (!requireAdmin()) return;
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
  if (!requireAdmin()) return;
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
  if (!requireAdmin()) return;
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
  if (!requireAdmin()) return;
  flushPendingWrites();
  const form = getForm(formId);
  if (!form) return;
  // userId is immutable — never allow reassignment even by admin
  const { userId: _drop, ...safeFields } = fields;
  const updated = {
    ...form,
    ...safeFields,
    updatedAt: new Date().toISOString(),
  };
  if (fields.adminNote != null) {
    updated.adminEditedAt = new Date().toISOString();
  }
  writeFormDoc(formId, updated);
}

export function adminSaveMatchPrediction(formId, matchId, prediction) {
  if (!requireAdmin()) return;
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
  if (!requireAdmin()) return;
  writeAuditLog("clear-match-results");
  writeGameDoc("matchResults", {}, { force: true });
}

export function getMatchResults() {
  return cache.matchResults || EMPTY_OBJ;
}

export function saveMatchResult(matchId, result) {
  if (!requireAdmin()) return;
  const results = { ...getMatchResults() };
  results[matchId] = { ...result, updatedAt: new Date().toISOString() };
  writeGameDoc("matchResults", results);
}

export function deleteMatchResult(matchId) {
  if (!requireAdmin()) return;
  const results = { ...getMatchResults() };
  delete results[matchId];
  writeGameDoc("matchResults", results);
}

// ============ ACTUAL BONUSES (admin) ============

export function getActualBonuses() {
  return cache.actualBonuses || DEFAULT_BONUSES;
}

export function saveActualBonuses(bonuses) {
  if (!requireAdmin()) return;
  writeGameDoc("actualBonuses", bonuses);
}

// ============ SETTINGS ============

export function getSettings() {
  return cache.settings || DEFAULT_SETTINGS;
}

export function updateSettings(newSettings) {
  if (!requireAdmin()) return;
  const settings = { ...getSettings(), ...newSettings };
  writeGameDoc("settings", settings);
}

// ============ DATA EXPORT/IMPORT ============

export const BACKUP_SCHEMA_VERSION = 1;

export function exportAllData() {
  const users = getUsers();
  const predictions = getAllPredictions();
  const matchResults = getMatchResults();
  return {
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: getCurrentUser()?.id || null,
    counts: {
      users: Object.keys(users).length,
      predictions: Object.keys(predictions).length,
      matchResults: Object.keys(matchResults).length,
    },
    users,
    predictions,
    matchResults,
    actualAdvancing: cache.actualAdvancing || {},
    actualBonuses: getActualBonuses(),
    settings: getSettings(),
  };
}

// Shape check for a backup file — used by the restore UI for preview/validation.
// Returns { ok, errors, counts } where errors is a list of human-readable strings.
export function validateBackupShape(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["הקובץ אינו אובייקט JSON תקין"], counts: null };
  }
  const requiredObjectKeys = ["users", "predictions", "matchResults"];
  for (const k of requiredObjectKeys) {
    if (data[k] == null) {
      errors.push(`חסר השדה "${k}"`);
    } else if (typeof data[k] !== "object" || Array.isArray(data[k])) {
      errors.push(`מבנה לא תקין לשדה "${k}"`);
    }
  }
  const optionalObjectKeys = ["actualAdvancing", "actualBonuses", "settings"];
  for (const k of optionalObjectKeys) {
    if (data[k] != null && (typeof data[k] !== "object" || Array.isArray(data[k]))) {
      errors.push(`מבנה לא תקין לשדה "${k}"`);
    }
  }

  // Validate formIds & userId consistency
  if (data.predictions && typeof data.predictions === "object") {
    const formIdPattern = /^.+__\d+$/;
    let badFormIds = 0;
    let orphanForms = 0;
    const users = data.users && typeof data.users === "object" ? data.users : {};
    for (const [formId, form] of Object.entries(data.predictions)) {
      if (!formIdPattern.test(formId)) badFormIds++;
      if (!form || typeof form !== "object") {
        orphanForms++;
        continue;
      }
      if (form.userId && !users[form.userId]) orphanForms++;
    }
    if (badFormIds > 0) errors.push(`${badFormIds} מזהי טפסים בפורמט לא תקין`);
    if (orphanForms > 0) errors.push(`${orphanForms} טפסים ללא משתמש תואם בקובץ`);
  }

  const counts = {
    users: data.users ? Object.keys(data.users).length : 0,
    predictions: data.predictions ? Object.keys(data.predictions).length : 0,
    matchResults: data.matchResults ? Object.keys(data.matchResults).length : 0,
    actualBonuses: data.actualBonuses ? 1 : 0,
    settings: data.settings ? 1 : 0,
  };

  return { ok: errors.length === 0, errors, counts };
}

export async function clearAllData() {
  if (!requireAdmin()) return;
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
  if (!requireAdmin()) {
    throw new Error("נדרשת הרשאת מנהל");
  }

  const shape = validateBackupShape(data);
  if (!shape.ok) {
    throw new Error(`קובץ גיבוי לא תקין: ${shape.errors.join(", ")}`);
  }

  writeAuditLog("import-data-start", {
    keys: Object.keys(data),
    counts: shape.counts,
  });

  // Preserve admin rights: every user marked `isAdmin: true` in the current
  // live cache stays admin after restore, even if the backup lists them as
  // non-admin (or omits them). This is a safety net — a restore should never
  // accidentally demote existing admins and lock the board out of the system.
  const liveUsers = getUsers();
  const currentAdminIds = Object.keys(liveUsers).filter(
    (uid) => liveUsers[uid]?.isAdmin === true,
  );
  const importedUsers = { ...(data.users || {}) };
  for (const uid of currentAdminIds) {
    if (importedUsers[uid]) {
      importedUsers[uid] = { ...importedUsers[uid], isAdmin: true };
    } else {
      // Admin was not in the backup at all — re-inject their live record.
      importedUsers[uid] = { ...liveUsers[uid], isAdmin: true };
    }
  }

  // Also make sure the current user (the one running the restore) keeps admin.
  const current = getCurrentUser();
  if (current?.id && current?.isAdmin) {
    importedUsers[current.id] = {
      ...(importedUsers[current.id] || liveUsers[current.id] || {
        id: current.id,
        displayName: current.displayName || "מנהל",
      }),
      isAdmin: true,
    };
  }

  const ops = [];

  // gameData single-doc writes
  const gameDocMap = {
    users: importedUsers,
    matchResults: data.matchResults,
    actualAdvancing: data.actualAdvancing,
    actualBonuses: data.actualBonuses,
    settings: data.settings,
  };
  for (const [key, value] of Object.entries(gameDocMap)) {
    if (value != null && typeof value === "object") {
      ops.push({
        type: "set",
        ref: gameDocRef(key),
        data: { data: structuredClone(value) },
      });
    }
  }

  // Predictions: delete existing, then write from backup
  const existing = await getDocs(predictionsCollectionRef);
  existing.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  if (data.predictions) {
    for (const [formId, formData] of Object.entries(data.predictions)) {
      if (!formData || typeof formData !== "object") continue;
      ops.push({
        type: "set",
        ref: formDocRef(formId),
        data: structuredClone(formData),
      });
    }
  }

  try {
    await commitInBatches(ops);
  } catch (err) {
    console.error("Import commit failed:", err);
    captureClientError(err, {
      source: "importAllData.commit",
      code: err?.code,
      counts: shape.counts,
    });
    writeAuditLog("import-data-failed", {
      code: err?.code || null,
      message: err?.message || String(err),
    });
    throw err;
  }

  // Only update cache after Firestore commit succeeds. The realtime listeners
  // will also refresh the cache from the server snapshots — this just makes
  // the UI reflect the new state immediately.
  cache.users = importedUsers;
  if (data.matchResults) cache.matchResults = data.matchResults;
  if (data.actualAdvancing) cache.actualAdvancing = data.actualAdvancing;
  if (data.actualBonuses) cache.actualBonuses = data.actualBonuses;
  if (data.settings) cache.settings = data.settings;
  if (data.predictions) cache.predictions = data.predictions;
  rebuildUserFormIndex();
  notifyAndEmit("users");
  notifyAndEmit("predictions");
  notifyAndEmit("matchResults");
  notifyAndEmit("settings");
  notifyAndEmit("actualBonuses");

  writeAuditLog("import-data-success", { counts: shape.counts });

  return { success: true, counts: shape.counts };
}
