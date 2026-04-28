// Tests src/store.js summary logic and firestore.rules for the summaries
// collection. We can't hit real Firestore from Node, so we:
//   1) Re-implement the pure helpers and assert their behavior.
//   2) Static-audit the real source files to verify the guardrails exist.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== SUMMARY STORE & RULES TESTS ===\n");

// ============ 1. nextSummaryNumber / getCoveredMatchIds / getPublishedSummariesSorted ============
console.log("--- 1. pure summary logic ---");

function nextSummaryNumber(summariesMap) {
  const all = Object.values(summariesMap);
  if (all.length === 0) return 1;
  return Math.max(...all.map((s) => s.number || 0)) + 1;
}

function getCoveredMatchIds(summariesMap) {
  const covered = new Set();
  for (const s of Object.values(summariesMap)) {
    for (const mid of s.coveredMatchIds || []) covered.add(mid);
  }
  return covered;
}

function getPublishedSummariesSorted(summariesMap) {
  return Object.values(summariesMap)
    .filter((s) => s.status === "published")
    .sort((a, b) => (a.number || 0) - (b.number || 0));
}

function getLatestPublishedSummary(summariesMap) {
  const sorted = getPublishedSummariesSorted(summariesMap);
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

function getSummaryByNumber(summariesMap, n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  return Object.values(summariesMap).find((s) => s.number === num) || null;
}

// 1a. nextSummaryNumber
assert(nextSummaryNumber({}) === 1, "first summary is #1");
assert(nextSummaryNumber({ a: { number: 1 } }) === 2, "after #1 → #2");
assert(nextSummaryNumber({ a: { number: 3 }, b: { number: 1 } }) === 4,
  "next is max+1 even with gaps");
assert(nextSummaryNumber({ a: { number: 2 } }) === 3,
  "deletion of #1 doesn't reuse — next is max+1");

// 1b. getCoveredMatchIds
{
  const map = {
    a: { coveredMatchIds: ["m1", "m2"] },
    b: { coveredMatchIds: ["m2", "m3"] },
    c: { coveredMatchIds: [] },
  };
  const covered = getCoveredMatchIds(map);
  assert(covered.size === 3, "union of coveredMatchIds");
  assert(covered.has("m1") && covered.has("m2") && covered.has("m3"),
    "all ids present");
}
{
  // Empty-array pre-tournament summary does NOT mark anything covered
  const map = { a: { coveredMatchIds: [] } };
  assert(getCoveredMatchIds(map).size === 0, "pre-tournament summary covers no matches");
}
{
  // Malformed data is tolerated
  const map = { a: {}, b: { coveredMatchIds: null }, c: { coveredMatchIds: ["x"] } };
  assert(getCoveredMatchIds(map).size === 1, "handles missing/null coveredMatchIds");
}

// 1c. getPublishedSummariesSorted
{
  const map = {
    a: { number: 3, status: "published" },
    b: { number: 1, status: "published" },
    c: { number: 2, status: "draft" },
    d: { number: 4, status: "published" },
  };
  const sorted = getPublishedSummariesSorted(map);
  assert(sorted.length === 3, "only published are included");
  assert(sorted[0].number === 1 && sorted[2].number === 4,
    "ascending order by number");
}

// 1d. getLatestPublishedSummary
{
  const map = {
    a: { number: 3, status: "published" },
    b: { number: 5, status: "draft" },
    c: { number: 4, status: "published" },
  };
  const latest = getLatestPublishedSummary(map);
  assert(latest.number === 4, "latest published is highest-numbered published");
  assert(getLatestPublishedSummary({}) === null, "no summaries → null");
  assert(getLatestPublishedSummary({ a: { status: "draft" } }) === null,
    "no published → null");
}

// 1e. getSummaryByNumber
{
  const map = { a: { number: 3 }, b: { number: 7 } };
  assert(getSummaryByNumber(map, 7) != null, "finds by number");
  assert(getSummaryByNumber(map, "7") != null, "accepts string number");
  assert(getSummaryByNumber(map, 99) === null, "not found");
  assert(getSummaryByNumber(map, "abc") === null, "non-numeric → null");
  assert(getSummaryByNumber(map, "") === null, "empty string → null");
}

// ============ 2. store.js source audit ============
console.log("--- 2. store.js source audit ---");
// After the store/* split, summary code lives in store/summariesRepo.ts
// and listener code in store/listeners.ts. Concatenate so static-grep
// assertions stay agnostic about which module owns each declaration.
let storeSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/store.js", "utf8");
const STORE_SUBMODULES = [
  "/home/user/Beeri-World-Cup/src/store/summariesRepo.ts",
  "/home/user/Beeri-World-Cup/src/store/usersRepo.ts",
  "/home/user/Beeri-World-Cup/src/store/predictionsRepo.ts",
  "/home/user/Beeri-World-Cup/src/store/listeners.ts",
  "/home/user/Beeri-World-Cup/src/store/publicMode.ts",
  "/home/user/Beeri-World-Cup/src/store/cache.ts",
  "/home/user/Beeri-World-Cup/src/store/firestoreClient.ts",
  "/home/user/Beeri-World-Cup/src/store/audit.ts",
  "/home/user/Beeri-World-Cup/src/store/backupRestore.ts",
];
for (const p of STORE_SUBMODULES) {
  try { storeSrc += "\n" + readMigratedSrc(p, "utf8"); } catch { /* not split yet */ }
}
assert(storeSrc.includes("summariesCollectionRef"), "summariesCollectionRef declared");
assert(storeSrc.includes("setupSummariesListener"), "listener function declared");
assert(storeSrc.includes('where("status", "==", "published")'),
  "non-admin listener filters by status=published");
assert(storeSrc.includes("maybeUpgradeSummariesListener"),
  "listener upgrades when admin flag flips");
assert(storeSrc.includes("requireAdmin()"), "admin check in summary CRUD");
assert(storeSrc.includes("cache.summaries = {}"),
  "cache.summaries cleared on logout");
assert(/publishedAt/.test(storeSrc) && /if\s*\(\s*fields\.status\s*===\s*"published"/.test(storeSrc),
  "publishedAt is set on first publish");
// Number is not mutated
assert(/number:\s*_dropNumber/.test(storeSrc),
  "number is stripped from updateSummary payload");

// ============ 3. firestore.rules audit ============
console.log("--- 3. firestore.rules audit ---");
const rulesSrc = readMigratedSrc("/home/user/Beeri-World-Cup/firestore.rules", "utf8");
assert(rulesSrc.includes("match /summaries/"), "summaries rule block present");
assert(/allow\s+read:\s*if\s+resource\.data\.status\s*==\s*'published'\s*\|\|\s*isAdmin\(\)/.test(rulesSrc),
  "summaries read rule: published OR admin");
assert(rulesSrc.includes("validSummaryShape"), "shape validator exists");
assert(rulesSrc.includes("summaryAllowedFields"),
  "allowlist for summary fields exists");
assert(/request\.resource\.data\.number\s*==\s*resource\.data\.number/.test(rulesSrc),
  "number is immutable on update");
assert(/allow\s+create:\s*if\s+isAdmin\(\)\s*&&\s*validSummaryShape/.test(rulesSrc),
  "create is admin-only with shape check");
assert(/allow\s+update:\s*if\s+isAdmin\(\)\s*&&\s*validSummaryShape/.test(rulesSrc),
  "update is admin-only with shape check");
assert(/allow\s+delete:\s*if\s+isAdmin\(\)/.test(rulesSrc), "delete is admin-only");

// Verify summary fields in allowlist match the store's write payload
const expectedFields = [
  "number", "title", "subtitle", "intro", "conclusion",
  "coveredMatchIds", "matchNotes", "status",
  "authorUid", "createdAt", "updatedAt", "publishedAt",
];
for (const f of expectedFields) {
  assert(rulesSrc.includes(`'${f}'`), `field '${f}' declared in allowlist`);
}

// Shape enforcement checks
assert(/d\.title\s+is\s+string/.test(rulesSrc), "title must be string");
assert(/d\.number\s+is\s+number/.test(rulesSrc), "number must be number");
assert(/d\.coveredMatchIds\s+is\s+list/.test(rulesSrc), "coveredMatchIds must be list");
assert(/d\.matchNotes\s+is\s+map/.test(rulesSrc), "matchNotes must be map");
assert(/validSummaryStatus/.test(rulesSrc), "status is validated via validSummaryStatus");

// ============ 4. isStoreReady NEVER includes summaries in its gate ============
console.log("--- 4. isStoreReady does not block on summaries ---");
// The summaries listener marks itself ready on both success AND error, and
// the readiness gate intentionally excludes summaries so a failure there
// can't brick the app. After the store-module split the gate lives in
// store/cache.ts; we probe both the barrel and the cache module.
let cacheSrc = "";
try { cacheSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/store/cache.ts", "utf8"); } catch { /* not split yet */ }
const storeAndCache = storeSrc + cacheSrc;
assert(
  /isStoreReady/.test(storeAndCache),
  "isStoreReady is defined somewhere in the store",
);
const readyBody =
  cacheSrc.match(/function isStoreReady\(\)[\s\S]{0,500}?\}/)?.[0] ||
  storeSrc.match(/function isStoreReady\(\)[\s\S]{0,500}?\}/)?.[0] ||
  "";
assert(
  !/summaries/.test(readyBody),
  "isStoreReady body does NOT mention summaries",
);
const requiredKeys =
  cacheSrc.match(/REQUIRED_READY_KEYS\s*=\s*new Set[^)]+\)/)?.[0] || "";
assert(
  !requiredKeys || !/summaries/.test(requiredKeys),
  "REQUIRED_READY_KEYS set does NOT include summaries",
);

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
process.exit(0);
