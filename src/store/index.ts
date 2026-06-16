// Public API barrel for the store. Every consumer outside `src/store/`
// imports from `"../store"` (no extension); Vite + the test loaders both
// resolve that to this file.
//
// The store is split into focused modules:
//   - firestoreClient.ts — db/auth, doc + collection refs, batched writes,
//     withTimeout, safeClone, token-refresh helper.
//   - cache.ts — singleton in-memory state, dispatch + subscribe primitives,
//     readiness gate, BroadcastChannel.
//   - audit.ts — local + Firestore audit-log glue.
//   - usersRepo.ts — read accessors + dual-write across legacy users +
//     userDirectory + userPrivate, admin mutators.
//   - summariesRepo.ts — blog/summary CRUD + validators.
//   - predictionsRepo.ts — per-form CRUD, debounced + flush writes,
//     userFormIndex, active-form storage, admin mutators.
//   - publicMode.ts — logged-out blog mode (init + watchdog + fetchers).
//   - listeners.ts — realtime Firestore listeners + retry + fallback.
//   - resultsRepo.ts — admin writes for matchResults / actualBonuses /
//     settings.
//   - backupRestore.ts — admin export / import / clearAllData.
//
// Only `logoutUser` lives here as orchestration that touches every
// module's reset hook in dependency order.

import { tokenRefreshedAt } from "./firestoreClient";
import {
  cache,
  notifyAndEmit,
  closeBroadcastChannel,
} from "./cache";
import {
  resetEnsureUserState,
} from "./usersRepo";
import {
  rebuildUserFormIndex,
  flushPendingWrites,
} from "./predictionsRepo";
import { teardownListeners } from "./listeners";
import { maybeTriggerAutoFill } from "./autoFill";
import { registerAutoFillTrigger } from "../utils/autoFillTrigger";

// Register the real (Firebase-backed) auto-fill trigger so that the pure
// compute utilities (scoring.ts, bracket.ts) can poke it via the
// dependency-free indirection without importing Firebase. Loading the store
// barrel (which the app does at init) performs this wiring; the test harness
// imports the pure utils directly and never registers, so the trigger stays a
// no-op there.
registerAutoFillTrigger(maybeTriggerAutoFill);

// Public API re-exports.
export { commitInBatches } from "./firestoreClient";
export { logAdminAction, getAuditLog } from "./audit";
export {
  isStoreReady,
  getMissingReadyKeys,
  subscribe,
  subscribeToKey,
} from "./cache";
export {
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
} from "./usersRepo";
export {
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
export {
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
  adminTransferForm,
} from "./predictionsRepo";
export { initPublicReadonlyMode } from "./publicMode";
export { initRealtimeListeners, retryRealtimeListeners } from "./listeners";
export {
  clearMatchResults,
  getMatchResults,
  saveMatchResult,
  deleteMatchResult,
  getActualBonuses,
  saveActualBonuses,
  getSettings,
  isSettingsReady,
  updateSettings,
} from "./resultsRepo";
export { maybeTriggerAutoFill } from "./autoFill";
export {
  BACKUP_SCHEMA_VERSION,
  exportAllData,
  validateBackupShape,
  clearAllData,
  importAllData,
} from "./backupRestore";

import { CURRENT_USER_KEY, ACTIVE_FORM_KEY } from "../constants/storageKeys";

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
