import { useState, useEffect, useCallback } from 'react';
import * as store from '../store';
import { auth, firebaseSignOut, onAuthStateChanged } from '../firebase';

// Hook that re-renders when Firestore data changes (via store-updated events)
function useStoreUpdates() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener('store-updated', handler);
    return () => window.removeEventListener('store-updated', handler);
  }, []);
}

export function useStoreReady() {
  useStoreUpdates();
  return store.isStoreReady();
}

export function useCurrentUser() {
  useStoreUpdates();
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      setAuthReady(true);
      if (fbUser) {
        // Sync Firebase Auth user to localStorage for store compatibility
        store.setCurrentUser(fbUser.uid);
        store.ensureUserInStore(fbUser.uid, fbUser.displayName || fbUser.phoneNumber || 'משתמש');
      } else {
        store.logoutUser();
      }
    });
    return unsubscribe;
  }, []);

  // Get enriched user from Firestore (has isAdmin, etc.)
  const user = firebaseUser ? store.getUser(firebaseUser.uid) : null;

  const logout = useCallback(async () => {
    await firebaseSignOut();
    store.logoutUser();
  }, []);

  return { user, logout, authReady };
}

export function useUsers() {
  useStoreUpdates();
  return store.getUsers();
}

export function useUserForms(userId) {
  useStoreUpdates();
  if (!userId) return [];
  return store.getFormsForUser(userId);
}

export function useActiveFormId() {
  useStoreUpdates();
  return store.getActiveFormId();
}

export function useFormData(formId) {
  useStoreUpdates();
  if (!formId) return { matches: {}, advancing: {}, champion: null, topScorer: '', status: 'draft' };
  return store.getForm(formId) || { matches: {}, advancing: {}, champion: null, topScorer: '', status: 'draft' };
}

export function useAllPredictions() {
  useStoreUpdates();
  return store.getAllPredictions();
}

export function useMatchResults() {
  useStoreUpdates();
  return store.getMatchResults();
}

export function useActualAdvancing() {
  useStoreUpdates();
  return store.getActualAdvancing();
}

export function useActualBonuses() {
  useStoreUpdates();
  return store.getActualBonuses();
}

export function useSettings() {
  useStoreUpdates();
  return store.getSettings();
}
