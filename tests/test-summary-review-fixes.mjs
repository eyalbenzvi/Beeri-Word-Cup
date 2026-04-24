// Regression tests for the fixes applied after the deep code review of
// commits 5a21c1e and 1bbb039. Each block maps to one review finding.
// Static audits — Firestore/Netlify are not available in Node, so we
// assert the source has the correct guardrails in place.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== SUMMARY REVIEW FIXES ===\n");

const R = (p) => fs.readFileSync(p, "utf8");
const nav = R("/home/user/Beeri-World-Cup/src/hooks/useNavigation.jsx");
const store = R("/home/user/Beeri-World-Cup/src/store.js");
const app = R("/home/user/Beeri-World-Cup/src/App.jsx");
const editor = R("/home/user/Beeri-World-Cup/src/components/SummaryEditor.jsx");
const adminTab = R("/home/user/Beeri-World-Cup/src/components/AdminSummariesTab.jsx");
const dailyPage = R("/home/user/Beeri-World-Cup/src/pages/DailySummary.jsx");
const shareBtn = R("/home/user/Beeri-World-Cup/src/components/ShareSummaryButton.jsx");
const rules = R("/home/user/Beeri-World-Cup/firestore.rules");
const aiFn = R("/home/user/Beeri-World-Cup/netlify/functions/summary-ai.js");
const ogFn = R("/home/user/Beeri-World-Cup/netlify/functions/og-summary.js");
const layout = R("/home/user/Beeri-World-Cup/src/components/Layout.jsx");
const messages = R("/home/user/Beeri-World-Cup/src/constants/messages.js");

// ============ BUG 1. back/forward navigation uses pushState ============
console.log("--- BUG 1: pushState for back/forward ---");
assert(/pushState/.test(nav), "useNavigation uses pushState");
assert(/replaceState/.test(nav), "useNavigation still uses replaceState (for sync)");
assert(/replace\s*=\s*false/.test(nav), "navigate defaults to push, not replace");
assert(/options\.replace/.test(nav), "navigate accepts { replace } option");
// DailySummary auto-jump must use replace (we don't want Back to bounce to no-param)
assert(/navigate\("blog",\s*\{\s*n:\s*active\.number\s*\},\s*\{\s*replace:\s*true\s*\}\)/.test(dailyPage),
  "DailySummary auto-jump uses replace: true");

// ============ BUG 2. public-mode teardown race ============
console.log("--- BUG 2: public mode teardown guard ---");
assert(/if\s*\(!publicModeInitialized\)\s*return/.test(store),
  "fetchPublicSettingsOnce guards on publicModeInitialized");
// Must re-check AFTER the await to prevent the race
const publicBlock = store.match(/async function fetchPublicSettingsOnce[\s\S]*?\n\}/)?.[0] || "";
assert((publicBlock.match(/if\s*\(!publicModeInitialized\)\s*return/g) || []).length >= 2,
  "publicModeInitialized is rechecked after await");

