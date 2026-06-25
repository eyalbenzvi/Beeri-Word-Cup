// Regression tests for the iOS Google-sign-in crash fix batch.
//
// Real-world bug: every iOS browser is WebKit; signInWithPopup on Chrome iOS
// crashes the renderer mid-flow, and the cross-origin (firebaseapp.com) OAuth
// handler trips WebKit storage partitioning. #236's batch had two parts:
//   A. (NOW REVERTED — stopgap) #236 routed all iOS to signInWithRedirect to
//      dodge the Chrome-iOS popup crash. But signInWithRedirect ALSO fails on
//      iOS WebKit with a cross-origin authDomain (firebase-js-sdk #7824) — it
//      bounces users back logged out — which regressed the iOS-Safari majority.
//      Until the same-origin authDomain cutover (B) is activated, iOS is back
//      on the popup flow that worked before #236. Section A pins that revert.
//   B. authDomain is read from VITE_FIREBASE_AUTH_DOMAIN (default = the current
//      firebaseapp.com) so the same-origin cutover is a reversible env flip,
//      backed by a Netlify /__/auth/* + /__/firebase/* proxy. (Unchanged — this
//      is the REAL fix; once live, redirect-on-iOS in A should be restored.)
//
// Project convention: static source audits + behavioral simulations of the
// exact shipped logic (see test-sentry-error-fixes #2 / test-stuck-loading #14).

import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

console.log("=== iOS GOOGLE SIGN-IN REGRESSION TESTS ===\n");

// ============ A. iOS stopgap revert: popup, NOT redirect ============
console.log("--- A. signInWithGoogle uses popup on iOS again (stopgap revert of #236) ---");
{
  // STOPGAP: #236 forced ALL iOS to signInWithRedirect, but redirect silently
  // fails on iOS WebKit while authDomain is the cross-origin firebaseapp.com
  // (Safari storage partitioning — firebase-js-sdk #7824), bouncing users back
  // logged out. Until the same-origin authDomain cutover is live, iOS falls
  // back to the popup flow that worked before #236. Only true in-app browsers
  // (WhatsApp/Instagram/etc.) still force redirect (they can't open popups).
  const src = SRC("src/firebase.ts");

  // isIOS() is deliberately RETAINED (the proxy/cutover tests reference it, and
  // redirect-on-iOS returns once the cutover is active).
  assert(/export function isIOS\(/.test(src), "firebase.ts still exports the isIOS() detector (kept for the cutover)");
  assert(/iPad\|iPhone\|iPod/.test(src), "isIOS matches iPhone/iPad/iPod user agents");
  assert(/MacIntel/.test(src) && /maxTouchPoints/.test(src),
    "isIOS also catches iPadOS-masquerading-as-Mac (MacIntel + touch points)");

  // The sign-in guard must NO LONGER force redirect on iOS — only in-app.
  assert(/if \(isInAppBrowser\(\)\) \{/.test(src),
    "signInWithGoogle forces redirect only for in-app browsers (iOS reverted to popup)");
  const fn = src.slice(src.indexOf("export async function signInWithGoogle"));
  const guardLine = fn.slice(0, fn.indexOf("signInWithRedirect"));
  assert(!/\|\| isIOS\(\)/.test(guardLine),
    "the up-front redirect guard does NOT include isIOS() anymore (the regressing line is gone)");
  // The comment must document WHY (so a future reader doesn't 'fix' it back blindly).
  assert(/cutover/i.test(fn) && /7824/.test(fn),
    "the revert is documented (cutover + firebase-js-sdk #7824) so it isn't reverted blindly");

  // Behavioral: replicate the NEW routing decision (in-app → redirect; everything
  // else, including iOS, → popup).
  function isInApp(nav) {
    return /FBAN|FBAV|Instagram|WhatsApp|Line|wv|WebView/i.test(nav.userAgent || "");
  }
  const decide = (nav) => (isInApp(nav) ? "redirect" : "popup");

  const safariIOS = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
  const chromeIOS = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
  const whatsappIOS = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/WhatsApp]", platform: "iPhone", maxTouchPoints: 5 };
  const androidChrome = { userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36", platform: "Linux armv8l", maxTouchPoints: 5 };

  assert(decide(safariIOS) === "popup", "Safari iOS → popup (the path that worked before #236)");
  assert(decide(chromeIOS) === "popup", "Chrome iOS → popup (stopgap; redirect was broken cross-origin too)");
  assert(decide(whatsappIOS) === "redirect", "In-app WhatsApp browser still → redirect (can't open popups)");
  assert(decide(androidChrome) === "popup", "Android Chrome keeps the popup (unchanged)");
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

// ============ B2. CSP / headers are cutover-ready ============
console.log("--- B2. _headers allow the same-origin auth iframe (cutover-ready) ---");
{
  const headers = SRC("public/_headers");
  // Same-origin authDomain makes the SDK load /__/auth/iframe from 'self'.
  assert(/frame-src 'self'/.test(headers),
    "CSP frame-src includes 'self' so the same-origin auth iframe isn't blocked");
  // The global X-Frame-Options: DENY must be relaxed to SAMEORIGIN for /__/auth/*.
  const authBlock = headers.slice(headers.indexOf("/__/auth/*"));
  assert(/\/__\/auth\/\*/.test(headers), "_headers has a path block for /__/auth/*");
  assert(/X-Frame-Options: SAMEORIGIN/.test(authBlock),
    "/__/auth/* relaxes X-Frame-Options to SAMEORIGIN (global DENY would block the iframe)");
  // The global default must STAY DENY — only the auth path is relaxed.
  const globalBlock = headers.slice(headers.indexOf("/*"), headers.indexOf("/__/auth/*"));
  assert(/X-Frame-Options: DENY/.test(globalBlock),
    "the global /* default keeps X-Frame-Options: DENY (only /__/auth/* is relaxed)");
}

// ============ SUMMARY ============
console.log(`\n=== iOS GOOGLE SIGN-IN: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
