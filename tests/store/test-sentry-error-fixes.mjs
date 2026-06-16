// Regression tests for the Sentry production-error review batch.
//
// Covers four fixes, each tied to a real issue seen in Sentry:
//   1. RangeError "Invalid time zone specified: Etc/Unknown"
//        → getUserTimeZone() must validate the resolved zone and fall back.
//   2. TypeError "error loading dynamically imported module" (Safari/WebKit)
//        → stale-chunk detection (reload recovery + Sentry ignoreErrors) must
//          match the WebKit/Firefox phrasing, from ONE shared source.
//   3. `public-settings-success` (118 events) and other info-level heartbeats
//        → info-level captureClientMessage must become a breadcrumb (recorded
//          every time, not deduped to once), never a standalone issue.
//   4. `loading-stuck` (user-not-in-cache) + createUserField permission-denied
//        → a transient permission-denied on first sign-in must be retried
//          in-place (read AND write paths) so the user isn't stranded.
//
// Mix of static source audits (the project's convention — see
// test-stuck-loading-protection #14) and behavioral simulations of the exact
// logic the source now ships.

import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

console.log("=== SENTRY ERROR-FIX REGRESSION TESTS ===\n");

// ============ 1. Timezone Etc/Unknown guard ============
console.log("--- 1. getUserTimeZone rejects Etc/Unknown / unusable zones ---");
{
  const src = SRC("src/utils/userTime.ts");
  assert(src.includes('=== "Etc/Unknown"'), "userTime guards against the literal Etc/Unknown value");
  assert(/isUsableTimeZone/.test(src), "userTime has an isUsableTimeZone validator");
  assert(
    src.includes("new Intl.DateTimeFormat(\"en-US\", { timeZone: tz })"),
    "validator proves usability by constructing a formatter with the zone",
  );

  // Behavioral: replicate the validator and confirm it rejects the bad zone
  // (which is exactly what throws RangeError downstream) and accepts a real one.
  function isUsableTimeZone(tz) {
    if (!tz || tz === "Etc/Unknown") return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }
    catch { return false; }
  }
  assert(isUsableTimeZone("Asia/Jerusalem"), "Real zone is usable");
  assert(isUsableTimeZone("America/New_York"), "Another real zone is usable");
  assert(!isUsableTimeZone("Etc/Unknown"), "Etc/Unknown is rejected (the crash trigger)");
  assert(!isUsableTimeZone(""), "Empty zone is rejected");
  assert(!isUsableTimeZone("Totally/Bogus"), "Bogus zone is rejected via formatter throw");

  // The downstream invariant the fix protects: building a formatter with the
  // FALLBACK must never throw, so the time layer can always render.
  let threw = false;
  try { new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem" }); } catch { threw = true; }
  assert(!threw, "Fallback zone Asia/Jerusalem always builds a formatter");
}

// ============ 2. Stale-chunk detection: shared source + WebKit phrasing ============
console.log("--- 2. Chunk-error detection is shared and covers Safari/WebKit + Firefox ---");
{
  const chunkSrc = SRC("src/utils/chunkErrors.ts");
  const lazySrc = SRC("src/utils/lazyWithRetry.ts");
  const sentrySrc = SRC("src/sentry.ts");

  // Single source of truth — both consumers import it, neither inlines its
  // own copy of the phrase list (the drift bug this batch fixes).
  assert(/CHUNK_ERROR_PATTERNS/.test(chunkSrc), "chunkErrors.ts exports CHUNK_ERROR_PATTERNS");
  assert(chunkSrc.includes("error loading dynamically imported module"), "shared list includes WebKit/Firefox phrasing");
  assert(/from "\.\/chunkErrors"/.test(lazySrc), "lazyWithRetry imports the shared chunk detector");
  assert(/from "\.\/utils\/chunkErrors"/.test(sentrySrc), "sentry imports the shared chunk patterns");
  assert(!/Failed to fetch dynamically imported module/.test(lazySrc),
    "lazyWithRetry no longer inlines its own chunk regex (no drift)");
  assert(!/Importing a module script failed/.test(sentrySrc),
    "sentry no longer inlines its own chunk regex (no drift)");

  // Behavioral: the shipped patterns must match BOTH engine phrasings and the
  // real Sentry title, while leaving unrelated TypeErrors alone.
  const CHUNK_ERROR_PATTERNS = [
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /Loading chunk \d+ failed/i,
  ];
  const isChunkLoadError = (m) => CHUNK_ERROR_PATTERNS.some((re) => re.test(typeof m === "string" ? m : ""));
  const webkitMsg =
    "error loading dynamically imported module: https://beeri-world-cup.netlify.app/assets/DailySummary-CWzI0G5P.js";
  const chromeMsg =
    "Failed to fetch dynamically imported module: https://beeri-world-cup.netlify.app/assets/Predict-abc123.js";
  assert(isChunkLoadError(webkitMsg), "Matches the real WebKit DailySummary failure (was unmatched before)");
  assert(isChunkLoadError(chromeMsg), "Still matches the Chrome phrasing");
  assert(isChunkLoadError("Importing a module script failed."), "Matches the Safari import-script phrasing");
  assert(!isChunkLoadError("TypeError: Cannot read properties of undefined"), "Does not swallow real TypeErrors");
  assert(!isChunkLoadError(undefined), "Non-string input is safe (no throw, no match)");
}

