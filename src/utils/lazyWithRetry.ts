import { lazy } from "react";
import { isChunkLoadError } from "./chunkErrors";

// React.lazy fails when a dynamic import 404s — happens to users who left the
// tab open across a deploy, since the old chunk hashes no longer exist on the
// CDN. One forced reload fetches a fresh index.html with the new chunk names.
// The sessionStorage flag prevents an infinite reload loop if the failure is
// real (network down, chunk genuinely broken), letting ErrorBoundary handle it.
// Namespace prefix matches every other client-side persisted key (`wc2026_*`).
const RELOAD_FLAG = "wc2026_chunkReloaded";
// One-time migration: tidy up the old prefix on read so users who sat
// across the deploy don't get their reload-guard ignored.
try { const old = sessionStorage.getItem("wc_chunkReloaded"); if (old != null) { sessionStorage.setItem(RELOAD_FLAG, old); sessionStorage.removeItem("wc_chunkReloaded"); } } catch { /* ignore */ }

// A dynamic import that 404s REJECTS (handled below). But on a flaky mobile
// connection the import can instead STALL — the request neither resolves nor
// rejects — and React.lazy() has no built-in timeout, so the user is left on
// the Suspense spinner indefinitely (the `loading-stuck` / reason:"lazy-page"
// Sentry signal). We race the import against a timeout so a stalled chunk turns
// into the SAME one-time reload recovery a 404 already triggers. The timeout
// sits well above App's 12s stuck-recovery UI (STUCK_THRESHOLD_MS), so the
// manual escape hatch shows first and this auto-reload only rescues a user who
// walked away; the once-per-session guard prevents a reload loop.
const LAZY_IMPORT_TIMEOUT_MS = 20000;
const LAZY_TIMEOUT_MESSAGE = "lazy-import-timeout";

function importWithTimeout(factory) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(LAZY_TIMEOUT_MESSAGE)), LAZY_IMPORT_TIMEOUT_MS);
  });
  const load = factory();
  // If the timeout wins the race, the still-pending import would later reject
  // into a promise nobody awaits → a spurious unhandledrejection in sentry.ts.
  // Attach a no-op catch so the loser is swallowed.
  load.catch(() => {});
  return Promise.race([load, timeout]).finally(() => clearTimeout(timer));
}

export function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      const mod = await importWithTimeout(factory);
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      // A stalled import (timeout) is recovered the same way as a stale 404:
      // one forced reload fetches fresh chunk names / a healthy connection.
      const recoverable =
        isChunkLoadError(err?.message) || err?.message === LAZY_TIMEOUT_MESSAGE;
      let alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1"; } catch { /* ignore */ }
      if (recoverable && !alreadyReloaded) {
        try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* ignore */ }
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    }
  });
}
