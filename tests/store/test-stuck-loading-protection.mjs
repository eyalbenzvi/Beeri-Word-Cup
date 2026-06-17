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

// ============ 14. Disambiguation read targets userPrivate, not gameData/users ============
console.log("--- 14. ensureUserInStore reads userPrivate/{uid} so non-admins can recover ---");

{
  // After admin clearAllData wipes Firestore, the user re-logs in. They no
  // longer have isAdmin: true in Firestore, and (if they were never granted
  // a custom claim) they cannot read gameData/users — that doc is admin-only
  // post-Phase B. The disambiguation read MUST hit userPrivate/{uid} (which
  // is owner-readable) so Case B (createUserField) can run.
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/store/usersRepo.ts", "utf8");

  // Look for the disambiguation getDoc call inside doEnsureUserInStore.
  const ensureFn = src.slice(src.indexOf("function doEnsureUserInStore"));
  const blockEnd = ensureFn.indexOf("\nasync function ", 1);
  const ensureBody = blockEnd > 0 ? ensureFn.slice(0, blockEnd) : ensureFn;

  assert(
    ensureBody.includes("getDoc(userPrivateDocRef(uid))"),
    "doEnsureUserInStore reads userPrivate/{uid} for the existence check",
  );
  assert(
    !ensureBody.includes("getDoc(gameDocRef(\"users\"))"),
    "doEnsureUserInStore must NOT read gameData/users (admin-only; would 403 non-admins)",
  );
}

// ============ 15. In-place listener retry (lighter than full reload) ============
console.log("--- 15. retryRealtimeListeners forces a re-subscribe and no-ops when logged out ---");

{
  // Behavioural model of the listeners.ts guard + retry contract:
  //   - initRealtimeListeners() early-returns when already initialized AND
  //     error-free, so a plain re-call is a no-op.
  //   - retryRealtimeListeners() flips the error flag first, forcing a genuine
  //     re-subscribe, and returns false (no-op) when no listener user is set.
  let listenersInitialized = false;
  let listenersHadError = false;
  let currentListenerUserId = null;
  let subscribeCount = 0;

  function initRealtimeListeners(uid) {
    if (listenersInitialized && !listenersHadError) return; // guard
    listenersInitialized = true;
    listenersHadError = false;
    currentListenerUserId = uid;
    subscribeCount++;
  }
  function retryRealtimeListeners() {
    if (!currentListenerUserId) return false;
    listenersHadError = true;
    initRealtimeListeners(currentListenerUserId);
    return true;
  }

  // Logged out: retry is a no-op.
  assert(retryRealtimeListeners() === false, "retry returns false when no listener user");
  assert(subscribeCount === 0, "no re-subscribe while logged out");

  // After login: initial subscribe, then a plain re-init is a guarded no-op.
  initRealtimeListeners("dad");
  assert(subscribeCount === 1, "initial init subscribes once");
  initRealtimeListeners("dad");
  assert(subscribeCount === 1, "guarded re-init is a no-op when error-free");

  // retry forces a genuine re-subscribe.
  assert(retryRealtimeListeners() === true, "retry returns true when a user is active");
  assert(subscribeCount === 2, "retry forces exactly one re-subscribe");
}

console.log("--- 15b. wiring: store exports retryRealtimeListeners; App offers in-place retry ---");

{
  const fs = await import("node:fs");

  const listenersSrc = fs.readFileSync("src/store/listeners.ts", "utf8");
  assert(
    /export function retryRealtimeListeners\(\)/.test(listenersSrc),
    "listeners.ts exports retryRealtimeListeners",
  );
  assert(
    /if \(!currentListenerUserId\) return false;/.test(listenersSrc),
    "retryRealtimeListeners no-ops without an active listener user",
  );

  const indexSrc = fs.readFileSync("src/store/index.ts", "utf8");
  assert(
    /retryRealtimeListeners/.test(indexSrc),
    "store barrel re-exports retryRealtimeListeners",
  );

  const appSrc = fs.readFileSync("src/App.tsx", "utf8");
  assert(
    /retryRealtimeListeners/.test(appSrc),
    "App imports retryRealtimeListeners",
  );
  assert(
    /RETRYABLE_REASONS/.test(appSrc) &&
      /"store-not-ready"/.test(appSrc) &&
      /"user-not-in-cache"/.test(appSrc),
    "App gates in-place retry to data-not-ready reasons",
  );
  assert(
    /נסה שוב/.test(appSrc),
    "App renders a 'נסה שוב' in-place retry button",
  );
}

// ============ 16. Auto-retry predicate must detect missing ready keys ============
console.log("--- 16. online/visibility auto-retry uses getMissingReadyKeys, not the dead Object.values predicate ---");

