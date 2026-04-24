// Static audits for the public-blog path and the summary-ai Netlify function.
// These touch Firebase listeners / Groq / Firestore Admin SDK, so we can't
// run them end-to-end from Node; we assert that the guardrails exist in
// source form. Complements the dynamic summary-stats test suite.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== SUMMARY PUBLIC + AI AUDIT ===\n");

// ============ 1. Public-readonly mode ============
console.log("--- 1. public-readonly mode in store.js ---");
const storeSrc = fs.readFileSync("/home/user/Beeri-World-Cup/src/store.js", "utf8");
assert(storeSrc.includes("initPublicReadonlyMode"), "public init exported");
assert(storeSrc.includes("teardownPublicReadonlyMode"), "public teardown exists");
assert(/initRealtimeListeners[\s\S]*?teardownPublicReadonlyMode/.test(storeSrc),
  "teardown runs before auth listeners start");
assert(storeSrc.includes("get-public-settings"),
  "public mode pulls settings + results via the public endpoint");
assert(
  /where\("status",\s*"==",\s*"published"\)/.test(storeSrc),
  "public summaries listener filters to published only",
);
// Mark other _ready keys so the UI doesn't wait for user/predictions streams
assert(/cache\._ready\[key\]\s*=\s*true/.test(storeSrc),
  "unused keys are marked ready in public mode");

// ============ 2. App.jsx gating ============
console.log("--- 2. App.jsx blog bypass ---");
const appSrc = fs.readFileSync("/home/user/Beeri-World-Cup/src/App.jsx", "utf8");
assert(appSrc.includes("initPublicReadonlyMode"), "App imports public init");
assert(/page\s*===\s*"blog"/.test(appSrc), "blog page gets bypass branch");
assert(/!isLoggedIn[\s\S]{0,200}page\s*===\s*"blog"/.test(appSrc),
  "unauth + blog page renders blog");

// ============ 3. firestore.rules hardened shape ============
console.log("--- 3. firestore.rules shape caps ---");
const rulesSrc = fs.readFileSync("/home/user/Beeri-World-Cup/firestore.rules", "utf8");
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
const aiSrc = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/summary-ai.js", "utf8");
assert(aiSrc.includes("verifyIdToken"), "verifies Firebase ID token");
assert(/caller\.isAdmin/.test(aiSrc), "rejects non-admin callers");
assert(aiSrc.includes("checkRateLimit"), "rate-limits per uid");
assert(/collection\("rateLimit"\)/.test(aiSrc), "uses Firestore rateLimit collection");
assert(/response_format:[\s\S]{0,80}type:\s*"json_object"/.test(aiSrc),
  "forces JSON response format");
assert(/CONTROL_TOKENS/.test(aiSrc), "strips LLM control tokens from user text");
assert(aiSrc.includes("USER_CONTENT_BEGIN") || aiSrc.includes("FACTS_BEGIN"),
  "delimits user content to reduce injection risk");
assert(/MAX_INPUT_CHARS\s*=\s*6000/.test(aiSrc), "input length is clamped");
assert(/validSummaryShape|typeof\s+out\?\.title\s*!==\s*"string"/.test(aiSrc),
  "validates AI response shape");

// ============ 5. og-summary.js safety ============
console.log("--- 5. og-summary.js safety ---");
const ogSrc = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/og-summary.js", "utf8");
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
const tomlSrc = fs.readFileSync("/home/user/Beeri-World-Cup/netlify.toml", "utf8");
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
