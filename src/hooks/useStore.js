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

function useStoreValue(getSnapshot) {
  return useSyncExternalStore(store.subscribe, getSnapshot);
}

export function useStoreReady() {
  return useStoreValue(store.isStoreReady);
}

export function useCurrentUser() {
  useStoreValue(store.isStoreReady);
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const storeReady = store.isStoreReady();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      setAuthReady(true);
      if (fbUser) {
        // (Re-)init Firestore listeners now that we have auth
        initRealtimeListeners(fbUser.uid);
        store.setCurrentUser(fbUser.uid);
      } else {
        store.logoutUser();
      }
    });
    return unsubscribe;
  }, []);

  // Single consolidated write when both auth and store are ready
  useEffect(() => {
    if (!storeReady || !firebaseUser) return;
    store.ensureUserInStore(
      firebaseUser.uid,
      firebaseUser.displayName || firebaseUser.phoneNumber || "משתמש",
    );
  }, [storeReady, firebaseUser]);

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
