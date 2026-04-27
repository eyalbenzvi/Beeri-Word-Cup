import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import * as store from "../store";
import { initRealtimeListeners } from "../store";
import { auth, firebaseSignOut, onAuthStateChanged } from "../firebase";
import { setSentryUser, captureClientMessage } from "../sentry";

// Watchdog thresholds — tuned so slow-3G users don't trip them prematurely.
// auth-watchdog covers Firebase Auth init (Safari ITP class of bugs).
// READY_WATCHDOG_MS covers post-auth Firestore listeners — both the "store
// never becomes ready" and the "user-record never lands in cache" paths
// share the same timing envelope, so we keep one constant for both.
const AUTH_WATCHDOG_MS = 8000;
const READY_WATCHDOG_MS = 15000;
const STORE_WATCHDOG_MS = READY_WATCHDOG_MS;
const USER_WATCHDOG_MS = READY_WATCHDOG_MS;

function connectionInfo() {
  try {
    const c = navigator.connection;
    if (!c) return { effectiveType: null, saveData: null };
    return { effectiveType: c.effectiveType || null, saveData: !!c.saveData };
  } catch {
    return { effectiveType: null, saveData: null };
  }
}

function useStoreValue(getSnapshot) {
  return useSyncExternalStore(store.subscribe, getSnapshot);
}

export function useStoreReady() {
  return useStoreValue(store.isStoreReady);
}

export function useCurrentUser() {
  useStoreValue(store.isStoreReady);
  useStoreValue(store.getUsers); // subscribe to user changes so we re-render when a new user is created
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const storeReady = store.isStoreReady();

  useEffect(() => {
    // A6: if Firebase Auth never fires onAuthStateChanged (Safari ITP blocking
    // IndexedDB is the known culprit), we force-resolve authReady so the app
    // shows WelcomeScreen instead of a spinner. We do NOT call signOut —
    // Firebase Auth may recover later; we just stop blocking render.
    const watchdog = setTimeout(() => {
      setAuthReady((prev) => {
        if (prev) return prev;
        captureClientMessage("auth-watchdog-timeout", {
          thresholdMs: AUTH_WATCHDOG_MS,
          ...connectionInfo(),
        });
        return true;
      });
    }, AUTH_WATCHDOG_MS);

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      clearTimeout(watchdog);
      setFirebaseUser(fbUser);
      setAuthReady(true);
      if (fbUser) {
        // (Re-)init Firestore listeners now that we have auth
        initRealtimeListeners(fbUser.uid);
        store.setCurrentUser(fbUser.uid);
        setSentryUser({
          id: fbUser.uid,
          displayName: fbUser.displayName || fbUser.phoneNumber || null,
        });
      } else {
        store.logoutUser();
        setSentryUser(null);
      }
    });
    return () => {
      clearTimeout(watchdog);
      unsubscribe();
    };
  }, []);

  // Single consolidated write when both auth and store are ready
  useEffect(() => {
    if (!storeReady || !firebaseUser) return;
    const isPhoneUser = firebaseUser.uid.startsWith("phone_");
    const phoneName = isPhoneUser ? firebaseUser.uid.replace("phone_", "") : null;
    store.ensureUserInStore(
      firebaseUser.uid,
      firebaseUser.displayName || firebaseUser.phoneNumber || phoneName || "משתמש",
      firebaseUser.email || null,
    );
  }, [storeReady, firebaseUser]);

  // B3: watchdog — store never becomes ready after login. Tells us which
  // listener is missing so we can see which permission/network failure.
  useEffect(() => {
    if (!firebaseUser || storeReady) return;
    const t = setTimeout(() => {
      if (store.isStoreReady()) return;
      captureClientMessage("store-watchdog-timeout", {
        thresholdMs: STORE_WATCHDOG_MS,
        missingKeys: store.getMissingReadyKeys(),
        ...connectionInfo(),
      });
    }, STORE_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [firebaseUser, storeReady]);

  // B3: watchdog — user is logged in + store is ready, but user record never
  // materialized in cache. This is the exact "bouncing ball" class of bug.
  useEffect(() => {
    if (!firebaseUser || !storeReady) return;
    const uid = firebaseUser.uid;
    if (store.getUsers()[uid]) return;
    const t = setTimeout(() => {
      if (store.getUsers()[uid]) return;
      captureClientMessage("user-watchdog-timeout", {
        thresholdMs: USER_WATCHDOG_MS,
        uid,
        userCount: Object.keys(store.getUsers()).length,
        ...connectionInfo(),
      });
    }, USER_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [firebaseUser, storeReady]);

  const user = firebaseUser ? store.getUser(firebaseUser.uid) : null;

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut();
    } finally {
      store.logoutUser();
    }
  }, []);

  return { user, logout, authReady, isLoggedIn: !!firebaseUser };
}

