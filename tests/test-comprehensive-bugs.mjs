/**
 * Comprehensive Bug Test Suite — 20 categories x 10 variations = 200 tests
 * Beeri World Cup 2026 Prediction Website
 * 
 * Run: node tests/test-comprehensive-bugs.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

// Gather all JSX/JS source files
const allSrcFiles = [
  "src/store.js",
  "src/firebase.js",
  "src/utils/bracket.js",
  "src/utils/scoring.js",
  "src/utils/bracketCache.js",
  "src/utils/helpers.js",
  "src/data/matches.js",
  "src/data/teams.js",
  "src/hooks/useStore.js",
  "src/hooks/useLeaderboardComputed.js",
  "src/hooks/useNavigation.jsx",
  "src/pages/Predict.jsx",
  "src/pages/Leaderboard.jsx",
  "src/pages/Stats.jsx",
  "src/pages/Home.jsx",
  "src/pages/Admin.jsx",
  "src/components/MatchCard.jsx",
  "src/components/Layout.jsx",
  "src/components/FormList.jsx",
  "src/components/MatchAnalysis.jsx",
  "src/components/MenuOverlay.jsx",
  "src/components/GoogleSignInButton.jsx",
  "src/components/ErrorBoundary.jsx",
  "src/components/ReviewScreen.jsx",
  "src/components/ProgressHub.jsx",
  "src/components/AdminResultsTab.jsx",
  "src/components/AdminSettingsTab.jsx",
  "src/components/Toast.jsx",
  "src/components/SaveIndicator.jsx",
  "src/components/FormDetailsTab.jsx",
  "src/components/AdminToolsTab.jsx",
  "src/App.jsx",
  "src/main.jsx",
  "netlify/functions/batch-analysis.js",
  "netlify/functions/match-analysis.js",
];

const jsxFiles = allSrcFiles.filter(f => f.endsWith(".jsx"));
const allJsJsx = allSrcFiles;

// Pre-read all files
const fileContents = {};
for (const f of allSrcFiles) {
  try { fileContents[f] = readSrc(f); } catch { fileContents[f] = ""; }
}

// ============================================================
// CATEGORY 1: Import/Export consistency (10 tests)
// ============================================================
console.log("\n=== Category 1: Import/Export consistency ===");

// Helper: extract named imports from a file
function extractNamedImports(src, fromModule) {
  const re = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*["']${fromModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, "g");
  const imports = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean).forEach(n => imports.push(n));
  }
  return imports;
}

function extractExports(src) {
  const exports = new Set();
  // export function name
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) exports.add(m[1]);
  // export const/let/var name
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) exports.add(m[1]);
  // export class name
  for (const m of src.matchAll(/export\s+(?:default\s+)?class\s+(\w+)/g)) exports.add(m[1]);
  // export default function name
  for (const m of src.matchAll(/export\s+default\s+function\s+(\w+)/g)) exports.add(m[1]);
  // export { name }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean).forEach(n => exports.add(n));
  }
  return exports;
}

// 1.1 store.js exports used by useStore.js
{
  const storeExports = extractExports(fileContents["src/store.js"]);
  const useStoreImports = extractNamedImports(fileContents["src/hooks/useStore.js"], "../store");
  // import * as store is also used, so check named ones
  assert(useStoreImports.includes("initRealtimeListeners"), "1.1 useStore imports initRealtimeListeners from store");
}

// 1.2 store.js exports used by Predict.jsx
{
  const imports = extractNamedImports(fileContents["src/pages/Predict.jsx"], "../store");
  const exports = extractExports(fileContents["src/store.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.2 Predict.jsx import '${imp}' exists in store.js`);
  }
}

// 1.3 bracket.js exports used by useLeaderboardComputed.js
{
  const imports = extractNamedImports(fileContents["src/hooks/useLeaderboardComputed.js"], "../utils/bracket");
  const exports = extractExports(fileContents["src/utils/bracket.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.3 useLeaderboardComputed import '${imp}' exists in bracket.js`);
  }
}

// 1.4 scoring.js exports used by useLeaderboardComputed.js
{
  const imports = extractNamedImports(fileContents["src/hooks/useLeaderboardComputed.js"], "../utils/scoring");
  const exports = extractExports(fileContents["src/utils/scoring.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.4 useLeaderboardComputed import '${imp}' exists in scoring.js`);
  }
}

// 1.5 matches.js exports used by Predict.jsx
{
  const imports = extractNamedImports(fileContents["src/pages/Predict.jsx"], "../data/matches");
  const exports = extractExports(fileContents["src/data/matches.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.5 Predict.jsx import '${imp}' exists in matches.js`);
  }
}

// 1.6 teams.js exports used by bracket.js
{
  const imports = extractNamedImports(fileContents["src/utils/bracket.js"], "../data/teams");
  const exports = extractExports(fileContents["src/data/teams.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.6 bracket.js import '${imp}' exists in teams.js`);
  }
}

// 1.7 firebase.js exports used by store.js
{
  const imports = extractNamedImports(fileContents["src/store.js"], "./firebase");
  const exports = extractExports(fileContents["src/firebase.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.7 store.js import '${imp}' exists in firebase.js`);
  }
}

// 1.8 bracketCache.js exports used by Stats.jsx
{
  const imports = extractNamedImports(fileContents["src/pages/Stats.jsx"], "../utils/bracketCache");
  const exports = extractExports(fileContents["src/utils/bracketCache.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.8 Stats.jsx import '${imp}' exists in bracketCache.js`);
  }
}

// 1.9 helpers.js exports used by Predict.jsx
{
  const imports = extractNamedImports(fileContents["src/pages/Predict.jsx"], "../utils/helpers");
  const exports = extractExports(fileContents["src/utils/helpers.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.9 Predict.jsx import '${imp}' exists in helpers.js`);
  }
}

// 1.10 store.js exports used by AdminSettingsTab.jsx
{
  const imports = extractNamedImports(fileContents["src/components/AdminSettingsTab.jsx"], "../store");
  const exports = extractExports(fileContents["src/store.js"]);
  for (const imp of imports) {
    assert(exports.has(imp), `1.10 AdminSettingsTab import '${imp}' exists in store.js`);
  }
}

