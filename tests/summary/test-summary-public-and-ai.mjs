// Static audits for the public-blog path and the summary-ai Netlify function.
// These touch Firebase listeners / Groq / Firestore Admin SDK, so we can't
// run them end-to-end from Node; we assert that the guardrails exist in
// source form. Complements the dynamic summary-stats test suite.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== SUMMARY PUBLIC + AI AUDIT ===\n");

// ============ 1. Public-readonly mode ============
console.log("--- 1. public-readonly mode in store.js ---");
// After store/* split, summary + listener code lives in store/*.ts modules.
let storeSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/store.js", "utf8");
for (const p of [
  "/home/user/Beeri-World-Cup/src/store/summariesRepo.ts",
  "/home/user/Beeri-World-Cup/src/store/listeners.ts",
  "/home/user/Beeri-World-Cup/src/store/publicMode.ts",
  "/home/user/Beeri-World-Cup/src/store/usersRepo.ts",
  "/home/user/Beeri-World-Cup/src/store/cache.ts",
  "/home/user/Beeri-World-Cup/src/store/firestoreClient.ts",
]) {
  try { storeSrc += "\n" + readMigratedSrc(p, "utf8"); } catch { /* not split yet */ }
}
assert(storeSrc.includes("initPublicReadonlyMode"), "public init exported");
assert(storeSrc.includes("teardownPublicReadonlyMode"), "public teardown exists");
assert(/initRealtimeListeners[\s\S]*?teardownPublicReadonlyMode/.test(storeSrc),
  "teardown runs before auth listeners start");
assert(storeSrc.includes("get-public-settings"),
  "public mode pulls settings + results via the public endpoint");
// Public summaries used to use a browser-side onSnapshot listener; that
// path was observed to hang silently in incognito (no success, no error
// fired). It's now a Netlify-function fetch using the Admin SDK
// server-side, mirroring get-public-settings. The auth listener still
// filters to published for non-admins.
assert(storeSrc.includes("get-public-summaries"),
  "public mode pulls summaries via the public endpoint");
assert(
  /query\(summariesCollectionRef,\s*where\("status",\s*"==",\s*"published"\)\)/.test(storeSrc),
  "auth summaries listener filters to published for non-admins",
);
// Mark other _ready keys so the UI doesn't wait for user/predictions streams
assert(/cache\._ready\[key\]\s*=\s*true/.test(storeSrc),
  "unused keys are marked ready in public mode");

// Regression: when get-public-settings returns a non-ok response (e.g. the
// production 403 host_not_allowed edge rejection), the failsafe at the end
// of fetchPublicSettingsOnce must still mark settings/matchResults ready —
// otherwise the blog page is trapped on the "טוען..." spinner. The bug
// was an early `if (!res.ok) return;` inside the try block that exited the
// function before the failsafe could run.
{
  const fnMatch = storeSrc.match(/async function fetchPublicSettingsOnce\(\)[\s\S]*?\n\}/);
  assert(fnMatch, "fetchPublicSettingsOnce found");
  const body = fnMatch ? fnMatch[0] : "";
  assert(!/if\s*\(\s*!res\.ok\s*\)\s*return\s*;/.test(body),
    "fetchPublicSettingsOnce does not early-return on non-ok response (would skip failsafe)");
  assert(/if\s*\(\s*!succeeded\s*&&\s*publicModeInitialized\s*\)\s*\{[\s\S]*?cache\._ready\.settings\s*=\s*true/.test(body),
    "fetchPublicSettingsOnce failsafe marks settings ready on failure");
}

