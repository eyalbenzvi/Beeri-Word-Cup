import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "beeri-world-cup.firebaseapp.com",
  projectId: "beeri-world-cup",
  storageBucket: "beeri-world-cup.firebasestorage.app",
  messagingSenderId: "701233284129",
  appId: "1:701233284129:web:6f05f81287bb91e87b8f60",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function firebaseSignOut() {
  await signOut(auth);
}

let recaptchaVerifier = null;

function setupRecaptcha() {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
    });
  }
  return recaptchaVerifier;
}

export async function signInWithPhone(phoneNumber) {
  const verifier = setupRecaptcha();
  const confirmationResult = await signInWithPhoneNumber(
    auth,
    phoneNumber,
    verifier,
  );
  return confirmationResult;
}

export async function confirmPhoneCode(confirmationResult, code) {
  const result = await confirmationResult.confirm(code);
  return result.user;
}

export { onAuthStateChanged };
