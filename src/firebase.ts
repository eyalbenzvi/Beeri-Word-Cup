import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
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
import {
  shouldBypassFirestoreCache,
  wipeFirestoreIndexedDb,
} from "./utils/firestoreCacheRecovery";

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
// Cache-recovery escape hatch: if a previous session detected a fatal,
// unrecoverable Firestore IndexedDB corruption (the "b815" internal assertion,
// see firestoreCacheRecovery.ts) it armed a localStorage bypass flag and
// reloaded. On this boot we honour it by initialising with an in-memory cache
// instead of the persistent (IndexedDB) one — fully functional, just without
// offline persistence — so the user is never re-trapped on the poisoned store.
// After init we wipe the idle on-disk DB and clear the flag so the NEXT session
// returns to normal persistent caching.
const bypassPersistentCache = shouldBypassFirestoreCache();
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: bypassPersistentCache
    ? memoryLocalCache()
    : persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
});
if (bypassPersistentCache) {
  // Fire-and-forget: this session runs on memory cache, so the on-disk
  // Firestore IndexedDB is idle and safe to delete. Success clears the bypass
  // flag (resume persistent next boot); failure keeps it (retry next boot).
  void wipeFirestoreIndexedDb();
}
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

// Handle pending redirect result on page load (for mobile redirect flow)
// Log errors for debugging but don't bother the user — they can tap sign-in again.
//
// While this is settling we set a window flag the cache-recovery path reads:
// a fatal-cache reload fired mid-handshake could drop the OAuth provider's
// one-shot params and strand an iOS redirect sign-in, so recovery defers until
// getRedirectResult resolves. The flag is set true on every load and cleared
// when the (usually instant) resolution lands; redirect-returns are exactly the
// case where it stays true long enough to matter.
try { (window as any).__wcAuthRedirectPending = true; } catch { /* no window */ }
getRedirectResult(auth)
  .catch((err) => {
    const silent = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
    if (!silent.includes(err?.code)) {
      console.error("Redirect sign-in failed:", err?.code, err?.message);
      captureClientError(err, { source: "getRedirectResult", code: err?.code });
    }
  })
  .finally(() => {
    try { (window as any).__wcAuthRedirectPending = false; } catch { /* no window */ }
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
  // STOPGAP REVERT of #236's iOS branch. #236 routed ALL iOS browsers to
  // signInWithRedirect to dodge the Chrome-iOS popup renderer crash. But
  // signInWithRedirect silently FAILS on iOS WebKit while authDomain is the
  // cross-origin firebaseapp.com — Safari storage partitioning never returns
  // the result (firebase-js-sdk #7824), so the user bounces back logged out.
  // That regressed the iOS-Safari majority. Until the same-origin authDomain
  // cutover is live (VITE_FIREBASE_AUTH_DOMAIN + the Netlify /__/auth proxy,
  // which is what makes redirect actually work on iOS), fall back to the popup
  // flow that worked before #236. `isIOS()` is kept (still used by the proxy/
  // cutover tests) — re-add `|| isIOS()` here once the cutover is active so iOS
  // uses the more robust same-origin redirect again.
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

export async function signInWithPhoneOtp(customToken) {
  const result = await signInWithCustomToken(auth, customToken);
  return result.user;
}

export async function firebaseSignOut() {
  await signOut(auth);
}

export { onAuthStateChanged };