// gameData/settings is publicly readable (firestore.rules), so the blog's
// predictionsLocked gate must not depend on the Netlify function alone.
// initPublicReadonlyMode subscribes directly so the blog renders even when
// the endpoint is blocked.
assert(/publicSettingsUnsub\s*=\s*onSnapshot\(\s*gameDocRef\("settings"\)/.test(storeSrc),
  "public mode subscribes to gameData/settings directly via Firestore");
assert(/teardownPublicReadonlyMode[\s\S]*?publicSettingsUnsub\s*\(\s*\)/.test(storeSrc),
  "public-mode teardown unsubscribes the direct settings listener");

// Hard watchdog: even if BOTH the Firestore listener and the Netlify
// function go silent (no success, no error), the readiness flags must
// flip after a fixed timeout so the visitor never sits on "טוען..."
// indefinitely. Several past fixes have closed individual failure paths
// only for new ones to emerge; the watchdog is the catch-all.
assert(/PUBLIC_READINESS_WATCHDOG_MS\s*=\s*\d+/.test(storeSrc),
  "public-mode watchdog timeout constant defined");
assert(/markPublicReadinessForced/.test(storeSrc),
  "public-mode watchdog has a forced-readiness routine");
assert(/publicReadinessWatchdog\s*=\s*setTimeout\(\s*markPublicReadinessForced/.test(storeSrc),
  "initPublicReadonlyMode arms the watchdog");
assert(/teardownPublicReadonlyMode[\s\S]*?clearTimeout\(\s*publicReadinessWatchdog\s*\)/.test(storeSrc),
  "teardown clears the watchdog timer");
// Forced path must mark BOTH summaries and settings ready — either alone
// would still trap the gate `blogDataReady = settingsReady && summariesReady`.
{
  const forcedFn = storeSrc.match(/function markPublicReadinessForced\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert(/cache\._ready\.summaries\s*=\s*true/.test(forcedFn),
    "watchdog forces _ready.summaries true");
  assert(/cache\._ready\.settings\s*=\s*true/.test(forcedFn),
    "watchdog forces _ready.settings true");
  assert(/notifyAndEmit\("summaries"\)/.test(forcedFn),
    "watchdog notifies summaries subscribers");
  assert(/notifyAndEmit\("settings"\)/.test(forcedFn),
    "watchdog notifies settings subscribers");
}

// Same regression as fetchPublicSettingsOnce: a non-ok response or thrown
// fetch must still hit the failsafe that flips _ready.summaries, otherwise
// an outage of the public summaries endpoint would trap guests on the
// "טוען..." spinner.
{
  const fnMatch = storeSrc.match(/async function fetchPublicSummariesOnce\(\)[\s\S]*?\n\}/);
  assert(fnMatch, "fetchPublicSummariesOnce found");
  const body = fnMatch ? fnMatch[0] : "";
  assert(!/if\s*\(\s*!res\.ok\s*\)\s*return\s*;/.test(body),
    "fetchPublicSummariesOnce does not early-return on non-ok response (would skip failsafe)");
  assert(/if\s*\(\s*!succeeded\s*&&\s*publicModeInitialized\s*\)\s*\{[\s\S]*?cache\._ready\.summaries\s*=\s*true/.test(body),
    "fetchPublicSummariesOnce failsafe marks summaries ready on failure");
  // Second transport: when the Netlify function fails, guests fall back to
  // a one-shot direct Firestore read of the published set (allowed unauth
  // by firestore.rules) BEFORE giving up and flipping readiness over an
  // empty cache. Without this, any function outage / missing deploy renders
  // a false "אין עדיין סיכומים" to every logged-out visitor.
  assert(/fetchSummariesDirectFallback\(\)/.test(body),
    "fetchPublicSummariesOnce failure path tries the direct Firestore fallback");
}

// The direct fallback itself: published-only query (matches the rules'
// provably-safe filter) wrapped in withTimeout so a hung unauth transport
// resolves into a rejection instead of trapping the viewer.
{
  const fbFn = storeSrc.match(/async function fetchSummariesDirectFallback\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert(fbFn.length > 0, "fetchSummariesDirectFallback exists in publicMode");
  assert(/where\("status",\s*"==",\s*"published"\)/.test(fbFn),
    "direct fallback queries published summaries only");
  assert(/withTimeout\(/.test(fbFn),
    "direct fallback is wrapped in withTimeout (cannot hang forever)");
  assert(/if\s*\(!publicModeInitialized\)\s*return/.test(fbFn),
    "direct fallback re-checks public-mode teardown after the await");
  assert(/cache\.summaries\s*=\s*map[\s\S]*?cache\._ready\.summaries\s*=\s*true[\s\S]*?notifyAndEmit\("summaries"\)/.test(fbFn),
    "direct fallback populates cache, flips readiness, and notifies");
}

// Defense against a synchronous throw inside the settings success handler —
// onSnapshot does NOT route success-callback exceptions through the error
// handler, so without try/catch the readiness flag could permanently stay
// false. (Summaries no longer uses onSnapshot in public mode.)
{
  const initFn = storeSrc.match(/export function initPublicReadonlyMode\(\)[\s\S]*?\n\}/)?.[0] || "";
  assert(/cache\.settings\s*=\s*\{[\s\S]*?\}\s*;\s*\}\s*catch[\s\S]*?\}\s*cache\._ready\.settings\s*=\s*true/.test(initFn),
    "settings listener: ready flag flipped after try/catch");
}

// ============ 2. App.jsx gating ============
console.log("--- 2. App.jsx public-mode gating ---");
const appSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/App.jsx", "utf8");
assert(appSrc.includes("initPublicReadonlyMode"), "App imports public init");
// Offline-mode rollout: every guest tab now shares the public-readonly
// listener, not just blog. Two contracts replace the previous blog-only
// branch:
//   1. The GUEST_PAGES allow-list explicitly enumerates which pages a
//      logged-out visitor may render (blog must be in there).
//   2. The unauth branch still routes to AppShell for any tab inside
//      GUEST_PAGES — meaning a shared blog link still resolves to the
//      DailySummary page exactly like before.
assert(/GUEST_PAGES\s*=\s*new\s+Set\(\[[^\]]*"blog"/.test(appSrc),
  "GUEST_PAGES set includes blog");
assert(/!isLoggedIn[\s\S]{0,300}GUEST_PAGES\.has\(page\)/.test(appSrc),
  "unauth branch consults GUEST_PAGES allow-list");

// ============ 3. firestore.rules hardened shape ============
console.log("--- 3. firestore.rules shape caps ---");
const rulesSrc = readMigratedSrc("/home/user/Beeri-World-Cup/firestore.rules", "utf8");
assert(/d\.title\.size\(\)\s*<=\s*300/.test(rulesSrc), "title size cap");
assert(/d\.intro\.size\(\)\s*<=\s*20000/.test(rulesSrc), "intro size cap");
assert(/d\.conclusion\.size\(\)\s*<=\s*20000/.test(rulesSrc), "conclusion size cap");
assert(/d\.coveredMatchIds\.size\(\)\s*<=\s*40/.test(rulesSrc), "covered list cap");
assert(/d\.matchNotes\.size\(\)\s*<=\s*40/.test(rulesSrc), "matchNotes map cap");
assert(/request\.resource\.data\.authorUid\s*==\s*resource\.data\.authorUid/.test(rulesSrc),
  "authorUid immutable on update");
assert(/request\.resource\.data\.createdAt\s*==\s*resource\.data\.createdAt/.test(rulesSrc),
  "createdAt immutable on update");

// ============ 4. summary-ai.js hardening ============
console.log("--- 4. summary-ai.js hardening ---");
const aiSrc = readMigratedSrc("/home/user/Beeri-World-Cup/netlify/functions/summary-ai.js", "utf8");
assert(aiSrc.includes("verifyIdToken"), "verifies Firebase ID token");
assert(/caller\.isAdmin/.test(aiSrc), "rejects non-admin callers");
assert(aiSrc.includes("checkRateLimit"), "rate-limits per uid");
assert(/collection\("rateLimit"\)/.test(aiSrc), "uses Firestore rateLimit collection");
assert(/response_format:[\s\S]{0,80}type:\s*"json_object"/.test(aiSrc),
  "forces JSON response format");
// Control-token neutralization now lives in the shared _lib/sanitizeLlmInput
// module (tested in depth by tests/auth/test-llm-sanitize.mjs); summary-ai
// must route through it rather than keeping a duplicate local table.
assert(/from "\.\/_lib\/sanitizeLlmInput\.js"/.test(aiSrc),
  "neutralizes LLM control tokens via the shared sanitizer");
assert(aiSrc.includes("USER_CONTENT_BEGIN") || aiSrc.includes("FACTS_BEGIN"),
  "delimits user content to reduce injection risk");
assert(/MAX_INPUT_CHARS\s*=\s*6000/.test(aiSrc), "input length is clamped");
assert(/validSummaryShape|typeof\s+out\?\.title\s*!==\s*"string"/.test(aiSrc),
  "validates AI response shape");

// ============ 5. og-summary.js safety ============
console.log("--- 5. og-summary.js safety ---");
const ogSrc = readMigratedSrc("/home/user/Beeri-World-Cup/netlify/functions/og-summary.js", "utf8");
assert(ogSrc.includes("escapeHtml"), "HTML-escapes dynamic meta values");
assert(/where\("status",\s*"==",\s*"published"\)/.test(ogSrc),
  "og-summary only reads published summaries");
assert(/\/\^\\d\+\$\//.test(ogSrc) || /\^\\d\+\$/.test(ogSrc),
  "n param is validated as digits");
// Redirect target for human browsers
assert(/refresh[^"]*url=/.test(ogSrc) || /window\.location\.replace/.test(ogSrc),
  "redirects humans to the SPA");

// ============ 6. netlify.toml rewrite ============
console.log("--- 6. netlify.toml redirect ---");
const tomlSrc = readMigratedSrc("/home/user/Beeri-World-Cup/netlify.toml", "utf8");
assert(tomlSrc.includes("/blog/:n"), "pretty URL for blog");
assert(tomlSrc.includes("og-summary"), "redirect target is the OG function");

// ============ 7. client-side size guard ============
console.log("--- 7. client-side size guard ---");
assert(storeSrc.includes("SUMMARY_LIMITS"), "client limits exported");
assert(storeSrc.includes("validateSummaryPayload"), "client validator exists");
assert(/title:\s*300/.test(storeSrc), "client title cap matches rules");
assert(/intro:\s*20000/.test(storeSrc), "client intro cap matches rules");
assert(/conclusion:\s*20000/.test(storeSrc), "client conclusion cap matches rules");

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
process.exit(0);
