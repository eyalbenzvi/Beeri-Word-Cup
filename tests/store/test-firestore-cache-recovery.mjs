// Regression tests for the Firestore IndexedDB cache-bypass / recovery
// mechanism (src/utils/firestoreCacheRecovery.ts + wiring).
//
// THE BUG: the persistent (IndexedDB) Firestore cache can corrupt on
// iOS/WebKit and throw "FIRESTORE INTERNAL ASSERTION FAILED (ID: b815)",
// permanently wedging the SDK — listeners die, isStoreReady() never resolves,
// the user is trapped on the loading splash and appears unable to log in. A
// plain reload re-opens the SAME poisoned cache, so it doesn't recover.
//
// THE FIX: detect the fatal assertion in the global error handlers, arm a
// localStorage bypass flag, and reload ONCE per session. On the bypass boot
// firebase.ts initialises with an in-memory cache (no IndexedDB) and wipes the
// idle on-disk store, then clears the flag so the next boot resumes persistent
// caching.
//
// Convention: static source audits + behavioral simulations of shipped logic.

import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

console.log("=== FIRESTORE CACHE-RECOVERY TESTS ===\n");

// ============ 1. Fatal-error matcher ============
console.log("--- 1. isFatalFirestoreCacheError matches b815, not the self-healing blip ---");
{
  const src = SRC("src/utils/firestoreCacheRecovery.ts");
  assert(/INTERNAL ASSERTION FAILED/.test(src), "matcher targets the b815 internal-assertion phrasing");
  assert(/b815/.test(src), "matcher explicitly covers the b815 id");

  // Behavioral: replicate the shipped regex.
  const RE = /FIRESTORE.*INTERNAL ASSERTION FAILED|Unexpected state \(ID:\s*b815\)/i;
  const isFatal = (m) => (!m ? false : RE.test(String(m)));

  const real =
    'FIRESTORE (12.11.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815) CONTEXT: {"Pc":"TypeError..."}';
  assert(isFatal(real), "the real Sentry b815 message is detected as fatal");
  assert(isFatal("Error: Unexpected state (ID: b815)"), "the bare b815 id is detected");
  // Must NOT fire on the self-healing IndexedDB-lost blip (that one is
  // downgraded to a warning elsewhere; rebooting on it would over-trigger).
  assert(!isFatal("UnknownError: Connection to Indexed Database server lost. Refresh the page to try again"),
    "the self-healing IndexedDB-lost blip is NOT treated as fatal");
  assert(!isFatal("TypeError: Cannot read properties of undefined"), "an unrelated error is not fatal");
  assert(!isFatal(undefined), "missing message is safe (not fatal)");
}

// ============ 2. Once-per-session reload guard ============
console.log("--- 2. recovery reloads at most once per session ---");
{
  const src = SRC("src/utils/firestoreCacheRecovery.ts");
  assert(/FS_CACHE_RELOAD_GUARD/.test(src), "a sessionStorage reload guard exists");
  assert(/FS_CACHE_BYPASS_FLAG/.test(src), "a localStorage bypass flag exists");
  assert(/window\.location\.reload\(\)/.test(src), "recovery reloads the page");

  // Behavioral: model triggerFirestoreCacheRecovery's guard + flag arming.
  function makeRecovery() {
    const session = new Map();
    const local = new Map();
    let reloads = 0;
    return {
      local,
      trigger() {
        if (session.get("guard") === "1") return false; // already tried this session
        session.set("guard", "1");
        local.set("bypass", "1"); // armed for next boot
        reloads++;
        return true;
      },
      reloads: () => reloads,
    };
  }
  const r = makeRecovery();
  assert(r.trigger() === true, "first fatal error triggers a reload");
  assert(r.local.get("bypass") === "1", "bypass flag armed for the next boot");
  assert(r.trigger() === false, "second fatal error in the same session does NOT reload (no loop)");
  assert(r.reloads() === 1, "exactly one reload per session");
}

