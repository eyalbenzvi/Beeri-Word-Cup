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
const AUTH_WATCHDOG_MS = 8000;
const STORE_WATCHDOG_MS = 15000;
const USER_WATCHDOG_MS = 15000;

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

const EMPTY_FORMS = [];

export function useUserForms(userId) {
  const cacheRef = useRef(EMPTY_FORMS);
  const getSnapshot = useCallback(() => {
    if (!userId) return EMPTY_FORMS;
    const next = store.getFormsForUser(userId);
    if (
      cacheRef.current.length === next.length &&
      cacheRef.current.every(
        (f, i) =>
          f.formId === next[i].formId &&
          f.status === next[i].status &&
          f.formName === next[i].formName &&
          Object.keys(f.matches || {}).length ===
            Object.keys(next[i].matches || {}).length,
      )
    ) {
      return cacheRef.current;
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
