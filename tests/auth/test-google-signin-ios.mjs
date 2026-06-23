// Regression tests for the iOS Google-sign-in crash fix batch.
//
// Real-world bug: an iPhone user could not sign in with Google on Chrome iOS
// (the page crashed: "לא ניתן לפתוח את הדף") but COULD on Firefox iOS. Root
// cause: every iOS browser is WebKit; signInWithPopup on Chrome iOS crashes the
// renderer mid-flow, and the cross-origin (firebaseapp.com) OAuth handler trips
// WebKit storage partitioning. Two fixes:
//   A. Detect iOS (incl. CriOS/FxiOS + iPadOS-as-Mac) and go straight to
//      signInWithRedirect, never the popup path.
//   B. authDomain is read from VITE_FIREBASE_AUTH_DOMAIN (default = the current
//      firebaseapp.com) so the same-origin cutover is a reversible env flip,
//      backed by a Netlify /__/auth/* + /__/firebase/* proxy.
//
// Project convention: static source audits + behavioral simulations of the
// exact shipped logic (see test-sentry-error-fixes #2 / test-stuck-loading #14).

import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

console.log("=== iOS GOOGLE SIGN-IN REGRESSION TESTS ===\n");

// ============ A. iOS detection + redirect-first ============
console.log("--- A. signInWithGoogle routes iOS to redirect, not popup ---");
{
  const src = SRC("src/firebase.ts");

  assert(/export function isIOS\(/.test(src), "firebase.ts exports an isIOS() detector");
  assert(/iPad\|iPhone\|iPod/.test(src), "isIOS matches iPhone/iPad/iPod user agents");
  assert(/MacIntel/.test(src) && /maxTouchPoints/.test(src),
    "isIOS also catches iPadOS-masquerading-as-Mac (MacIntel + touch points)");

  // The decision MUST be made up front (isInAppBrowser() || isIOS()) — the old
  // popup-then-catch fallback can't help because the iOS renderer crashes
  // before any catchable error is thrown.
  assert(/if \(isInAppBrowser\(\) \|\| isIOS\(\)\)/.test(src),
    "signInWithGoogle short-circuits to redirect for in-app AND iOS browsers");

  const fn = src.slice(src.indexOf("export async function signInWithGoogle"));
  const guardIdx = fn.indexOf("isIOS()");
  const popupIdx = fn.indexOf("signInWithPopup");
  assert(guardIdx > -1 && popupIdx > -1 && guardIdx < popupIdx,
    "the iOS guard precedes signInWithPopup (popup never reached on iOS)");

  // Behavioral: replicate the shipped isIOS() and the routing decision.
  function isIOS(nav) {
    const ua = nav.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1;
  }
  function isInApp(nav) {
    return /FBAN|FBAV|Instagram|WhatsApp|Line|wv|WebView/i.test(nav.userAgent || "");
  }
  const decide = (nav) => (isInApp(nav) || isIOS(nav) ? "redirect" : "popup");

  // The exact reported browser (Chrome iOS = CriOS) must take the redirect path.
  const chromeIOS = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
  const firefoxIOS = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15", platform: "iPhone", maxTouchPoints: 5 };
  const safariIOS = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
  const iPadOS = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };
  const desktopChrome = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", platform: "Win32", maxTouchPoints: 0 };
  const desktopMac = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", platform: "MacIntel", maxTouchPoints: 0 };
  const androidChrome = { userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36", platform: "Linux armv8l", maxTouchPoints: 5 };

  assert(decide(chromeIOS) === "redirect", "Chrome iOS (the reported crash) → redirect");
  assert(decide(firefoxIOS) === "redirect", "Firefox iOS → redirect");
  assert(decide(safariIOS) === "redirect", "Safari iOS → redirect");
  assert(decide(iPadOS) === "redirect", "iPadOS (Mac UA + touch) → redirect");
  assert(decide(desktopChrome) === "popup", "Desktop Chrome keeps the popup (better UX)");
  assert(decide(desktopMac) === "popup", "Desktop Mac (no touch) keeps the popup — NOT misdetected as iPad");
  assert(decide(androidChrome) === "popup", "Android Chrome keeps the popup (not WebKit)");
}

// ============ B. authDomain via env var + Netlify proxy ============
console.log("--- B. authDomain is env-configurable with a safe default + proxy ---");
{
  const src = SRC("src/firebase.ts");
  assert(/VITE_FIREBASE_AUTH_DOMAIN/.test(src), "authDomain reads VITE_FIREBASE_AUTH_DOMAIN");
  assert(/VITE_FIREBASE_AUTH_DOMAIN \|\| "beeri-world-cup\.firebaseapp\.com"/.test(src),
    "authDomain defaults to firebaseapp.com (zero behaviour change until the env var is set)");

  // Behavioral: the cutover must be a pure env flip — unset keeps the old
  // origin, set switches it, with no other code change.
  const resolveAuthDomain = (env) => env.VITE_FIREBASE_AUTH_DOMAIN || "beeri-world-cup.firebaseapp.com";
  assert(resolveAuthDomain({}) === "beeri-world-cup.firebaseapp.com", "Unset env → current firebaseapp.com origin");
  assert(resolveAuthDomain({ VITE_FIREBASE_AUTH_DOMAIN: "beeri-world-cup.netlify.app" }) === "beeri-world-cup.netlify.app",
    "Set env → same-origin netlify host");

  const toml = SRC("netlify.toml");
  assert(/from = "\/__\/auth\/\*"/.test(toml), "netlify.toml proxies /__/auth/* (the OAuth handler)");
  assert(/from = "\/__\/firebase\/\*"/.test(toml), "netlify.toml proxies /__/firebase/* (the SDK config)");
  assert(/to = "https:\/\/beeri-world-cup\.firebaseapp\.com\/__\/auth\/:splat"/.test(toml),
    "auth proxy forwards to the firebaseapp.com origin with :splat");
}

// ============ SUMMARY ============
console.log(`\n=== iOS GOOGLE SIGN-IN: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
