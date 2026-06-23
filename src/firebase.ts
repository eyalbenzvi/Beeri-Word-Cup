import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { captureClientError } from "./sentry";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // authDomain controls which origin serves the OAuth handler (/__/auth/*).
  // The default firebaseapp.com is a DIFFERENT origin from where the app is
  // hosted (netlify.app), and on iOS WebKit (Safari + Chrome/Firefox-for-iOS,
  // which are all WebKit) cross-origin storage partitioning breaks the sign-in
  // handshake — on Chrome iOS it manifests as a renderer crash ("the page
  // can't be opened"). Serving the auth handler same-origin (via the Netlify
  // /__/auth/* proxy in netlify.toml) fixes it. We read it from an env var so
  // the cutover is a reversible Netlify setting flip, NOT a code change:
  // unset → keeps the current firebaseapp.com behaviour (zero risk on merge);
  // set to the app's own host (e.g. beeri-world-cup.netlify.app) → same-origin.
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "beeri-world-cup.firebaseapp.com",
  projectId: "beeri-world-cup",
  storageBucket: "beeri-world-cup.firebasestorage.app",
  messagingSenderId: "701233284129",
  appId: "1:701233284129:web:6f05f81287bb91e87b8f60",
};

const app = initializeApp(firebaseConfig);
// Auto-detect long-polling fallback. The default WebChannel transport gets
// blocked silently by some browser extensions, ad-blockers, corporate
// proxies, and restrictive incognito profiles — listeners then hang
// forever without firing either success or error, so the user sees an
// indefinite "טוען..." with nothing in the console. Auto-detect tries
// WebChannel first and falls back to XHR long-polling on the same
// connection if the streaming attempt doesn't complete.
//
// Persistent IndexedDB cache (security audit #57/#71): pending writes that
// haven't reached Firestore when the tab is killed (mobile Safari pagehide,
// app backgrounding) survive to the next session and replay automatically.
// Without this, debouncedWriteForm's last 500ms of edits could vanish when
// the user closes the tab.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

// Handle pending redirect result on page load (for mobile redirect flow)
// Log errors for debugging but don't bother the user — they can tap sign-in again
getRedirectResult(auth).catch((err) => {
  const silent = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
  if (!silent.includes(err?.code)) {
    console.error("Redirect sign-in failed:", err?.code, err?.message);
    captureClientError(err, { source: "getRedirectResult", code: err?.code });
  }
});

// Detect in-app browsers (WhatsApp, Facebook, Instagram, etc.)
function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|WhatsApp|Line|wv|WebView/i.test(ua);
}

// Detect iOS, including iPhone/iPad/iPod AND the iPadOS-on-desktop-UA case
// (iPad reports as "MacIntel" with a touch screen). Every browser on iOS —
// Safari, Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS) — is WebKit under the
// hood, so they ALL share WebKit's fragile popup + storage-partition behaviour.
// `signInWithPopup` on Chrome iOS in particular crashes the renderer mid-flow
// ("the page can't be opened"); the popup error is never even thrown, so the
// existing catch-and-fallback-to-redirect can't save us. We must avoid the
// popup entirely on iOS and go straight to redirect.
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ masquerades as macOS Safari but is still WebKit-on-touch.
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
}

export async function signInWithGoogle() {
  // In-app browsers and ALL iOS browsers (WebKit) can't reliably use the popup
  // flow — use redirect. On iOS the popup path can crash the renderer before
  // any catchable error fires, so this MUST be decided up front, not via the
  // popup-failure fallback below.
  if (isInAppBrowser() || isIOS()) {
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

export async function signInWithPhoneOtp(customToken) {
  const result = await signInWithCustomToken(auth, customToken);
  return result.user;
}

export async function firebaseSignOut() {
  await signOut(auth);
}

export { onAuthStateChanged };