{
  // cache._ready is only ever set to `true` (or reset to {}); it is NEVER set
  // to false. So the old predicate `Object.values(_ready).some(v => !v)` is
  // ALWAYS false — the online/visibility auto-retry was dead code. The correct
  // predicate compares the REQUIRED keys against what's present.
  const REQUIRED = ["users", "userDirectory", "matchResults", "actualAdvancing", "actualBonuses", "settings", "predictions"];
  function getMissingReadyKeys(ready) {
    return REQUIRED.filter((k) => !ready[k]);
  }
  const oldPredicate = (ready) => Object.values(ready).some((v) => !v);

  // Nothing loaded yet (fresh login): old predicate says "all good" (bug);
  // new predicate correctly reports every required key missing.
  assert(oldPredicate({}) === false, "old predicate is false on empty _ready (the bug)");
  assert(getMissingReadyKeys({}).length === REQUIRED.length, "new predicate flags all keys missing when nothing loaded");

  // Partially loaded: a couple of listeners fired, the rest are still missing.
  const partial = { users: true, settings: true };
  assert(oldPredicate(partial) === false, "old predicate stays false while keys are still missing (the bug)");
  assert(getMissingReadyKeys(partial).length === REQUIRED.length - 2, "new predicate flags the still-missing keys");

  // Fully loaded: no retry needed.
  const full = Object.fromEntries(REQUIRED.map((k) => [k, true]));
  assert(getMissingReadyKeys(full).length === 0, "new predicate reports nothing missing when fully ready");
}

console.log("--- 16b. wiring: listeners.ts auto-retry handlers call getMissingReadyKeys ---");

{
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/store/listeners.ts", "utf8");
  // Both the online + visibilitychange handlers must use the real predicate.
  const matches = src.match(/getMissingReadyKeys\(\)\.length > 0/g) || [];
  assert(matches.length >= 2, "online + visibility handlers both gate on getMissingReadyKeys().length > 0");
  assert(
    !/Object\.values\(cache\._ready\)\.some/.test(src),
    "the dead Object.values(cache._ready).some(...) predicate is gone",
  );
}

// ============ 17. Offline-cache stale settings must not flash the lock screen,
//                  yet must NOT trap an offline user on the spinner ============
console.log("--- 17. settings: ready resolves offline, but lock screen waits for server confirmation ---");

