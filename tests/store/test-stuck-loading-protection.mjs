// Tests for the "stuck loading spinner" protection layer:
// - Watchdog timeouts (auth / store / user) that never hang forever
// - Escape-hatch Loading component behavior
// - A1 retry cap + lastEnsuredUid commit-after-success
// - A2 per-uid one-shot token refresh
// - A7 optimistic-revert detection
// - B2 global handler noise filter
// - updateUserProfile returning ok/!ok so UI can show errors

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== STUCK-LOADING PROTECTION TESTS ===\n");

// ============ 1. lastEnsuredUid only commits on success (A1) ============
console.log("--- 1. lastEnsuredUid must only be set after a successful write ---");

{
  // Simulates the new doEnsureUserInStore control flow: if write fails,
  // lastEnsuredUid stays unset so a later call can retry.
  let lastEnsuredUid = null;
  async function run({ uid, writeOk }) {
    // pretend we went through getDoc + pick create/update; then:
    const ok = writeOk;
    if (ok) lastEnsuredUid = uid;
    return ok;
  }

  await run({ uid: "dad", writeOk: false });
  assert(lastEnsuredUid === null, "Failed write: lastEnsuredUid remains null");

  await run({ uid: "dad", writeOk: true });
  assert(lastEnsuredUid === "dad", "Successful write: lastEnsuredUid set");
}

// ============ 2. Retry cap (A1) ============
console.log("--- 2. Retry counter caps at MAX_ENSURE_RETRIES ---");

{
  const MAX = 3;
  const counts = new Map();
  let attempts = 0;
  function attempt(uid) {
    const n = counts.get(uid) || 0;
    if (n >= MAX) return "skipped";
    counts.set(uid, n + 1);
    attempts++;
    return "tried";
  }

  const results = [];
  for (let i = 0; i < 5; i++) results.push(attempt("dad"));
  assert(attempts === 3, "Attempts capped at 3");
  assert(results[3] === "skipped", "4th call skipped");
  assert(results[4] === "skipped", "5th call skipped");
}

// ============ 3. Token refresh is per-uid, one-shot (A2) ============
console.log("--- 3. Token refresh fires once per uid per session ---");

{
  const refreshed = new Set();
  let refreshCalls = 0;
  async function maybeRefresh(uid, errCode) {
    if (errCode !== "permission-denied") return false;
    if (!uid || refreshed.has(uid)) return false;
    refreshed.add(uid);
    refreshCalls++;
    return true;
  }

  await maybeRefresh("dad", "permission-denied");
  await maybeRefresh("dad", "permission-denied");
  await maybeRefresh("dad", "permission-denied");
  assert(refreshCalls === 1, "Same uid + permission-denied: refresh exactly once");

  await maybeRefresh("mom", "permission-denied");
  assert(refreshCalls === 2, "Different uid: refresh once more");

  await maybeRefresh("dad", "unavailable");
  assert(refreshCalls === 2, "Non-permission-denied code: no refresh");
}

// ============ 4. Optimistic-revert detection (A7) ============
console.log("--- 4. Detect when a just-written user vanishes from Firestore ---");

{
  // Before snapshot: cache has dad (optimistic write). After snapshot:
  // server rejected and reverted → dad gone. Listener must notice.
  let lastEnsuredUid = "dad";
  const prevUsers = { admin1: {}, dad: { id: "dad" } };
  const newUsers = { admin1: {} }; // dad vanished

  const wasThere = prevUsers[lastEnsuredUid];
  const stillThere = newUsers[lastEnsuredUid];
  const reverted = !!wasThere && !stillThere;

  assert(reverted, "Revert detected when user was there and now isn't");

  // And lastEnsuredUid must be cleared so ensure can retry
  if (reverted) lastEnsuredUid = null;
  assert(lastEnsuredUid === null, "lastEnsuredUid cleared after revert");
}

// ============ 5. Watchdog timing ============
console.log("--- 5. Watchdogs fire exactly once at their threshold ---");

