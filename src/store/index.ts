import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  getDocs,
  query,
  where,
  addDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import { captureClientError, captureClientMessage } from "../sentry";
import { generateDefaultFormName } from "../utils/formNameGenerator";
import {
  db,
  auth,
  DOCS,
  gameDocRef,
  formDocRef,
  predictionsCollectionRef,
  summaryDocRef,
  summariesCollectionRef,
  userPrivateDocRef,
  userPrivateCollectionRef,
  userDirectoryDocRef,
  commitInBatches,
  withTimeout,
  safeClone,
  tokenRefreshedAt,
  maybeRefreshToken,
} from "./firestoreClient";
import { logAdminAction, getAuditLog, writeAuditLog } from "./audit";
import {
  cache,
  notifyAndEmit,
  emitSaving,
  emitSaved,
  emitWriteError,
  isStoreReady,
  getMissingReadyKeys,
  subscribe,
  subscribeToKey,
  openBroadcastChannel,
  closeBroadcastChannel,
  broadcastActiveFormChange,
} from "./cache";
import {
  getUsers,
  getUserDirectory,
  getUserPrivate,
  getUserPrivateMap,
  isUserPrivateReady,
  getUser,
  getCurrentUser,
  setCurrentUser,
  requireAdmin,
  ensureUserInStore,
  resetEnsureUserState,
  getLastEnsuredUid,
  clearLastEnsuredUid,
  updateUser,
  updateUserProfile,
  touchUserLogin,
  demoteAdmin,
  setAdminClaim,
  deleteUser,
  writeGameDoc,
  updateUserField,
  createUserField,
  removeUserField,
  pickKnown,
  DIRECTORY_FIELDS,
  USER_PRIVATE_FIELDS,
} from "./usersRepo";
import {
  getSummaries,
  isSummariesReady,
  getSummary,
  getPublishedSummariesSorted,
  getLatestPublishedSummary,
  getSummaryByNumber,
  getCoveredMatchIds,
  SUMMARY_LIMITS,
  createSummary,
  updateSummary,
  publishSummary,
  unpublishSummary,
  deleteSummary,
} from "./summariesRepo";
import {
  rebuildUserFormIndex,
  getAllPredictions,
  getFormsForUser,
  getForm,
  clearPendingWritesForForm,
  flushPendingWrites,
  hasPendingWrites,
  setActiveFormId,
  getActiveFormId,
  createForm,
  deleteForm,
  updateFormDetails,
  savePrediction,
  savePredictionsBatch,
  saveBonusPrediction,
  submitPredictions,
  reopenForm,
  adminApprovePrediction,
  adminForceSubmitForm,
  adminReopenForm,
  adminDeleteForm,
  adminUpdateForm,
  adminSaveMatchPrediction,
} from "./predictionsRepo";
import {
  initPublicReadonlyMode,
  teardownPublicReadonlyMode,
} from "./publicMode";

export {
  commitInBatches,
  logAdminAction,
  getAuditLog,
  isStoreReady,
  getMissingReadyKeys,
  subscribe,
  subscribeToKey,
  getUsers,
  getUserDirectory,
  getUserPrivate,
  getUserPrivateMap,
  isUserPrivateReady,
  getUser,
  getCurrentUser,
  setCurrentUser,
  ensureUserInStore,
  updateUser,
  updateUserProfile,
  touchUserLogin,
  demoteAdmin,
  setAdminClaim,
  deleteUser,
  getSummaries,
  isSummariesReady,
  getSummary,
  getPublishedSummariesSorted,
  getLatestPublishedSummary,
  getSummaryByNumber,
  getCoveredMatchIds,
  SUMMARY_LIMITS,
  createSummary,
  updateSummary,
  publishSummary,
  unpublishSummary,
  deleteSummary,
  getAllPredictions,
  getFormsForUser,
  getForm,
  clearPendingWritesForForm,
  hasPendingWrites,
  setActiveFormId,
  getActiveFormId,
  createForm,
  deleteForm,
  updateFormDetails,
  savePrediction,
  savePredictionsBatch,
  saveBonusPrediction,
  submitPredictions,
  reopenForm,
  adminApprovePrediction,
  adminForceSubmitForm,
  adminReopenForm,
  adminDeleteForm,
  adminUpdateForm,
  adminSaveMatchPrediction,
  initPublicReadonlyMode,
};

const CURRENT_USER_KEY = "wc2026_currentUser";
const ACTIVE_FORM_KEY = "wc2026_activeForm";

import { MAX_FORMS_PER_USER as FORMS_LIMIT } from "../utils/constants";