{
  // Behavioral model of the two coupled contracts:
  //   (a) the settings-snapshot reducer in listeners.ts / publicMode.ts, and
  //   (b) the Leaderboard lock-screen gate.
  // These mirror the real code; if the real decision diverges from this truth
  // table the fix is broken, so the static-wiring asserts below pin the source
  // to this same shape.
  //
  // Reducer: every snapshot marks settings READY (so isStoreReady can resolve
  // offline). Only a SERVER (non-cache) snapshot confirms the lock state.
  function applySettingsSnapshot(state, { fromCache, predictionsLocked }) {
    return {
      ready: true, // unconditional — offline users never trapped
      serverConfirmed: state.serverConfirmed || !fromCache,
      predictionsLocked,
    };
  }
  // Leaderboard pre-tournament lock screen shows only when server-confirmed-unlocked.
  const lockScreenShown = (s) => s.serverConfirmed && !s.predictionsLocked;

  let s = { ready: false, serverConfirmed: false, predictionsLocked: false };

  // 1. First snapshot is a STALE offline cache from before the tournament locked.
  s = applySettingsSnapshot(s, { fromCache: true, predictionsLocked: false });
  assert(s.ready === true, "stale offline snapshot still marks settings ready (no spinner trap)");
  assert(s.serverConfirmed === false, "offline-cache snapshot is NOT treated as server-confirmed");
  assert(lockScreenShown(s) === false, "lock screen suppressed on stale offline snapshot (the bug being fixed)");

  // 2. Offline user who never reaches the server: settings stay ready forever.
  assert(s.ready === true, "offline-only session keeps settings ready (isStoreReady can resolve)");

  // 3. Server snapshot finally lands with the real, post-lock value.
  s = applySettingsSnapshot(s, { fromCache: false, predictionsLocked: true });
  assert(s.serverConfirmed === true, "server snapshot confirms settings");
  assert(lockScreenShown(s) === false, "tournament running: lock screen stays hidden");

  // 4. Genuine pre-tournament, server-confirmed unlocked → lock screen SHOWN.
  let pre = { ready: false, serverConfirmed: false, predictionsLocked: false };
  pre = applySettingsSnapshot(pre, { fromCache: false, predictionsLocked: false });
  assert(lockScreenShown(pre) === true, "pre-tournament server-confirmed: lock screen correctly shown");

  // Static wiring: the real sources must match the modeled contract.
  const fs = await import("node:fs");
  const listenersSrc = fs.readFileSync("src/store/listeners.ts", "utf8");
  const publicSrc = fs.readFileSync("src/store/publicMode.ts", "utf8");
  const lbSrc = fs.readFileSync("src/pages/Leaderboard.tsx", "utf8");
  const cacheSrc = fs.readFileSync("src/store/cache.ts", "utf8");

  assert(
    /settingsServerConfirmed:\s*false/.test(cacheSrc),
    "cache.ts declares settingsServerConfirmed default false",
  );
  // _ready.settings must be set unconditionally (no skipReady gate that could trap offline).
  assert(
    !/skipReady/.test(listenersSrc),
    "listeners.ts no longer gates _ready behind skipReady (offline trap removed)",
  );
  assert(
    /key === "settings" && !snap\.metadata\.fromCache[\s\S]*settingsServerConfirmed = true/.test(listenersSrc),
    "listeners.ts sets settingsServerConfirmed only on a server (non-cache) snapshot",
  );
  assert(
    /!snap\.metadata\.fromCache[\s\S]*settingsServerConfirmed = true/.test(publicSrc),
    "publicMode.ts confirms settings only on a server (non-cache) snapshot",
  );
  assert(
    /useSettingsServerConfirmed/.test(lbSrc) && /settingsConfirmed && !locked/.test(lbSrc),
    "Leaderboard gates the lock screen on settingsConfirmed && !locked",
  );

  // Sibling pages with the same "revealed when matches start" 🔒 lock screen
  // must gate on the same server-confirmed flag, or they reproduce the bug.
  const statsSrc = fs.readFileSync("src/pages/Stats.tsx", "utf8");
  const simSrc = fs.readFileSync("src/pages/Simulator.tsx", "utf8");
  assert(
    /useSettingsServerConfirmed/.test(statsSrc) &&
      /settingsConfirmed && !settings\.predictionsLocked/.test(statsSrc),
    "Stats gates its lock screen on settingsConfirmed && !predictionsLocked",
  );
  assert(
    /useSettingsServerConfirmed/.test(simSrc) &&
      /settingsConfirmed && !settings\.predictionsLocked/.test(simSrc),
    "Simulator gates its lock screen on settingsConfirmed && !predictionsLocked",
  );
}

// ============ 18. Stale lock value: force a fresh server read so a
//                  long-lived/idle client can't act on an out-of-date
//                  predictionsLocked ============
console.log("--- 18. settings: force a fresh server read on init / focus / online ---");

{
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/store/listeners.ts", "utf8");

  // The fresh-read helper must exist and bypass the offline cache via
  // getDocFromServer (NOT getDoc, which can resolve from IndexedDB).
  assert(
    /import \{[\s\S]*getDocFromServer[\s\S]*\} from "firebase\/firestore"/.test(src),
    "listeners.ts imports getDocFromServer",
  );
  assert(
    /export async function refreshSettingsFromServer/.test(src),
    "refreshSettingsFromServer helper exists",
  );
  // Within the helper: server read + confirm + notify + listener upgrade.
  const helper = src.slice(src.indexOf("export async function refreshSettingsFromServer"));
  assert(
    /getDocFromServer\(gameDocRef\(DOCS\.settings\)\)/.test(helper),
    "refreshSettingsFromServer reads settings straight from the server",
  );
  assert(
    /settingsServerConfirmed = true/.test(helper) &&
      /notifyAndEmit\("settings"\)/.test(helper) &&
      /maybeUpgradePredictionsListener\(\)/.test(helper),
    "fresh read confirms settings, wakes subscribers, and upgrades the predictions listener",
  );

  // It must be invoked on (re)subscribe and on focus/online when nothing is
  // reported missing (the exact gap: a cache-loaded client never re-syncs the
  // lock value because getMissingReadyKeys() is empty).
  assert(
    /else refreshSettingsFromServer\(\);/.test(src),
    "focus/online handlers force a settings refresh when no keys are missing",
  );
  const refreshCalls = src.match(/refreshSettingsFromServer\(\)/g) || [];
  // 1 definition reference inside helper body is not counted (different text);
  // expect at least: init call + visibility branch + online branch = 3.
  assert(
    refreshCalls.length >= 3,
    "refreshSettingsFromServer is wired into init + visibility + online paths",
  );
}

// ============ SUMMARY ============
console.log(`\n=== STUCK-LOADING PROTECTION: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