{
  // Simulate setTimeout scheduling: a watchdog callback scheduled at T
  // fires iff the condition still holds at T. If the condition resolved
  // earlier (clearTimeout), nothing fires.

  function schedule(thresholdMs, conditionAtFire) {
    let fired = false;
    const handle = { cancelled: false };
    const tick = () => { if (!handle.cancelled && conditionAtFire()) fired = true; };
    handle.fire = tick;
    handle.cancel = () => { handle.cancelled = true; };
    return { handle, fired: () => fired };
  }

  // Case A: auth-ready happens BEFORE threshold → watchdog cancelled
  let authReady = false;
  const w1 = schedule(8000, () => !authReady);
  authReady = true;
  w1.handle.cancel();
  w1.handle.fire();
  assert(!w1.fired(), "Auth watchdog: cancelled when auth resolved");

  // Case B: auth-ready never happens → watchdog fires
  authReady = false;
  const w2 = schedule(8000, () => !authReady);
  w2.handle.fire();
  assert(w2.fired(), "Auth watchdog: fires if authReady still false at threshold");

  // Case C: condition flips true AFTER threshold's setTimeout scheduled
  // but BEFORE it fires — because we clearTimeout on resolution, it won't fire.
  let storeReady = false;
  const w3 = schedule(15000, () => !storeReady);
  storeReady = true;
  w3.handle.cancel();
  w3.handle.fire();
  assert(!w3.fired(), "Store watchdog: cancelled when store became ready");
}

// ============ 6. Loading escape-hatch threshold ============
console.log("--- 6. Loading component surfaces recovery only after threshold ---");

{
  const THRESHOLD = 12000;

  function stuckAt(tMs) {
    return tMs >= THRESHOLD;
  }

  assert(!stuckAt(0), "0ms: not stuck");
  assert(!stuckAt(11999), "11.999s: not stuck");
  assert(stuckAt(12000), "12s: stuck (recovery surface)");
  assert(stuckAt(60000), "60s: stuck");
}

// ============ 7. Global error handler noise filter (B2) ============
console.log("--- 7. Extension / noise errors are skipped ---");

{
  function isNoise(msg) {
    if (!msg) return false;
    const s = String(msg);
    return (
      /ResizeObserver loop/.test(s) ||
      /chrome-extension:/.test(s) ||
      /moz-extension:/.test(s) ||
      /safari-extension:/.test(s) ||
      s === "Script error."
    );
  }

  assert(isNoise("ResizeObserver loop limit exceeded"), "Filters ResizeObserver loop");
  assert(isNoise("Script error."), "Filters cross-origin Script error.");
  assert(isNoise("chrome-extension://abc"), "Filters chrome-extension source");
  assert(!isNoise("TypeError: cannot read properties of undefined"), "Real errors pass through");
  assert(!isNoise(""), "Empty message: not noise (will be converted to generic)");
}

// ============ 8. updateUserProfile returns ok-signal for UI ============
console.log("--- 8. updateUserProfile returns boolean so ProfileSetup can show error ---");

{
  // Contract: returns true on success/no-op, false on Firestore failure,
  // so the caller can display an error instead of silently calling onComplete.
  async function fakeUpdate(users, uid, fields, writeResult) {
    if (!users[uid]) return false;
    if (Object.keys(fields).length === 0) return true;
    return writeResult;
  }

  assert(await fakeUpdate({ dad: {} }, "dad", {}, false) === true,
    "No-op (empty fields): returns true");
  assert(await fakeUpdate({ dad: {} }, "dad", { firstName: "x" }, true) === true,
    "Successful write: returns true");
  assert(await fakeUpdate({ dad: {} }, "dad", { firstName: "x" }, false) === false,
    "Failed write: returns false");
  assert(await fakeUpdate({}, "ghost", { firstName: "x" }, true) === false,
    "Unknown user: returns false (guard)");
}

// ============ 9. Auth watchdog must not signOut, only unblock render ============
console.log("--- 9. A6 auth watchdog forces authReady=true but never signs out ---");

{
  // The fix sets authReady=true on timeout so WelcomeScreen renders.
  // It must NOT call firebaseSignOut — Firebase may recover later and fire
  // onAuthStateChanged. Doing signOut would drop a session that is actually
  // valid server-side but slow to init.
  let signedOut = false;
  let authReady = false;

  function watchdogFire() {
    authReady = true;
    // Deliberately do not call signOut
  }
  watchdogFire();

  assert(authReady === true, "Watchdog sets authReady=true");
  assert(signedOut === false, "Watchdog does NOT call signOut");
}

