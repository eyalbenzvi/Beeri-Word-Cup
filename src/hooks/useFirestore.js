import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';

// Get all match results (actual results entered by admin)
export function useMatchResults() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'matchResults'),
      (snapshot) => {
        const data = {};
        snapshot.forEach((doc) => {
          data[doc.id] = doc.data();
        });
        setResults(data);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { results, loading };
}

// Get predictions for a specific user
export function useUserPredictions(userId) {
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'predictions', userId),
      (docSnap) => {
        if (docSnap.exists()) {
          setPredictions(docSnap.data().matches || {});
        }
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [userId]);

  return { predictions, loading };
}

// Get all users' predictions (for leaderboard)
export function useAllPredictions() {
  const [allPredictions, setAllPredictions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'predictions'),
      (snapshot) => {
        const data = {};
        snapshot.forEach((doc) => {
          data[doc.id] = doc.data();
        });
        setAllPredictions(data);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { allPredictions, loading };
}

// Get all user profiles
export function useAllUsers() {
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const data = {};
        snapshot.forEach((doc) => {
          data[doc.id] = doc.data();
        });
        setUsers(data);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { users, loading };
}

// Save a match prediction
export async function savePrediction(userId, matchId, prediction) {
  const predRef = doc(db, 'predictions', userId);
  const predSnap = await getDoc(predRef);

  if (predSnap.exists()) {
    await updateDoc(predRef, {
      [`matches.${matchId}`]: prediction,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await setDoc(predRef, {
      userId,
      matches: { [matchId]: prediction },
      updatedAt: new Date().toISOString(),
    });
  }
}

// Save actual match result (admin only)
export async function saveMatchResult(matchId, result) {
  await setDoc(doc(db, 'matchResults', matchId), {
    ...result,
    updatedAt: new Date().toISOString(),
  });
}

// Get tournament settings
export function useTournamentSettings() {
  const [settings, setSettings] = useState({
    predictionsLocked: false,
    tournamentStarted: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'tournament'),
      (docSnap) => {
        if (docSnap.exists()) {
          setSettings(docSnap.data());
        }
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { settings, loading };
}

export async function updateTournamentSettings(settings) {
  await setDoc(doc(db, 'settings', 'tournament'), settings, { merge: true });
}
