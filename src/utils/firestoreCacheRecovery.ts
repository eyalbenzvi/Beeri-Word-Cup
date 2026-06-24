// Firestore persistent-cache (IndexedDB) recovery / bypass mechanism.
//
// WHY THIS EXISTS
// ---------------
// `firebase.ts` initialises Firestore with `persistentLocalCache` — an
// IndexedDB-backed offline store. On iOS Safari/WebKit especially (ITP, tab
// backgrounding, BFCache, multi-tab) that store can wedge or corrupt and the
// SDK throws the infamous "FIRESTORE INTERNAL ASSERTION FAILED (ID: b815)".
// Once that fires the SDK's async queue is permanently dead: listeners stop,
// `isStoreReady()` never resolves, and the user is trapped on the loading
// splash — which presents as "I can't log in" even though auth itself is fine.
//
// A plain page reload does NOT recover, because the reload re-opens the very
// same corrupt IndexedDB. The only reliable escape is to *bypass* that cache:
// reboot the app on an in-memory cache (no IndexedDB at all), and wipe the
// poisoned on-disk store so the next session can return to persistent caching.
//
// HOW IT WORKS
// ------------
//   * A localStorage flag (FS_CACHE_BYPASS_FLAG) survives the reload and tells
//     `firebase.ts` to init with `memoryLocalCache()` instead of the persistent
//     one. That session is fully functional (it just loses offline persistence
//     until the cache is cleaned).
//   * A sessionStorage guard (FS_CACHE_RELOAD_GUARD) caps auto-recovery at ONE
//     reload per tab session, mirroring lazyWithRetry's RELOAD_FLAG, so a fault
//     that somehow survives the bypass can't loop the page forever — it falls
//     through to App's manual 12s recovery UI instead.
//   * On a bypass boot, `firebase.ts` calls wipeFirestoreIndexedDb(): it deletes
//     the idle Firestore IndexedDB databases, then clears the bypass flag so the
//     NEXT boot resumes normal persistent caching. If the wipe fails (e.g.
//     another tab holds the DB open), the flag stays set and we retry next boot.
//
// Namespace prefix (`wc2026_*`) matches every other client-side persisted key.

import { captureClientMessage } from "../sentry";

export const FS_CACHE_BYPASS_FLAG = "wc2026_fsCacheBypass";
export const FS_CACHE_RELOAD_GUARD = "wc2026_fsCacheRecovered";

// The fatal, UNRECOVERABLE Firestore signature. The b815 internal assertion
// kills the SDK's async queue for the rest of the page's life, so a reboot is
// the only fix. We intentionally do NOT match "Connection to Indexed Database
// server lost" here — that one is self-healing (sentry.ts downgrades it to a
// warning) and would over-trigger reboots on routine tab backgrounding.
const FATAL_FIRESTORE_CACHE_RE =
  /FIRESTORE.*INTERNAL ASSERTION FAILED|Unexpected state \(ID:\s*b815\)/i;

export function isFatalFirestoreCacheError(msg: unknown): boolean {
  if (!msg) return false;
  return FATAL_FIRESTORE_CACHE_RE.test(String(msg));
}

// Read by firebase.ts at init time to decide between memory and persistent
// cache. Wrapped in try/catch so a storage-disabled context (private-mode
// quirks) can never throw during bootstrap.
export function shouldBypassFirestoreCache(): boolean {
  try {
    return localStorage.getItem(FS_CACHE_BYPASS_FLAG) === "1";
  } catch {
    return false;
  }
}

// Arm bypass mode for the NEXT boot. Used both by the auto-recovery trigger and
// by App's manual "sign out & restart" escape hatch so a human-initiated reload
// also escapes a corrupt cache (a plain reload alone would not).
export function setFirestoreCacheBypass(): void {
  try {
    localStorage.setItem(FS_CACHE_BYPASS_FLAG, "1");
  } catch {
    /* storage unavailable — nothing we can do, app still boots persistent */
  }
}

export function clearFirestoreCacheBypass(): void {
  try {
    localStorage.removeItem(FS_CACHE_BYPASS_FLAG);
  } catch {
    /* ignore */
  }
}

// Auto-recovery entry point, called from the global error handlers when a fatal
// Firestore-cache assertion is seen. Arms bypass mode and reloads ONCE per tab
// session. Returns true if it triggered the reload, false if the per-session
// guard already fired (so the caller lets the error fall through to normal
// handling / the manual recovery UI).
export function triggerFirestoreCacheRecovery(reason: string): boolean {
  let alreadyTried = false;
  try {
    alreadyTried = sessionStorage.getItem(FS_CACHE_RELOAD_GUARD) === "1";
  } catch {
    /* ignore */
  }
  if (alreadyTried) return false;
  try {
    sessionStorage.setItem(FS_CACHE_RELOAD_GUARD, "1");
  } catch {
    /* ignore */
  }
  setFirestoreCacheBypass();
  captureClientMessage("firestore-cache-recovery-triggered", { reason }, "warning");
  try {
    window.location.reload();
  } catch {
    /* non-browser context */
  }
  return true;
}

// Best-effort wipe of the on-disk Firestore IndexedDB. Safe to call only when
// the live Firestore instance is NOT using persistent storage this session
// (i.e. we booted in bypass/memory-cache mode) so the on-disk DB is idle.
// Resolves to true when the bypass flag was cleared (so persistent caching
// resumes next boot); false when the wipe couldn't complete and we should stay
// in bypass mode and retry on the next boot.
export async function wipeFirestoreIndexedDb(): Promise<boolean> {
  if (typeof indexedDB === "undefined") {
    // No IndexedDB at all (e.g. SSR/test) — nothing to wipe; resume normal mode.
    clearFirestoreCacheBypass();
    return true;
  }
  try {
    const names = await listFirestoreDbNames();
    await Promise.all(
      names.map(
        (name) =>
          new Promise<void>((resolve) => {
            try {
              const req = indexedDB.deleteDatabase(name);
              // Resolve on success, error, OR blocked — we never want a hung
              // delete (another open tab) to leave the promise pending forever.
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            } catch {
              resolve();
            }
          }),
      ),
    );
    clearFirestoreCacheBypass();
    captureClientMessage(
      "firestore-cache-wiped",
      { dbCount: names.length },
      "info",
    );
    return true;
  } catch {
    // Couldn't enumerate/delete — keep the bypass flag so we stay on memory
    // cache (fully functional) and retry the wipe on the next boot.
    return false;
  }
}

// Firestore's IndexedDB databases are named `firestore/<dbId>/<key>/main` (e.g.
// `firestore/[DEFAULT]/beeri-world-cup/main`). Prefer the standardised
// `indexedDB.databases()` enumeration where available (Chrome, Safari 14+) and
// delete anything Firestore owns; fall back to the well-known default name on
// engines that don't expose enumeration (older Firefox).
async function listFirestoreDbNames(): Promise<string[]> {
  try {
    const anyIdb = indexedDB as any;
    if (typeof anyIdb.databases === "function") {
      const dbs: Array<{ name?: string }> = await anyIdb.databases();
      const found = dbs
        .map((d) => d?.name)
        .filter((n): n is string => !!n && n.startsWith("firestore/"));
      if (found.length) return found;
    }
  } catch {
    /* fall through to the well-known name */
  }
  return ["firestore/[DEFAULT]/beeri-world-cup/main"];
}
