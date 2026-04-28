// Realtime Firestore listeners + their orchestration.
//
// Owns:
//   - Listener-state singletons (currentListenerUserId, gameDocUnsubs,
//     predictionsUnsub, summariesUnsub, userPrivateUnsub, retryState).
//   - retryDelay / scheduleRetry / reportListenerError — backoff +
//     deduped-Sentry helpers shared across every listener.
//   - fallbackLoadGameDoc / fallbackLoadPredictions — one-shot reads for
//     when a listener has failed enough times that we give up on the
//     stream and fall back to a single getDoc.
//   - setupPredictionsListener — own-forms or all-forms (admin / locked).
//   - setupSummariesListener — published-only or all (admin).
//   - setupUserPrivateListener — own-record only.
//   - maybeUpgradePredictionsListener / maybeUpgradeSummariesListener —
//     re-subscribe when admin status flips.
//   - isCurrentUserAdmin — primary admin check, prefers
//     cache.userPrivate (PII migration Phase B source of truth).
//   - initRealtimeListeners — entry point called from useStore on auth.
//   - teardownListeners — used by logoutUser (in the barrel).

import {
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { captureClientError, captureClientMessage } from "../sentry";
import {
  DOCS,
  gameDocRef,
  predictionsCollectionRef,
  summariesCollectionRef,
  userPrivateDocRef,
  withTimeout,
  maybeRefreshToken,
} from "./firestoreClient";
import {
  cache,
  notifyAndEmit,
} from "./cache";
import { rebuildUserFormIndex, flushPendingWrites } from "./predictionsRepo";
import { teardownPublicReadonlyMode } from "./publicMode";
import {
  getLastEnsuredUid,
  clearLastEnsuredUid,
} from "./usersRepo";

// ============ MODULE STATE ============

let listenersInitialized = false;
let listenersHadError = false;
let windowListenersAttached = false;
let currentListenerUserId: string | null = null;
let predictionsUnsub: (() => void) | null = null;
let predictionsShowAll = false;
let gameDocUnsubs: Array<() => void> = [];
let predictionsListenerGeneration = 0;
let summariesUnsub: (() => void) | null = null;
let userPrivateUnsub: (() => void) | null = null;
const retryState: Record<string, { count: number; inProgress: boolean }> = {};

export function getCurrentListenerUserId() {
  return currentListenerUserId;
}

function getRetryState(key: string) {
  if (!retryState[key]) retryState[key] = { count: 0, inProgress: false };
  return retryState[key];
}

// Compute backoff delay: 2s, 4s, 8s, 16s, 30s, 30s, 30s, ...
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;
function retryDelay(attempt: number) {
  return Math.min(RETRY_BASE_MS * Math.pow(2, attempt), RETRY_MAX_MS);
}

// Transient permission-denied on listeners/reads is expected on iOS Safari
// (ITP invalidating the Firebase Auth IndexedDB store) and during admin /
// lock-state churn. The retry + token-refresh + fallback path handles it
// silently; this helper routes to captureClientMessage so one deduped event
// per session surfaces persistent cases without spamming Sentry.
function reportListenerError(err: any, source: string, context: Record<string, any> = {}) {
  if (err?.code === "permission-denied") {
    captureClientMessage(`${source}-permission-denied`, { ...context, code: err?.code }, "warning");
    return;
  }
  captureClientError(err, { source, ...context, code: err?.code });
}

// Fallback: one-shot read when realtime listener fails, then schedule next retry
async function fallbackLoadGameDoc(key: string, docName: string) {
  try {
    const snap = await withTimeout(getDoc(gameDocRef(docName)), 10000);
    if (snap.exists()) (cache as any)[key] = (snap.data() as any).data;
    cache._ready[key] = true;
    getRetryState(key).count = 0;
    notifyAndEmit(key);
    if (key === "settings" || key === "users") {
      maybeUpgradePredictionsListener();
    }
  } catch (err: any) {
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

async function fallbackLoadPredictions(userId: string) {
  try {
    const q = query(predictionsCollectionRef, where("userId", "==", userId));
    const snapshot = await withTimeout(getDocs(q), 15000);
    const preds: Record<string, any> = { ...cache.predictions };
    for (const k of Object.keys(preds)) {
      if (preds[k]?.userId === userId) delete preds[k];
    }
    snapshot.forEach((docSnap) => { preds[docSnap.id] = docSnap.data(); });
    cache.predictions = preds;
    cache._ready.predictions = true;
    getRetryState("predictions").count = 0;
    rebuildUserFormIndex();
    notifyAndEmit("predictions");
  } catch (err: any) {
    console.error("Fallback load failed for predictions:", err);
    reportListenerError(err, "fallbackLoadPredictions", {
      userId,
      retryCount: getRetryState("predictions").count,
    });
    await maybeRefreshToken(err);
    scheduleRetry("predictions", () => fallbackLoadPredictions(userId));
  }
}

function scheduleRetry(key: string, retryFn: () => void) {
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

// ============ PREDICTIONS LISTENER ============

function setupPredictionsListener(userId: string, showAll: boolean) {
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
        const preds: Record<string, any> = {};
        snapshot.forEach((docSnap) => {
          preds[docSnap.id] = docSnap.data();
        });
        cache.predictions = preds;
      } else {
        // Filtered: merge own forms into cache (keep any previously loaded data)
        const preds: Record<string, any> = { ...cache.predictions };
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
    (err: any) => {
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
          setupPredictionsListener(currentListenerUserId!, predictionsShowAll);
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
export function isCurrentUserAdmin() {
  const uid = currentListenerUserId;
  if (!uid) return false;
  return (
    cache.userPrivate?.[uid]?.isAdmin === true ||
    cache.users?.[uid]?.isAdmin === true
  );
}

let upgradeTimer: ReturnType<typeof setTimeout> | null = null;
function maybeUpgradePredictionsListener() {
  if (predictionsShowAll || !currentListenerUserId) return;
  // Debounce: settings, users, and userPrivate may fire in quick succession
  if (upgradeTimer) clearTimeout(upgradeTimer);
  upgradeTimer = setTimeout(() => {
    if (predictionsShowAll || !currentListenerUserId) return;
    const isLocked = cache.settings?.predictionsLocked === true;
    if (isCurrentUserAdmin() || isLocked) {
      setupPredictionsListener(currentListenerUserId, true);
    }
  }, 100);
}

// ============ INIT ENTRY ============

export function initRealtimeListeners(userId: string) {
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
      } else if (document.visibilityState === "visible" && currentListenerUserId) {
        // Tab became visible — retry loading if we hadn't fully loaded yet.
        // The check is done via the current readiness state via
        // hadError flag below; we re-init when the gate reports missing keys.
        if (Object.values(cache._ready).some((v) => !v)) {
          listenersHadError = true;
          initRealtimeListeners(currentListenerUserId);
        }
      }
    });
    window.addEventListener("pagehide", flushPendingWrites);
    // When network comes back online, retry if anything still missing
    window.addEventListener("online", () => {
      if (currentListenerUserId && Object.values(cache._ready).some((v) => !v)) {
        listenersHadError = true;
        initRealtimeListeners(currentListenerUserId);
      }
    });
  }

  // Reopen cross-tab sync channel (closed during logout)
  // Imported lazily here to avoid a static cycle with cache.ts; see
  // cache.openBroadcastChannel for the implementation.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // (We use the already-imported function.)
  // (intentionally inline)
  openBroadcastChannelLocal();

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
          if (snap.exists()) (cache as any)[key] = (snap.data() as any).data;
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
        (err: any) => {
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
              initRealtimeListeners(currentListenerUserId!);
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

  // Summaries listener — all summaries (reads filtered server-side by rules)
  setupSummariesListener();

  // PII migration Phase A: own private record listener.
  setupUserPrivateListener(userId);
}

// Avoid a static cycle with cache.ts by re-exposing openBroadcastChannel
// through a thin local function. cache.ts is already loaded by the time
// initRealtimeListeners runs, so the dynamic import is cheap.
import { openBroadcastChannel } from "./cache";
function openBroadcastChannelLocal() {
  openBroadcastChannel();
}

// ============ SUMMARIES LISTENER ============

let summariesShowAll = false;

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
      const map: Record<string, any> = {};
      snapshot.forEach((docSnap) => {
        map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      cache.summaries = map;
      cache._ready.summaries = true;
      notifyAndEmit("summaries");
    },
    (err: any) => {
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

// ============ USER PRIVATE LISTENER ============
//
// PII migration Phase A: per-uid listener for the user's own private
// record. Read access is owner-or-admin per firestore.rules, so non-admins
// see exactly one doc here.

function setupUserPrivateListener(userId: string) {
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
    (err: any) => {
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

// ============ TEARDOWN ============
//
// Coordinated by logoutUser() in the barrel; each module exposes its own
// reset hook.

export function teardownListeners() {
  listenersInitialized = false;
  listenersHadError = false;
  for (const key of Object.keys(retryState)) delete retryState[key];
  if (upgradeTimer) {
    clearTimeout(upgradeTimer);
    upgradeTimer = null;
  }
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
}
