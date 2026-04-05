import { useState, useEffect, useCallback } from 'react';
import * as store from '../store';

// Hook that re-renders when localStorage changes
function useStoreUpdates() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener('store-updated', handler);
    // Also listen for changes from other tabs
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('store-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
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

  const addUser = useCallback((name) => {
    return store.addUser(name);
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

export function useAllPredictions() {
  useStoreUpdates();
  return store.getAllPredictions();
}

export function useMatchResults() {
  useStoreUpdates();
  return store.getMatchResults();
}

export function useSettings() {
  useStoreUpdates();
  return store.getSettings();
}
