import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyClBCMln44vz46xiloR2EakCIVdOMA0EVs",
  authDomain: "beeri-world-cup.firebaseapp.com",
  projectId: "beeri-world-cup",
  storageBucket: "beeri-world-cup.firebasestorage.app",
  messagingSenderId: "701233284129",
  appId: "1:701233284129:web:6f05f81287bb91e87b8f60",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Phone auth helpers
export function setupRecaptcha(elementId) {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, elementId, {
      size: 'invisible',
      callback: () => {},
    });
  }
  return window.recaptchaVerifier;
}

export async function sendPhoneOTP(phoneNumber) {
  const appVerifier = setupRecaptcha('recaptcha-container');
  const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
  return confirmation;
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function firebaseSignOut() {
  await signOut(auth);
}

export { onAuthStateChanged };
