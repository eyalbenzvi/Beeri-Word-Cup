import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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

// Handle pending redirect result on page load (for mobile redirect flow)
getRedirectResult(auth).catch(() => {});

// Detect in-app browsers (WhatsApp, Facebook, Instagram, etc.)
function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|WhatsApp|Line|wv|WebView/i.test(ua);
}

export async function signInWithGoogle() {
  // In-app browsers don't support popups — use redirect
  if (isInAppBrowser()) {
    await signInWithRedirect(auth, googleProvider);
    return null; // auth completes on redirect back via getRedirectResult
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    // Popup blocked or failed on mobile — fall back to redirect
    if (
      err.code === "auth/popup-blocked" ||
      err.code === "auth/operation-not-supported-in-this-environment" ||
      err.code === "auth/missing-initial-state"
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
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
