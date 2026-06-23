// Regression tests for fix E: transient Firestore connect-timeouts in the
// public Netlify functions were 500ing guests.
//
// Real Sentry signal: `FetchError: connect ETIMEDOUT ...:443` from
// get-public-tournament-data (Lambda → firestore.googleapis.com) surfaced to
// the client as `public-tournament-fetch-500`. Fix: a shared withFirestoreRetry
// helper retries ONLY transient/connection-class failures with backoff + a
// per-attempt timeout, wired into the three public read functions.
//
// This suite exercises the real helper (it's dependency-free ESM) plus static
// wiring audits of the three callers.

import { readFileSync } from "node:fs";
import {
  withFirestoreRetry,
  isTransientFirestoreError,
} from "../../netlify/functions/_lib/firestoreRetry.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

console.log("=== PUBLIC-FETCH FIRESTORE RETRY TESTS ===\n");

// ============ Transient-error classification ============
console.log("--- transient vs permanent error classification ---");
{
  assert(isTransientFirestoreError({ code: "ETIMEDOUT" }), "ETIMEDOUT (the reported failure) is transient");
  assert(isTransientFirestoreError({ code: "ECONNRESET" }), "ECONNRESET is transient");
  assert(isTransientFirestoreError({ code: 14 }), "gRPC 14 (UNAVAILABLE) is transient");
  assert(isTransientFirestoreError({ code: 4 }), "gRPC 4 (DEADLINE_EXCEEDED) is transient");
  assert(isTransientFirestoreError({ message: "connect ETIMEDOUT 64.233.180.95:443" }),
    "Bare message (no code) with ETIMEDOUT is transient — matches the real Sentry shape");
  assert(isTransientFirestoreError({ message: "socket hang up" }), "socket hang up is transient");

  assert(!isTransientFirestoreError({ code: "permission-denied" }), "permission-denied is NOT transient (rules fault)");
  assert(!isTransientFirestoreError({ code: 7 }), "gRPC 7 (PERMISSION_DENIED) is NOT transient");
  assert(!isTransientFirestoreError({ message: "Missing or insufficient permissions" }), "permissions message is NOT transient");
  assert(!isTransientFirestoreError(null), "null error is safe (not transient)");
  assert(!isTransientFirestoreError(undefined), "undefined error is safe (not transient)");
}

// ============ Retry behaviour ============
console.log("--- withFirestoreRetry behaviour ---");
{
  // Transient failure then success → recovers, op re-invoked each attempt.
  let calls = 0;
  const out = await withFirestoreRetry(async () => {
    calls++;
    if (calls < 2) { const e = new Error("connect ETIMEDOUT 1.2.3.4:443"); e.code = "ETIMEDOUT"; throw e; }
    return "snap";
  }, { baseDelayMs: 1 });
  assert(out === "snap" && calls === 2, "Transient ETIMEDOUT recovers on the retry (op re-invoked)");

  // Permanent (non-transient) error fails fast: no wasted retries.
  let permCalls = 0, permThrew = null;
  try {
    await withFirestoreRetry(async () => {
      permCalls++;
      const e = new Error("Missing or insufficient permissions"); e.code = "permission-denied"; throw e;
    }, { baseDelayMs: 1 });
  } catch (e) { permThrew = e; }
  assert(permThrew && permCalls === 1, "Permanent error fails fast (1 attempt, no retry loop)");

  // Persistent transient error exhausts the bounded budget then rethrows the
  // ORIGINAL error (so the caller's existing 500 + Sentry logging still works).
  let exCalls = 0, exThrew = null;
  try {
    await withFirestoreRetry(async () => {
      exCalls++; const e = new Error("connect ETIMEDOUT"); e.code = "ETIMEDOUT"; throw e;
    }, { retries: 2, baseDelayMs: 1 });
  } catch (e) { exThrew = e; }
  assert(exCalls === 3, "Exhausts 1 + 2 retries (3 attempts) on persistent transient failure");
  assert(exThrew && exThrew.code === "ETIMEDOUT", "Rethrows the original transient error after exhaustion");

  // Happy path: a fast success doesn't retry.
  let okCalls = 0;
  const ok = await withFirestoreRetry(async () => { okCalls++; return 42; }, { baseDelayMs: 1 });
  assert(ok === 42 && okCalls === 1, "Successful op runs exactly once");

  // Per-attempt timeout: a hung op rejects with an ETIMEDOUT (transient), so it
  // is retried and then surfaces rather than hanging the whole Lambda.
  let timeoutThrew = null, hangCalls = 0;
  try {
    await withFirestoreRetry(() => { hangCalls++; return new Promise(() => {}); },
      { retries: 1, baseDelayMs: 1, timeoutMs: 20 });
  } catch (e) { timeoutThrew = e; }
  assert(timeoutThrew && hangCalls === 2, "A hung op times out per-attempt and is retried (no indefinite hang)");
}

// ============ Wiring: all three public functions use the helper ============
console.log("--- the three public read functions are wired to the retry helper ---");
{
  for (const fn of [
    "get-public-tournament-data.js",
    "get-public-settings.js",
    "get-public-summaries.js",
  ]) {
    const src = SRC(`netlify/functions/${fn}`);
    assert(/from "\.\/_lib\/firestoreRetry\.js"/.test(src), `${fn} imports withFirestoreRetry`);
    assert(/withFirestoreRetry\(/.test(src), `${fn} actually wraps its Firestore read(s)`);
  }
}

// ============ SUMMARY ============
console.log(`\n=== PUBLIC-FETCH RETRY: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
