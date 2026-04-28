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
} from "./publicMode";
import {
  initRealtimeListeners,
  teardownListeners,
} from "./listeners";

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
  initRealtimeListeners,
};

const CURRENT_USER_KEY = "wc2026_currentUser";
const ACTIVE_FORM_KEY = "wc2026_activeForm";

// (REALTIME LISTENERS / PUBLIC MODE / SUMMARIES code lives in dedicated
// store/* modules. The orchestration that remains here is logoutUser
// plus the matchResults / settings / actualBonuses admin paths.)
//
// Stray fragment originally from the predictions extraction is removed.
// auto-correct, since the server rejected the change and nothing changed

// ============ USERS ============
// (read accessors + write helpers + admin ops live in ./usersRepo and
// are re-exported via the import block at the top of this file.)

const DEFAULT_BONUSES = { champion: null, topScorers: [] };
const DEFAULT_SETTINGS: Record<string, any> = { predictionsLocked: false };
const EMPTY_OBJ: Record<string, any> = {};

// Coordinates teardown across every store module after Firebase signs the
// user out. Each module exposes a focused reset hook; this function calls
// them in dependency order so a re-login on the same browser starts clean.
export function logoutUser() {
  flushPendingWrites();
  resetEnsureUserState();
  tokenRefreshedAt.clear();
  closeBroadcastChannel();
  teardownListeners();
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