// ============ BUG 3+7. deleted-mid-edit + hydrating state ============
console.log("--- BUG 3+7: deleted-mid-edit + cold hydrate ---");
assert(/wasDeletedMidEdit/.test(editor), "editor has wasDeletedMidEdit guard");
assert(/isHydrating/.test(editor), "editor distinguishes hydrating vs deleted");
assert(/if\s*\(wasDeletedMidEdit\)\s*\{\s*return/.test(editor),
  "editor renders explicit deleted state");
assert(!/if\s*\(isEditing\)\s*\{[\s\S]{0,40}updateSummary/.test(editor),
  "save no longer gated on stale isEditing flag");
// Admin tab should gracefully render when the editing doc disappears
assert(/editingDoc\s*\?\s*BLOG\.editor\.editSummary/.test(adminTab),
  "admin tab uses conditional header label");

// ============ BUG 4. client-side number collision fix ============
console.log("--- BUG 4: number reservation reads server max ---");
assert(/reserveNextSummaryNumber/.test(store), "number reserved via helper");
// Client SDK transactions can't read queries, so the reservation uses getDocs.
assert(!/runTransaction/.test(store), "runTransaction not used (unsupported with queries)");
assert(/orderBy\("number", "desc"\)/.test(store),
  "reservation reads current max by desc order");
assert(/await\s+withTimeout\(reserveNextSummaryNumber\(\)/.test(store),
  "reservation is wrapped in withTimeout");
assert(!/nextSummaryNumber\(\)\s*,\s*\n\s*status:\s*"draft"/.test(store),
  "old client-side nextSummaryNumber not used on create");

// ============ SEC 1. OG script XSS via Host ============
console.log("--- SEC 1: og-summary script-context escaping ---");
assert(/jsonForScript/.test(ogFn), "og uses script-safe JSON helper");
assert(/\\\\u003c/.test(ogFn), "escapes </ as \\u003c for inline script");

// ============ SEC 2. og-summary host allowlist ============
console.log("--- SEC 2: og-summary host allowlist ---");
assert(/ALLOWED_HOSTS/.test(ogFn), "og has host allowlist");
assert(/pickSafeHost/.test(ogFn), "og uses pickSafeHost");
assert(/DEFAULT_HOST/.test(ogFn), "og falls back to a canonical host");
assert(/pickSafeProtocol/.test(ogFn), "og picks safe protocol (http/https only)");

// ============ SEC 3. ALLOWED_ORIGINS localhost only in dev ============
console.log("--- SEC 3: prod origins exclude localhost ---");
assert(/NODE_ENV\s*===\s*"production"/.test(aiFn),
  "summary-ai gates localhost to non-prod");
assert(/PROD_ORIGINS/.test(aiFn) && /DEV_ORIGINS/.test(aiFn),
  "summary-ai splits prod vs dev origin lists");

// ============ SEC 4. matchNotes size capped via map size ============
console.log("--- SEC 4: matchNotes serialized size cap ---");
assert(/matchNotes\.size\(\)\s*<=\s*40/.test(rules),
  "matchNotes map size capped in rules");
assert(/SUMMARY_LIMITS\.matchNoteText/.test(store),
  "client caps individual note length");

// ============ SEC / MISSED. publishedAt immutability ============
console.log("--- SEC: publishedAt immutability ---");
assert(/publishedAtStable/.test(rules), "rule enforces publishedAt stability");
assert(/reqData\.publishedAt\s*==\s*resData\.publishedAt/.test(rules),
  "rule compares publishedAt to existing value");

// ============ MISSED. og fallback to redirect on any throw ============
console.log("--- MISSED: og redirect on throw ---");
assert(/try\s*\{\s*initAdmin\(\);[\s\S]{0,200}catch[\s\S]{0,200}redirect\(redirectUrl\)/.test(ogFn),
  "initAdmin failures fall back to redirect");
assert(/function\s+redirect\s*\(url\)/.test(ogFn),
  "og uses a dedicated redirect helper");

// ============ MISSED. user-friendly permission-denied ============
console.log("--- MISSED: permission-denied message ---");
assert(/permission-denied/.test(store), "store handles permission-denied");
assert(/אין הרשאה/.test(store), "store surfaces Hebrew permission message");

// ============ MISSED. withTimeout on all saves ============
console.log("--- MISSED: withTimeout on saves ---");
assert(/await\s+withTimeout\(updateDoc\(summaryDocRef/.test(store),
  "updateSummary wrapped in withTimeout");
assert(/await\s+withTimeout\(deleteDoc\(summaryDocRef/.test(store),
  "deleteSummary wrapped in withTimeout");
assert(/await\s+withTimeout\(addDoc\(summariesCollectionRef/.test(store),
  "createSummary wrapped in withTimeout");

// ============ IMPL. publish flow is one round-trip when editing ============
console.log("--- IMPL: single-round-trip publish when editing ---");
// Look for the new publish path: existing ? updateSummary(..., status: "published") : create+publish
assert(/updateSummary\(summaryId,\s*\{[\s\S]{0,200}status:\s*"published"/.test(editor),
  "publish on existing doc goes through single updateSummary call");

// ============ IMPL. AI max_tokens scaling + truncation guard ============
console.log("--- IMPL: AI token scaling & truncation ---");
assert(/estimateMaxTokens/.test(aiFn), "AI scales max_tokens by input length");
assert(/MAX_TOKENS_CAP/.test(aiFn), "AI has a hard cap");
assert(/MIN_TOKENS_FLOOR/.test(aiFn), "AI has a floor");
assert(/cleanedInput\.length\s*>\s*400\s*&&\s*polished\.length\s*<\s*cleanedInput\.length\s*\*\s*0\.7/.test(aiFn),
  "polish refuses to return dramatically-truncated output");

// ============ IMPL. control-token handling preserves content ============
console.log("--- IMPL: control-token replacement (not strip) ---");
assert(/CONTROL_TOKEN_REPLACEMENTS/.test(aiFn), "control tokens are replaced, not stripped");
assert(/\(token\)|\(tag\)/.test(aiFn), "replacements produce readable placeholders");
assert(/'''/.test(aiFn), "triple-backticks replaced with ''' to preserve structure");

// ============ IMPL. Strict n parsing in DailySummary ============
console.log("--- IMPL: DailySummary strict n parsing ---");
assert(/isStrictInt\s*=\s*typeof\s+rawN\s*===\s*"string"\s*&&\s*\/\^\\d\+\$\//.test(dailyPage),
  "DailySummary requires digits-only for ?n=");

// ============ IMPL. BLOG copy block exists and is referenced ============
console.log("--- IMPL: BLOG copy centralized ---");
assert(/export const BLOG\s*=\s*\{/.test(messages), "BLOG export exists in messages");
assert(/navLabel:\s*"יומן"/.test(messages), "BLOG.navLabel defined");
assert(/pageTitle:/.test(messages), "BLOG.pageTitle defined");
assert(/editor:\s*\{/.test(messages), "BLOG.editor defined");
assert(/public:\s*\{/.test(messages), "BLOG.public defined");
assert(/share:\s*\{/.test(messages), "BLOG.share defined");
// Consumers
assert(/from\s+"\.\.\/constants\/messages"/.test(editor), "editor imports BLOG");
assert(/from\s+"\.\.\/constants\/messages"/.test(adminTab), "admin tab imports BLOG");
assert(/from\s+"\.\.\/constants\/messages"/.test(dailyPage), "DailySummary imports BLOG");
assert(/from\s+"\.\.\/constants\/messages"/.test(shareBtn), "share button imports BLOG");
assert(/BLOG\.navLabel/.test(layout), "Layout uses BLOG.navLabel");
assert(/BLOG\.status\.publishedBadge/.test(adminTab), "admin tab uses status badges");
assert(/BLOG\.editor\.deletedMidEditTitle/.test(editor), "editor uses deleted title constant");

// ============ IMPL. Share button covers all localhost variants ============
console.log("--- IMPL: localhost detection covers [::1] and .local ---");
assert(/::1/.test(shareBtn), "share button detects IPv6 loopback");
assert(/\.local/.test(shareBtn), "share button detects .local mDNS");

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
process.exit(0);