// ============ 3. info-level signals become breadcrumbs, recorded every time ============
console.log("--- 3. captureClientMessage routes info → breadcrumb (no dedup) ---");
{
  const src = SRC("src/sentry.ts");
  assert(src.includes('level === "info"'), "captureClientMessage branches on info level");
  assert(/addBreadcrumb/.test(src), "info path uses Sentry.addBreadcrumb");

  // The info branch must precede BOTH the dedup check and captureMessage, so
  // info short-circuits to a breadcrumb and is never deduped away.
  const fn = src.slice(src.indexOf("export function captureClientMessage"));
  const infoIdx = fn.indexOf('level === "info"');
  const dedupIdx = fn.indexOf("emittedOnce.has");
  const captureIdx = fn.indexOf("Sentry.captureMessage");
  assert(infoIdx > -1 && dedupIdx > -1 && infoIdx < dedupIdx,
    "info branch precedes the emittedOnce dedup (breadcrumbs recorded every time)");
  assert(infoIdx < captureIdx, "info branch precedes captureMessage (info never creates an issue)");

  // Behavioral: replicate the routing. info → breadcrumb every call; warning+
  // → one deduped issue per key.
  function makeRouter() {
    const emitted = new Set();
    const calls = { breadcrumb: 0, message: 0 };
    return {
      calls,
      capture(key, level) {
        if (level === "info") { calls.breadcrumb++; return; }
        if (emitted.has(key)) return;
        emitted.add(key);
        calls.message++;
      },
    };
  }
  const r = makeRouter();
  r.capture("public-settings-success", "info");
  r.capture("public-settings-success", "info");
  r.capture("public-settings-success", "info");
  assert(r.calls.breadcrumb === 3 && r.calls.message === 0, "info recorded every time, never an issue");
  r.capture("store-watchdog-timeout", "warning");
  r.capture("store-watchdog-timeout", "warning");
  assert(r.calls.message === 1, "warning → exactly one deduped issue");
}

// ============ 4. Transient permission-denied is retried in-place ============
console.log("--- 4. retryOnPermissionDenied covers the ensure read + write paths ---");
{
  const fcSrc = SRC("src/store/firestoreClient.ts");
  const usersSrc = SRC("src/store/usersRepo.ts");

  assert(/export async function retryOnPermissionDenied/.test(fcSrc),
    "firestoreClient exports retryOnPermissionDenied");
  assert(fcSrc.includes('err?.code !== "permission-denied"'),
    "retry only re-attempts on permission-denied; other errors rethrow immediately");
  assert(/maybeRefreshToken\(err\)/.test(fcSrc), "retry forces a token refresh between attempts");

  // The disambiguation read AND both batch commits go through the retry.
  assert(usersSrc.includes("retryOnPermissionDenied(() => getDoc(userPrivateDocRef(uid)))"),
    "ensure getDoc read is wrapped in retryOnPermissionDenied");
  assert((usersSrc.match(/retryOnPermissionDenied\(commitUserBatch\)/g) || []).length === 2,
    "both createUserField and updateUserField commits are wrapped (write path covered)");
  // The lingering-setTimeout retry approach (cross-user race) must be gone.
  assert(!/scheduleEnsureRetry/.test(usersSrc),
    "no lingering-timer retry (would fire across logout/re-login)");

  // Behavioral: model retryOnPermissionDenied. Op is re-invoked per attempt
  // (so a fresh batch can be built); a transient denial recovers; a
  // non-permission-denied error rethrows at once; the budget is bounded.
  async function retry(op, { retries = 2 } = {}) {
    for (let attempt = 0; ; attempt++) {
      try { return await op(); }
      catch (err) {
        if (err?.code !== "permission-denied" || attempt >= retries) throw err;
        // (real code refreshes token + backs off here)
      }
    }
  }

  // Denied on attempt 0, succeeds on attempt 1 (token propagated).
  let calls = 0;
  const ok = await retry(async () => {
    calls++;
    if (calls < 2) { const e = new Error("denied"); e.code = "permission-denied"; throw e; }
    return "written";
  });
  assert(ok === "written" && calls === 2, "Transient permission-denied recovers on retry (op re-invoked)");

  // Non-permission-denied rethrows immediately (no wasted retries).
  let netCalls = 0, threw = null;
  try {
    await retry(async () => { netCalls++; const e = new Error("offline"); e.code = "unavailable"; throw e; });
  } catch (e) { threw = e; }
  assert(threw && netCalls === 1, "Non-permission-denied error rethrows without retrying");

  // Permanent permission-denied exhausts the bounded budget then rethrows.
  let permCalls = 0, permThrew = null;
  try {
    await retry(async () => { permCalls++; const e = new Error("denied"); e.code = "permission-denied"; throw e; });
  } catch (e) { permThrew = e; }
  assert(permThrew && permCalls === 3, "Permanent denial tries 1 + 2 retries then rethrows (bounded, no hang)");
}

// ============ SUMMARY ============
console.log(`\n=== SENTRY ERROR FIXES: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
