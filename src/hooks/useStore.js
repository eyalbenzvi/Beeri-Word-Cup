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

  const addUser = useCallback((name, phone) => {
    return store.addUser(name, phone);
  }, []);

  return { user, login, logout, addUser };
}

export function useUsers() {
  useStoreUpdates();
  return store.getUsers();
}

export function useUserPredictions(userId) {
  useStoreUpdates();
  if (!userId) return {};
  return store.getUserPredictions(userId);
}

export function useFullUserPredictions(userId) {
  useStoreUpdates();
  if (!userId) return { matches: {}, advancing: {}, champion: null, topScorer: '' };
  return store.getFullUserPredictions(userId);
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