export function useUsers() {
  return useStoreValue(store.getUsers);
}

// PII migration Phase A: prefer this for any consumer that only needs
// {displayName, firstName?, lastName?} — non-admin code paths must
// migrate off useUsers() so the legacy gameData/users read rule can be
// tightened to admin-only.
export function useUserDirectory() {
  return useStoreValue(store.getUserDirectory);
}

const EMPTY_FORMS = [];

// `getFormsForUser` always builds a new array, so without a cache layer
// useSyncExternalStore would re-render every consumer on every store notify,
// even if nothing the user owns changed. Cache compares the inner per-form
// data references — these come straight from `cache.predictions[formId]`,
// which writers replace whenever they mutate (immutable updates). That gives
// us correct invalidation on every actual change (including a single-match
// edit) without false re-renders. The previous "match-count + status" check
// was buggy: editing a single match (same id count) silently kept the cache.
export function useUserForms(userId) {
  const cacheRef = useRef(EMPTY_FORMS);
  const getSnapshot = useCallback(() => {
    if (!userId) return EMPTY_FORMS;
    const next = store.getFormsForUser(userId);
    const prev = cacheRef.current;
    if (
      prev.length === next.length &&
      prev.every((p, i) => p.formId === next[i].formId)
    ) {
      // Same set of formIds — verify each underlying data reference is also
      // identical. Predictions are stored immutably in `cache.predictions`,
      // so reference equality on the per-form fields is a sound proxy for
      // "nothing in this user's forms changed".
      const allSame = prev.every((p, i) => {
        const n = next[i];
        return (
          p.matches === n.matches &&
          p.status === n.status &&
          p.formName === n.formName &&
          p.topScorer === n.topScorer &&
          p.budgetNumber === n.budgetNumber &&
          p.advancing === n.advancing &&
          p.champion === n.champion
        );
      });
      if (allSame) return prev;
    }
    cacheRef.current = next;
    return next;
  }, [userId]);
  return useSyncExternalStore(store.subscribe, getSnapshot);
}

export function useActiveFormId() {
  return useStoreValue(store.getActiveFormId);
}

const EMPTY_FORM = {
  matches: {},
  advancing: {},
  champion: null,
  topScorer: "",
  status: "draft",
};

export function useFormData(formId) {
  const getSnapshot = useCallback(() => {
    if (!formId) return EMPTY_FORM;
    return store.getForm(formId) || EMPTY_FORM;
  }, [formId]);
  return useSyncExternalStore(store.subscribe, getSnapshot);
}

export function useAllPredictions() {
  return useStoreValue(store.getAllPredictions);
}

export function useMatchResults() {
  return useStoreValue(store.getMatchResults);
}

export function useActualBonuses() {
  return useStoreValue(store.getActualBonuses);
}

export function useSettings() {
  return useStoreValue(store.getSettings);
}

export function useSettingsReady() {
  return useStoreValue(store.isSettingsReady);
}

export function useSummaries() {
  return useStoreValue(store.getSummaries);
}

export function useSummariesReady() {
  return useStoreValue(store.isSummariesReady);
}
