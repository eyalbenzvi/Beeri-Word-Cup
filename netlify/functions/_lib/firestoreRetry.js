// Shared retry wrapper for Firestore Admin-SDK reads inside Netlify functions.
//
// Why this exists: the public read functions (get-public-tournament-data,
// get-public-settings, get-public-summaries) do plain `await db...get()` calls
// with no retry. A single transient network blip between the Lambda (AWS
// us-east-1) and firestore.googleapis.com — observed in Sentry as
// `FetchError: connect ETIMEDOUT ...:443` — bubbles straight up to a 500 the
// guest sees as `public-tournament-fetch-500`. These are momentary: a short
// backoff-and-retry absorbs them without the user noticing.
//
// Scope: ONLY transient/connection-class failures are retried. A real error
// (bad rules, missing config, malformed data) is not transient, so it fails
// fast on the first attempt and the caller's existing error path returns the
// generic 500 — we don't want to sit in a retry loop on a permanent fault.

// Node's `connect ETIMEDOUT` etc. arrive as err.code = 'ETIMEDOUT'. The gRPC /
// Google-API layer surfaces transient backend trouble as numeric status codes
// (14 = UNAVAILABLE, 4 = DEADLINE_EXCEEDED) or the matching string. We match on
// both the code and a message substring so we catch the failure regardless of
// which layer raised it.
const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  14, // gRPC UNAVAILABLE
  4, // gRPC DEADLINE_EXCEEDED
  "14",
  "4",
]);

// Match on specific connection/error TOKENS, not loose words like "connect" or
// "network" — a permanent fault ("Could not load default credentials … unable
// to connect") must NOT be misclassified as transient and retried under load.
const TRANSIENT_MESSAGE_RE =
  /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|UNAVAILABLE|DEADLINE_EXCEEDED|firestore-op-timeout/i;

export function isTransientFirestoreError(err) {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  // firebase-admin nests the original cause under err.cause / err.errorInfo on
  // some failure shapes; check the flattened message as a fallback.
  const msg = String(err.message || err.cause?.message || "");
  return TRANSIENT_MESSAGE_RE.test(msg);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Run `op` (a function returning a Promise), retrying it on transient failures
// with exponential backoff. Each attempt is bounded by `timeoutMs` so a hung
// connection (a real `connect ETIMEDOUT` can sit at the OS level for ~20s) is
// cut short and retried instead of stalling the whole Lambda. A non-transient
// error throws immediately; a transient error throws only after `retries`
// attempts are exhausted, preserving the original error for the caller's
// logging.
//
// Budget: this MUST finish inside Netlify's ~10s synchronous-function limit, or
// the platform kills the Lambda mid-retry and the retries never run. With the
// defaults the worst case (every attempt hits the timeout) is
// 2500 + 300 + 2500 + 600 + 2500 = 8.4s — comfortably under 10s — while the
// realistic fast-reject case is sub-second.
export async function withFirestoreRetry(
  op,
  { retries = 2, baseDelayMs = 300, timeoutMs = 2500 } = {},
) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let timer;
    try {
      return await Promise.race([
        op(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Object.assign(new Error("firestore-op-timeout"), { code: "ETIMEDOUT" })),
            timeoutMs,
          );
        }),
      ]);
    } catch (err) {
      lastErr = err;
      if (!isTransientFirestoreError(err) || attempt === retries) throw err;
      await sleep(baseDelayMs * Math.pow(2, attempt)); // 300ms, 600ms, ...
    } finally {
      clearTimeout(timer); // don't leave the timeout timer armed after settle
    }
  }
  throw lastErr;
}