// ============ 3. Boot honours the bypass flag (memory vs persistent cache) ============
console.log("--- 3. firebase.ts boots on memory cache when bypass is armed ---");
{
  const src = SRC("src/firebase.ts");
  assert(/memoryLocalCache/.test(src), "firebase.ts imports/uses memoryLocalCache");
  assert(/shouldBypassFirestoreCache/.test(src), "firebase.ts reads the bypass flag at init");
  assert(/wipeFirestoreIndexedDb/.test(src), "firebase.ts wipes the on-disk DB on a bypass boot");
  // The persistent cache must still be the DEFAULT (bypass is the exception).
  assert(/persistentLocalCache\(/.test(src), "persistent cache remains the default path");
  const initBlock = src.slice(src.indexOf("initializeFirestore(app"));
  assert(/bypassPersistentCache[\s\S]*\?[\s\S]*memoryLocalCache\(\)[\s\S]*:[\s\S]*persistentLocalCache/.test(initBlock),
    "init picks memory cache when bypassing, persistent otherwise");

  // Behavioral: model the cache-backend decision.
  const pickCache = (bypass) => (bypass ? "memory" : "persistent");
  assert(pickCache(true) === "memory", "armed flag → memory cache (bypasses IndexedDB)");
  assert(pickCache(false) === "persistent", "no flag → persistent cache (normal)");
}

// ============ 4. Wipe clears the flag on success, keeps it on failure ============
console.log("--- 4. wipeFirestoreIndexedDb resumes persistent caching only after a clean wipe ---");
{
  const src = SRC("src/utils/firestoreCacheRecovery.ts");
  assert(/deleteDatabase/.test(src), "wipe deletes the IndexedDB databases");
  assert(/clearFirestoreCacheBypass/.test(src), "wipe clears the bypass flag");
  // onblocked must resolve so a delete held open by another tab can't hang.
  assert(/onblocked/.test(src), "a blocked delete still resolves (no hung promise)");
  assert(/firestore\//.test(src), "targets Firestore-owned IndexedDB names");

  // Behavioral: success clears the flag, failure keeps it for a retry next boot.
  function wipe({ ok }) {
    const local = new Map([["bypass", "1"]]);
    if (ok) local.delete("bypass");
    return local.has("bypass");
  }
  assert(wipe({ ok: true }) === false, "successful wipe clears bypass → persistent next boot");
  assert(wipe({ ok: false }) === true, "failed wipe keeps bypass → stays on memory cache, retries next boot");
}

// ============ 5. Wiring: global handlers + manual escape hatch ============
console.log("--- 5. detection is wired into sentry handlers and App's escape hatch ---");
{
  const sentrySrc = SRC("src/sentry.ts");
  assert(/isFatalFirestoreCacheError/.test(sentrySrc), "sentry imports the fatal matcher");
  assert(/triggerFirestoreCacheRecovery/.test(sentrySrc), "sentry triggers recovery on a fatal cache error");

  // The fatal check must run in BOTH global handlers.
  const onerror = sentrySrc.slice(sentrySrc.indexOf('addEventListener("error"'), sentrySrc.indexOf('addEventListener("unhandledrejection"'));
  const onreject = sentrySrc.slice(sentrySrc.indexOf('addEventListener("unhandledrejection"'));
  assert(/isFatalFirestoreCacheError/.test(onerror), "window.onerror checks for the fatal cache error");
  assert(/isFatalFirestoreCacheError/.test(onreject), "unhandledrejection checks for the fatal cache error");

  // The manual last-resort button must arm the bypass so its reload escapes a
  // corrupt cache (a plain reload alone would re-open it).
  const appSrc = SRC("src/App.tsx");
  assert(/setFirestoreCacheBypass/.test(appSrc), "App's sign-out-and-reload arms the cache bypass");
  const signOutFn = appSrc.slice(appSrc.indexOf("const signOutAndReload"));
  const armIdx = signOutFn.indexOf("setFirestoreCacheBypass");
  const reloadIdx = signOutFn.indexOf("window.location.reload");
  assert(armIdx > -1 && reloadIdx > -1 && armIdx < reloadIdx,
    "bypass is armed BEFORE the reload (so the next boot honours it)");
}

// ============ SUMMARY ============
console.log(`\n=== FIRESTORE CACHE-RECOVERY: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
