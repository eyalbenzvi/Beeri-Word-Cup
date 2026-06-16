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

export function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      const isChunkError = isChunkLoadError(err?.message);
      let alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1"; } catch { /* ignore */ }
      if (isChunkError && !alreadyReloaded) {
        try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* ignore */ }
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    }
  });
}
