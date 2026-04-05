import { useState, useEffect, useCallback } from 'react';
import * as store from '../store';

// Hook that re-renders when Firestore data changes (via store-updated events)
function useStoreUpdates() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener('store-updated', handler);
    return () => {
      window.removeEventListener('store-updated', handler);
    };
  }, []);
}

export function useStoreReady() {
  useStoreUpdates();
  return store.isStoreReady();
}

export function useCurrentUser() {
  useStoreUpdates();
  const user = store.getCurrentUser();

  const login = useCallback((userId) => {
    store.setCurrentUser(userId);
  }, []);

  const logout = useCallback(() => {
    store.logoutUser();
  }, []);

  const addUser = useCallback((name, password) => {
    return store.addUser(name, password);
  }, []);

  return { user, login, logout, addUser };
}

export function useUsers() {
  useStoreUpdates();
  return store.getUsers();
}

// Get all forms for a specific user
export function useUserForms(userId) {
  useStoreUpdates();
  if (!userId) return [];
  return store.getFormsForUser(userId);
}

// Get the currently active form ID (from localStorage)
export function useActiveFormId() {
  useStoreUpdates();
  return store.getActiveFormId();
}

// Get a specific form's full data
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
