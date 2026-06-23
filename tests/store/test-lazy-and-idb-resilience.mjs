// Regression tests for two Sentry-driven resilience fixes:
//
//   C. loading-stuck (reason:"lazy-page") — a STALLED dynamic import (flaky
//      mobile network: request neither resolves nor rejects) left users on the
//      Suspense spinner forever, because React.lazy() has no timeout. Fix:
//      lazyWithRetry races the import against a timeout and routes a stall into
//      the SAME one-time reload recovery a stale-chunk 404 already triggers.
//
//   D. "Connection to Indexed Database server lost" — iOS Safari/WebKit tears
//      down the Firestore IndexedDB connection on backgrounding/BFCache, firing
//      an UNHANDLED rejection that counted as a hard error. Fix: the global
//      unhandledrejection handler downgrades it to a deduped warning signal.
//
// Convention: static source audits + behavioral simulations of shipped logic.

import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

console.log("=== LAZY-IMPORT + INDEXEDDB RESILIENCE TESTS ===\n");

// ============ C. Stalled lazy import → timeout → one-time reload ============
console.log("--- C. lazyWithRetry recovers a STALLED import, not just a 404 ---");
{
  const src = SRC("src/utils/lazyWithRetry.ts");

  assert(/LAZY_IMPORT_TIMEOUT_MS/.test(src), "lazyWithRetry defines an import timeout");
  assert(/Promise\.race/.test(src), "the import is raced against the timeout");
  assert(/lazy-import-timeout/.test(src), "a timeout rejects with a recognizable sentinel");
  assert(/isChunkLoadError\(err\?\.message\) \|\| err\?\.message === LAZY_TIMEOUT_MESSAGE/.test(src),
    "both a stale-chunk 404 AND a stall are treated as recoverable");
  // The once-per-session reload guard MUST still gate the new path so a
  // genuinely dead chunk can't loop the page.
  assert(/RELOAD_FLAG/.test(src) && /window\.location\.reload\(\)/.test(src),
    "recovery still goes through the once-per-session reload guard");

  // Behavioral: replicate the shipped recovery decision.
  const LAZY_TIMEOUT_MESSAGE = "lazy-import-timeout";
  const CHUNK_RE = [
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /Loading chunk \d+ failed/i,
  ];
  const isChunkLoadError = (m) => CHUNK_RE.some((re) => re.test(typeof m === "string" ? m : ""));

  function recover(message, alreadyReloaded) {
    const recoverable = isChunkLoadError(message) || message === LAZY_TIMEOUT_MESSAGE;
    if (recoverable && !alreadyReloaded) return "reload";
    if (recoverable) return "throw-after-reload";
    return "throw";
  }

  assert(recover(LAZY_TIMEOUT_MESSAGE, false) === "reload", "First stall → reload");
  assert(recover("Failed to fetch dynamically imported module: /assets/Predict.js", false) === "reload", "Stale 404 → reload (unchanged)");
  assert(recover(LAZY_TIMEOUT_MESSAGE, true) === "throw-after-reload",
    "Second stall in the same session → throw (no reload loop) → ErrorBoundary");
  assert(recover("TypeError: Cannot read properties of undefined", false) === "throw",
    "A real page error is NOT swallowed by the reload path");

  // The timeout window must sit above App's 12s stuck-recovery UI so the manual
  // escape hatch shows first and the auto-reload only rescues genuinely-dead loads.
  const m = src.match(/LAZY_IMPORT_TIMEOUT_MS\s*=\s*(\d+)/);
  assert(m && Number(m[1]) >= 12000, "Import timeout (>=12s) sits at/above the stuck-recovery UI threshold");

  // Timer race sanity: a timeout that fires before the import resolves rejects
  // with the sentinel; a fast import wins.
  const raceOutcome = (importMs, timeoutMs) => (importMs <= timeoutMs ? "import" : LAZY_TIMEOUT_MESSAGE);
  assert(raceOutcome(800, 15000) === "import", "Fast import wins the race (normal load)");
  assert(raceOutcome(99999, 15000) === LAZY_TIMEOUT_MESSAGE, "Stalled import loses → timeout sentinel");
}

// ============ D. IndexedDB-lost unhandled rejection → warning ============
console.log("--- D. unhandledrejection downgrades the IndexedDB-lost blip ---");
{
  const src = SRC("src/sentry.ts");

  assert(/isIndexedDbConnectionLost/.test(src), "sentry.ts has an isIndexedDbConnectionLost matcher");
  assert(/Connection to Indexed Database server lost/i.test(src),
    "matcher targets the exact WebKit message");
  assert(/indexeddb-connection-lost/.test(src), "downgraded path emits a named warning signal");

  // The downgrade branch must precede captureClientError in the rejection
  // handler so the IDB blip never reaches the hard-error path.
  const handler = src.slice(src.indexOf('addEventListener("unhandledrejection"'));
  const idbIdx = handler.indexOf("isIndexedDbConnectionLost");
  const captureErrIdx = handler.indexOf("captureClientError");
  assert(idbIdx > -1 && captureErrIdx > -1 && idbIdx < captureErrIdx,
    "IDB downgrade is checked BEFORE captureClientError (so it's never a hard error)");

  // Behavioral: replicate the routing.
  function isIndexedDbConnectionLost(msg) {
    if (!msg) return false;
    return /Connection to Indexed Database server lost/i.test(String(msg));
  }
  const route = (msg) => (isIndexedDbConnectionLost(msg) ? "warning" : "error");
  assert(route("UnknownError: Connection to Indexed Database server lost. Refresh the page to try again") === "warning",
    "The real iOS Safari IDB message → warning");
  assert(route("TypeError: Cannot read properties of null") === "error",
    "An unrelated rejection still → hard error");
  assert(route(undefined) === "error", "Missing message is safe (defaults to error path)");
}

// ============ SUMMARY ============
console.log(`\n=== LAZY + INDEXEDDB RESILIENCE: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