// Reverts cache.predictions[formId] back to a pre-write snapshot. Only used
// for terminal errors (`permission-denied`) where the listener will never
// auto-correct, since the server rejected the change and nothing changed
// ============ REALTIME LISTENERS ============

let listenersInitialized = false;
let listenersHadError = false;
let windowListenersAttached = false;
let currentListenerUserId = null;
let predictionsUnsub = null;
let predictionsShowAll = false;
let gameDocUnsubs = [];
let predictionsListenerGeneration = 0;
let summariesUnsub = null;
let userPrivateUnsub = null;
const retryState = {}; // key -> { count, inProgress }

function getRetryState(key) {
  if (!retryState[key]) retryState[key] = { count: 0, inProgress: false };
  return retryState[key];
}

// Compute backoff delay: 2s, 4s, 8s, 16s, 30s, 30s, 30s, ...
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;
function retryDelay(attempt) {
  return Math.min(RETRY_BASE_MS * Math.pow(2, attempt), RETRY_MAX_MS);
}

// Transient permission-denied on listeners/reads is expected on iOS Safari
// (ITP invalidating the Firebase Auth IndexedDB store) and during admin /
// lock-state churn. The retry + token-refresh + fallback path handles it
// silently; this helper routes to captureClientMessage so one deduped event
// per session surfaces persistent cases without spamming Sentry.
function reportListenerError(err, source, context = {}) {
  if (err?.code === "permission-denied") {
    captureClientMessage(`${source}-permission-denied`, { ...context, code: err?.code }, "warning");
    return;
  }
  captureClientError(err, { source, ...context, code: err?.code });
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
    reportListenerError(err, "fallbackLoadGameDoc", {
      key,
      docName,
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
    reportListenerError(err, "fallbackLoadPredictions", {
      userId,
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
      reportListenerError(err, "predictionsListener", {
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

// PII migration Phase B: prefer userPrivate.isAdmin (new source of truth);
// fall back to legacy users for clients that haven't received userPrivate
// yet. Both should agree post-migration; the OR is belt-and-braces during
// the rollout window where one listener may have landed before the other.
function isCurrentUserAdmin() {
  const uid = currentListenerUserId;
  if (!uid) return false;
  return (
    cache.userPrivate?.[uid]?.isAdmin === true ||
    cache.users?.[uid]?.isAdmin === true
  );
}

let upgradeTimer = null;
function maybeUpgradePredictionsListener() {
  if (predictionsShowAll || !currentListenerUserId) return;
  // Debounce: settings, users, and userPrivate may fire in quick succession
  clearTimeout(upgradeTimer);
  upgradeTimer = setTimeout(() => {
    if (predictionsShowAll || !currentListenerUserId) return;
    const isLocked = cache.settings?.predictionsLocked === true;
    if (isCurrentUserAdmin() || isLocked) {
      setupPredictionsListener(currentListenerUserId, true);
    }
  }, 100);
}

export function initRealtimeListeners(userId) {
  // Only restart if first time or if previous attempt had errors
  if (listenersInitialized && !listenersHadError) return;
  // If the visitor was in public-readonly mode (shared blog link), tear that
  // down before we graduate to a full authenticated listener set.
  teardownPublicReadonlyMode();
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
          const ensuredUid = getLastEnsuredUid();
          if (key === "users" && ensuredUid) {
            const stillThere = (cache.users || {})[ensuredUid];
            const wasThere = prevUsers && prevUsers[ensuredUid];
            if (wasThere && !stillThere) {
              captureClientMessage("user-cache-reverted", {
                uid: ensuredUid,
                userCount: Object.keys(cache.users || {}).length,
              });
              clearLastEnsuredUid();
            }
          }
          notifyAndEmit(key);
          // When settings or users load, check if we should upgrade to all predictions
          if (key === "settings" || key === "users") {
            maybeUpgradePredictionsListener();
          }
          if (key === "users") {
            maybeUpgradeSummariesListener();
          }
        },
        (err) => {
          // PII migration Phase B: gameData/users is admin-only. Non-admin
          // clients receive permission-denied here on every login. Treat
          // this as expected — flip ready so isStoreReady() doesn't block,
          // and DON'T retry. cache.users stays empty {}; admin tabs are
          // gated by requireAdmin() and never render for non-admins
          // anyway. Other docs in the loop still treat permission-denied
          // as a real error.
          if (key === "users" && err?.code === "permission-denied") {
            cache._ready[key] = true;
            notifyAndEmit(key);
            // Still call maybeUpgrade* so the predictions/summaries
            // listeners can decide based on userPrivate.isAdmin once
            // that listener fires.
            maybeUpgradePredictionsListener();
            maybeUpgradeSummariesListener();
            return;
          }
          console.error(`Listener error for ${docName}:`, err);
          reportListenerError(err, "gameDocListener", {
            docName,
            key,
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

  // Summaries listener — all summaries (reads filtered server-side by rules:
  // published for everyone, drafts only for admins)
  setupSummariesListener();

  // PII migration Phase A: own private record listener.
  setupUserPrivateListener(userId);
}

// The Firestore rule allows non-admins to read only `status == 'published'`
// docs. A list query that could return a draft gets rejected outright by
// Firestore (rules can't filter — they gate the whole query). So non-admins
// must constrain the query to published, and admins can read everything.
// We re-subscribe whenever the admin flag flips (e.g. after users doc loads
// or admin-claim changes).
let summariesShowAll = false;
// ============ PUBLIC (LOGGED-OUT) MODE ============
// (init / teardown / fetch helpers live in ./publicMode and are
// re-exported via the import block at the top of this file.)

function setupSummariesListener() {
  if (summariesUnsub) summariesUnsub();
  const isUserAdmin = isCurrentUserAdmin();
  summariesShowAll = isUserAdmin;
  const q = isUserAdmin
    ? summariesCollectionRef
    : query(summariesCollectionRef, where("status", "==", "published"));
  summariesUnsub = onSnapshot(
    q,
    (snapshot) => {
      getRetryState("summaries").count = 0;
      const map = {};
      snapshot.forEach((docSnap) => {
        map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      cache.summaries = map;
      cache._ready.summaries = true;
      notifyAndEmit("summaries");
    },
    (err) => {
      console.error("Listener error for summaries:", err);
      reportListenerError(err, "summariesListener", {
        retryCount: getRetryState("summaries").count,
      });
      maybeRefreshToken(err);
      // Non-fatal: summaries are optional; mark ready so UI doesn't block.
      cache._ready.summaries = true;
      notifyAndEmit("summaries");
    },
  );
}

function maybeUpgradeSummariesListener() {
  if (!currentListenerUserId) return;
  if (isCurrentUserAdmin() !== summariesShowAll) {
    setupSummariesListener();
  }
}

// PII migration Phase A: per-uid listener for the user's own private record.
// Read access is owner-or-admin per firestore.rules, so non-admins see
// exactly one doc here. The doc may not exist for users who haven't been
// migrated or backfilled yet — that's fine; cache stays empty and ready
// flips to true so isStoreReady() doesn't block the UI.
function setupUserPrivateListener(userId) {
  if (userPrivateUnsub) {
    userPrivateUnsub();
    userPrivateUnsub = null;
  }
  if (!userId) {
    cache._ready.userPrivate = true;
    notifyAndEmit("userPrivate");
    return;
  }
  const ref = userPrivateDocRef(userId);
  userPrivateUnsub = onSnapshot(
    ref,
    (snap) => {
      getRetryState("userPrivate").count = 0;
      if (snap.exists()) {
        cache.userPrivate = { ...cache.userPrivate, [userId]: snap.data() };
      } else {
        // Doc doesn't exist yet — leave any existing cache entry alone
        // (a previous session may have written it; or migration hasn't run).
        // Just flip ready so the UI proceeds.
      }
      cache._ready.userPrivate = true;
      notifyAndEmit("userPrivate");
      // Phase B: userPrivate.isAdmin is the new source of truth for the
      // upgrade decisions. Re-evaluate now that admin status is known.
      maybeUpgradePredictionsListener();
      maybeUpgradeSummariesListener();
    },
    (err) => {
      console.error("Listener error for userPrivate:", err);
      reportListenerError(err, "userPrivateListener", {
        retryCount: getRetryState("userPrivate").count,
      });
      maybeRefreshToken(err);
      // Non-fatal during compat: legacy users doc still has the same data.
      cache._ready.userPrivate = true;
      notifyAndEmit("userPrivate");
    },
  );
}

// ============ USERS ============
// (read accessors + write helpers + admin ops live in ./usersRepo and
// are re-exported via the import block at the top of this file.)

const DEFAULT_BONUSES = { champion: null, topScorers: [] };
const DEFAULT_SETTINGS: Record<string, any> = { predictionsLocked: false };
const EMPTY_OBJ: Record<string, any> = {};

export function logoutUser() {
  flushPendingWrites();
  resetEnsureUserState();
  tokenRefreshedAt.clear();
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
  if (summariesUnsub) {
    summariesUnsub();
    summariesUnsub = null;
  }
  if (userPrivateUnsub) {
    userPrivateUnsub();
    userPrivateUnsub = null;
  }
  gameDocUnsubs.forEach((u) => u());
  gameDocUnsubs = [];
  currentListenerUserId = null;
  // Reset cache to prevent stale data after re-login
  cache.users = {};
  cache.userDirectory = {};
  cache.userPrivate = {};
  cache.predictions = {};
  cache.matchResults = {};
  cache.actualAdvancing = {};
  cache.actualBonuses = { champion: null, topScorers: [] };
  cache.settings = { predictionsLocked: false };
  cache.summaries = {};
  cache._ready = {};
  rebuildUserFormIndex();
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  notifyAndEmit("currentUser");
}

// ============ PREDICTIONS / ACTIVE FORM ============
// (read accessors + form CRUD + admin mutators + the userFormIndex +
// active-form storage live in ./predictionsRepo and are re-exported via
// the import block at the top of this file.)

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

// Whether the settings doc has been fetched at least once (authenticated
// listener landed, or public-readonly endpoint resolved). Used by the blog
// page so an unauth visitor doesn't briefly see the pre-tournament empty
// state during the public-settings fetch window — instead we show the
// loading state until we actually know predictionsLocked.
export function isSettingsReady() {
  return !!cache._ready.settings;
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
      if ((form as any).userId && !users[(form as any).userId]) orphanForms++;
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

  // Delete all form documents and all userPrivate docs using batched operations.
  // PII migration Phase A: also clears userDirectory + userPrivate so a
  // subsequent restore (or a fresh tournament) starts from a clean slate.
  const [predsSnap, privateSnap] = await Promise.all([
    getDocs(predictionsCollectionRef),
    getDocs(userPrivateCollectionRef),
  ]);
  const ops = [];
  predsSnap.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  privateSnap.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  ops.push({ type: "set", ref: gameDocRef("users"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("userDirectory"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("matchResults"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("actualAdvancing"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("actualBonuses"), data: { data: { champion: null, topScorers: [] } } });
  ops.push({ type: "set", ref: gameDocRef("settings"), data: { data: { predictionsLocked: false } } });
  await commitInBatches(ops);

  cache.users = {};
  cache.userDirectory = {};
  cache.userPrivate = {};
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

  // PII migration Phase A: derive userDirectory + userPrivate from the
  // imported (admin-preserved) users blob. Backups predate the split so
  // they only carry the legacy users doc; we re-derive the new shapes on
  // every import. This means a v1 backup round-trips correctly and admins
  // never have to think about the split structure when restoring.
  const importedDirectory = {};
  const importedUserPrivate = {}; // uid -> private record
  for (const [uid, u] of Object.entries(importedUsers)) {
    if (!u || typeof u !== "object") continue;
    importedDirectory[uid] = pickKnown(u, DIRECTORY_FIELDS);
    importedUserPrivate[uid] = pickKnown(u, USER_PRIVATE_FIELDS);
  }

  const ops = [];

  // gameData single-doc writes (legacy + directory)
  const gameDocMap = {
    users: importedUsers,
    userDirectory: importedDirectory,
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

  // userPrivate: delete existing collection, then write derived per-uid docs
  const existingPrivate = await getDocs(userPrivateCollectionRef);
  existingPrivate.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  for (const [uid, record] of Object.entries(importedUserPrivate)) {
    ops.push({
      type: "set",
      ref: userPrivateDocRef(uid),
      data: structuredClone(record),
    });
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
  cache.userDirectory = importedDirectory;
  cache.userPrivate = importedUserPrivate;
  if (data.matchResults) cache.matchResults = data.matchResults;
  if (data.actualAdvancing) cache.actualAdvancing = data.actualAdvancing;
  if (data.actualBonuses) cache.actualBonuses = data.actualBonuses;
  if (data.settings) cache.settings = data.settings;
  if (data.predictions) cache.predictions = data.predictions;
  rebuildUserFormIndex();
  notifyAndEmit("users");
  notifyAndEmit("userDirectory");
  notifyAndEmit("userPrivate");
  notifyAndEmit("predictions");
  notifyAndEmit("matchResults");
  notifyAndEmit("settings");
  notifyAndEmit("actualBonuses");

  writeAuditLog("import-data-success", { counts: shape.counts });

  return { success: true, counts: shape.counts };
}

// ============ SUMMARIES (BLOG) ============
// (read accessors + CRUD live in ./summariesRepo and are re-exported via
// the import block at the top of this file.)