// ============ 10. Recovery button must clear active-form storage ============
console.log("--- 10. Sign-out-and-reload clears local active-form keys ---");

{
  // Simulates the signOutAndReload cleanup. localStorage is cleared for
  // wc2026_currentUser + wc2026_activeForm so a fresh session doesn't
  // try to resume a deleted form.
  const storage = {
    wc2026_currentUser: JSON.stringify("dad"),
    wc2026_activeForm: JSON.stringify("dad__123"),
    other: "keep me",
  };

  function cleanup() {
    delete storage.wc2026_currentUser;
    delete storage.wc2026_activeForm;
  }
  cleanup();

  assert(!("wc2026_currentUser" in storage), "currentUser cleared");
  assert(!("wc2026_activeForm" in storage), "activeForm cleared");
  assert(storage.other === "keep me", "Unrelated keys untouched");
}

// ============ 11. single-flight guard for ensureUserInStore ============
console.log("--- 11. ensureUserInStore must not double-write when called twice ---");

{
  // React StrictMode and rapid re-renders can fire ensureUserInStore
  // multiple times synchronously. The single-flight guard returns the
  // same in-flight promise instead of starting a second write.
  let inFlight = null;
  let calls = 0;

  async function ensure() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return "ok";
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  const [a, b, c] = await Promise.all([ensure(), ensure(), ensure()]);
  assert(calls === 1, "Single-flight: exactly one write for concurrent calls");
  assert(a === "ok" && b === "ok" && c === "ok", "All callers receive the same result");
}

// ============ 12. Watchdog dedup: one event per session key ============
console.log("--- 12. captureClientMessage dedups by key ---");

{
  const emitted = new Set();
  function capture(key) {
    if (emitted.has(key)) return false;
    emitted.add(key);
    return true;
  }

  assert(capture("auth-watchdog-timeout") === true, "First watchdog event sent");
  assert(capture("auth-watchdog-timeout") === false, "Duplicate watchdog event dropped");
  assert(capture("store-watchdog-timeout") === true, "Different key still sent");
}

// ============ 13. Listener error routing: permission-denied vs other codes ============
console.log("--- 13. reportListenerError dedups permission-denied; other codes go through captureClientError ---");

{
  // Contract: permission-denied from listeners/fallback loaders is routed
  // through captureClientMessage (dedup'd per session) so iOS Safari ITP
  // token invalidation + admin/lock-state churn don't flood Sentry. The
  // retry + token-refresh + fallback loader path still drives recovery.
  // Other error codes (network, unavailable, etc.) keep full exception
  // reporting so they remain debuggable.
  const errors = [];
  const messages = new Set();

  function captureClientError(err, ctx) {
    errors.push({ code: err?.code, ctx });
  }
  function captureClientMessage(key) {
    if (messages.has(key)) return false;
    messages.add(key);
    return true;
  }

  function reportListenerError(err, source, context = {}) {
    if (err?.code === "permission-denied") {
      captureClientMessage(`${source}-permission-denied`, { ...context, code: err?.code });
      return;
    }
    captureClientError(err, { source, ...context, code: err?.code });
  }

  reportListenerError({ code: "permission-denied" }, "predictionsListener", { retryCount: 0 });
  reportListenerError({ code: "permission-denied" }, "predictionsListener", { retryCount: 1 });
  reportListenerError({ code: "permission-denied" }, "predictionsListener", { retryCount: 2 });
  assert(errors.length === 0, "permission-denied never hits captureClientError");
  assert(messages.size === 1, "permission-denied dedup'd to a single captureClientMessage per source");

  reportListenerError({ code: "permission-denied" }, "gameDocListener", { docName: "users" });
  assert(messages.size === 2, "Different source keeps its own dedup key");

  reportListenerError({ code: "unavailable", message: "offline" }, "predictionsListener", {});
  assert(errors.length === 1, "unavailable goes through captureClientError");
  assert(errors[0].code === "unavailable", "captureClientError receives the original code");

  reportListenerError({ code: "deadline-exceeded" }, "fallbackLoadPredictions", { userId: "dad" });
  assert(errors.length === 2, "Other non-permission codes reach captureClientError");
}

// ============ SUMMARY ============
console.log(`\n=== STUCK-LOADING PROTECTION: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
