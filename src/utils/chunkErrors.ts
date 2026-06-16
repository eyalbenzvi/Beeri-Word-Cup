// Single source of truth for "stale dynamic-import chunk" error detection.
//
// When a user keeps a tab open across a deploy, the old chunk hashes vanish
// from the CDN and the next React.lazy() import 404s. Two places must agree on
// what that failure looks like:
//   - lazyWithRetry.ts — to trigger the one-time reload recovery.
//   - sentry.ts ignoreErrors — to drop the (recovered) noise from Sentry.
// Browsers phrase the failure differently: Chromium says "Failed to fetch
// dynamically imported module"; Safari/WebKit and Firefox say "error loading
// dynamically imported module". Keeping the list here prevents the two
// consumers from drifting when a new engine/phrasing is added.
export const CHUNK_ERROR_PATTERNS: RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk \d+ failed/i,
];

/** True when `message` looks like a stale-chunk dynamic-import failure. */
export function isChunkLoadError(message: unknown): boolean {
  const s = typeof message === "string" ? message : "";
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(s));
}
