// Tests the URL-parsing logic of src/hooks/useNavigation.jsx.
// We duplicate the pure helpers here (the real module uses window.*), then
// exercise them. A static-audit check at the bottom verifies the hook file
// still contains the expected guardrails.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== NAVIGATION URL PARAM TESTS ===\n");

// Mirror of useNavigation.jsx's constants
const URL_PAGES = new Set(["home", "predict", "leaderboard", "results", "stats", "admin", "profile", "blog"]);
const KNOWN_PARAM_KEYS = ["n"];

function readFromURL(search) {
  const sp = new URLSearchParams(search);
  const rawPage = sp.get("page");
  const page = rawPage && URL_PAGES.has(rawPage) ? rawPage : "home";
  const params = {};
  for (const key of KNOWN_PARAM_KEYS) {
    const v = sp.get(key);
    if (v != null) params[key] = v;
  }
  return { page, params };
}

function writeURL(initialSearch, page, params) {
  const sp = new URLSearchParams(initialSearch);
  sp.delete("page");
  for (const key of KNOWN_PARAM_KEYS) sp.delete(key);
  if (page && page !== "home") sp.set("page", page);
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === "") continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

// ============ 1. reading ============
console.log("--- 1. reading from URL ---");
assert(readFromURL("").page === "home", "empty query → home");
assert(readFromURL("?page=blog").page === "blog", "page=blog → blog");
assert(readFromURL("?page=blog&n=3").params.n === "3", "param n=3 is captured");
assert(readFromURL("?page=nonsense").page === "home", "invalid page falls back to home");
assert(readFromURL("?page=admin").page === "admin", "admin page parsed");
assert(readFromURL("?page=profile&n=5").page === "profile", "profile page parsed");
assert(readFromURL("?n=3").page === "home" && readFromURL("?n=3").params.n === "3",
  "n without page: page=home, n preserved");
assert(readFromURL("").params.n === undefined, "no n in empty query");

// Security-ish: prevent arbitrary strings from routing.
assert(readFromURL("?page=../../etc").page === "home", "path traversal ignored");
assert(readFromURL("?page=").page === "home", "empty page value ignored");

// ============ 2. writing ============
console.log("--- 2. writing URL ---");
assert(writeURL("", "home", {}) === "", "home with no params → empty query");
assert(writeURL("", "blog", { n: 3 }) === "page=blog&n=3", "blog+n → correct query");
assert(writeURL("", "blog", {}) === "page=blog", "blog without n");
// Preserves unknown params
assert(writeURL("utm_source=wa", "blog", { n: 1 }).includes("utm_source=wa"),
  "unknown params preserved");
assert(writeURL("utm_source=wa", "blog", { n: 1 }).includes("page=blog"),
  "page is written");
// Empty n is stripped, not written as "n="
const s = writeURL("", "blog", { n: "" });
assert(!s.includes("n="), `empty n should not be written, got "${s}"`);
const s2 = writeURL("", "blog", { n: null });
assert(!s2.includes("n="), `null n should not be written, got "${s2}"`);

// ============ 3. round-trip ============
console.log("--- 3. round-trip ---");
{
  const initial = "?page=blog&n=42&utm=x";
  const { page, params } = readFromURL(initial);
  const rebuilt = writeURL(initial, page, params);
  const parsed = new URLSearchParams(rebuilt);
  assert(parsed.get("page") === "blog", "round-trip page");
  assert(parsed.get("n") === "42", "round-trip n");
  assert(parsed.get("utm") === "x", "round-trip preserves utm");
}

// ============ 4. static audit of the real source ============
console.log("--- 4. static audit of useNavigation.jsx ---");
const src = readMigratedSrc("/home/user/Beeri-World-Cup/src/hooks/useNavigation.jsx", "utf8");
assert(src.includes("popstate"), "popstate listener present");
assert(src.includes("replaceState"), "history.replaceState used");
assert(src.includes("URL_PAGES"), "URL_PAGES allowlist present");
assert(/URL_PAGES\s*=\s*new Set/.test(src), "URL_PAGES is a Set");
assert(src.includes("\"blog\""), "blog is in the URL allowlist");
assert(!src.includes("eval("), "no eval in nav code");

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
process.exit(0);
