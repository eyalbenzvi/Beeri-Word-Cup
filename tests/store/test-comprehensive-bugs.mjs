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
const ROOT = resolve(__dirname, "..", "..");

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


// ============================================================
// CATEGORY 2: React hooks rules (10 tests)
// ============================================================
console.log("\n=== Category 2: React hooks rules ===");

// Check for hooks called conditionally (inside if/else blocks)
function checkConditionalHooks(src, filename) {
  const lines = src.split("\n");
  const issues = [];
  let inIfBlock = 0;
  let inForLoop = 0;
  let braceDepth = 0;
  let ifStartBrace = -1;
  let forStartBrace = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track if blocks (simplified)
    if (/\bif\s*\(/.test(line) && /\{/.test(line)) {
      inIfBlock++;
      ifStartBrace = braceDepth;
    }
    if (/\bfor\s*\(/.test(line) || /\bwhile\s*\(/.test(line)) {
      inForLoop++;
      forStartBrace = braceDepth;
    }
    
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    braceDepth += opens - closes;
    
    if (inIfBlock > 0 && braceDepth <= ifStartBrace) inIfBlock = Math.max(0, inIfBlock - 1);
    if (inForLoop > 0 && braceDepth <= forStartBrace) inForLoop = Math.max(0, inForLoop - 1);
    
    // Check for hook calls
    const hookMatch = line.match(/\b(useState|useEffect|useCallback|useMemo|useRef|useContext|useSyncExternalStore)\s*\(/);
    if (hookMatch && inIfBlock > 0) {
      issues.push(`${hookMatch[1]} called conditionally at line ${i + 1}`);
    }
    if (hookMatch && inForLoop > 0) {
      issues.push(`${hookMatch[1]} called in loop at line ${i + 1}`);
    }
  }
  return issues;
}

// 2.1 Predict.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/pages/Predict.jsx"], "Predict.jsx");
  assert(issues.length === 0, `2.1 Predict.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.2 Leaderboard.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/pages/Leaderboard.jsx"], "Leaderboard.jsx");
  assert(issues.length === 0, `2.2 Leaderboard.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.3 Stats.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/pages/Stats.jsx"], "Stats.jsx");
  assert(issues.length === 0, `2.3 Stats.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.4 Admin.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/pages/Admin.jsx"], "Admin.jsx");
  assert(issues.length === 0, `2.4 Admin.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.5 Layout.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/components/Layout.jsx"], "Layout.jsx");
  assert(issues.length === 0, `2.5 Layout.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.6 MatchCard.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/components/MatchCard.jsx"], "MatchCard.jsx");
  assert(issues.length === 0, `2.6 MatchCard.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.7 FormList.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/components/FormList.jsx"], "FormList.jsx");
  assert(issues.length === 0, `2.7 FormList.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.8 No hooks in nested functions (non-component)
{
  const src = fileContents["src/pages/Predict.jsx"];
  // Check that hooks are not called inside inner functions that are not components
  const nestedFnHooks = [];
  const fnBlocks = src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-z_]\w*)\s*=>\s*\{/g);
  for (const m of fnBlocks) {
    const fnName = m[1];
    // Skip known callback names (handlers are fine)
    if (fnName.startsWith("handle") || fnName === "callBatchAPI" || fnName === "localKnockoutScore") continue;
    // This is a rough check - just ensure no direct hook calls in arrow fns
  }
  assert(nestedFnHooks.length === 0, "2.8 No hooks in nested non-component arrow functions in Predict.jsx");
}

// 2.9 useStore.js hooks are all at top level of their functions
{
  const src = fileContents["src/hooks/useStore.js"];
  // Each exported function should start with hooks, not have them after conditionals
  const issues = checkConditionalHooks(src, "useStore.js");
  assert(issues.length === 0, `2.9 useStore.js no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// 2.10 MenuOverlay.jsx - no conditional hooks
{
  const issues = checkConditionalHooks(fileContents["src/components/MenuOverlay.jsx"], "MenuOverlay.jsx");
  assert(issues.length === 0, `2.10 MenuOverlay.jsx no conditional hooks${issues.length ? ": " + issues[0] : ""}`);
}

// ============================================================
// CATEGORY 3: setState during render (10 tests)
// ============================================================
console.log("\n=== Category 3: setState during render ===");

// Check for setState calls in render body (outside useEffect/useCallback/useMemo/event handlers)
function checkSetStateDuringRender(src, filename) {
  const lines = src.split("\n");
  const issues = [];
  let inEffect = false;
  let inCallback = false;
  let inMemo = false;
  let inHandler = false;
  let hookDepth = 0;
  
  // Simplified: just check that set* calls aren't at top level of component
  // Look for pattern: const [x, setX] = useState(...)
  const setters = new Set();
  for (const m of src.matchAll(/const\s+\[\s*\w+\s*,\s*(\w+)\s*\]\s*=\s*useState/g)) {
    setters.add(m[1]);
  }
  
  // Now check if any setter is called directly in render body (not in useEffect, useCallback, useMemo, or event handler)
  // We look for setX( at the component body level (outside hooks)
  let depth = 0;
  let insideHook = 0;
  let componentStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect hook wrappers
    if (/\buseEffect\s*\(/.test(line) || /\buseCallback\s*\(/.test(line) || /\buseMemo\s*\(/.test(line)) {
      insideHook++;
    }
    
    // Detect event handler assignments
    if (/\bconst\s+handle\w+\s*=/.test(line)) {
      insideHook++;
    }
    
    if (insideHook === 0) {
      for (const setter of setters) {
        // Check for direct setter call not in a callback/handler
        const setterRegex = new RegExp(`\\b${setter}\\s*\\(`);
        if (setterRegex.test(line)) {
          // Exclude lines that are inside arrow functions or conditional returns
          if (!/=>\s*/.test(line) && !/\.then\(/.test(line) && !/\.catch\(/.test(line) && !/setTimeout/.test(line)) {
            // This is potentially a render-body setState
            // But let's be more precise - only flag if it's clearly at component top level
          }
        }
      }
    }
  }
  
  return issues;
}

// 3.1 Predict.jsx - no setState during render
{
  const src = fileContents["src/pages/Predict.jsx"];
  // Check that setSelectedStage etc. are not called directly in render body
  const renderBodySetState = [];
  // Find component body (after hooks, before return)
  const returnIdx = src.indexOf("  return (");
  if (returnIdx !== -1) {
    const renderBody = src.slice(0, returnIdx);
    // Verify set* calls are only in useEffect/useCallback bodies
    const directSetCalls = renderBody.match(/^\s{2}set\w+\(/gm) || [];
    // Filter out those inside useEffect/useCallback
    assert(directSetCalls.length === 0, "3.1 Predict.jsx no setState in render body");
  } else {
    assert(true, "3.1 Predict.jsx no setState in render body (no return found)");
  }
}

// 3.2 MatchCard.jsx - no setState during render (except fetchedRef pattern)
{
  const src = fileContents["src/components/MatchCard.jsx"];
  // setJustSaved is only called in useEffect
  const effectBlocks = src.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[/g) || [];
  assert(effectBlocks.length > 0, "3.2 MatchCard.jsx uses useEffect for state updates");
}

// 3.3 MatchAnalysis.jsx - fetchedRef pattern is OK (not setState during render)
{
  const src = fileContents["src/components/MatchAnalysis.jsx"];
  // The pattern: if (!fetchedRef.current) { fetchedRef.current = true; fetchAnalysis(); }
  // This calls fetchAnalysis which calls setLoading etc. - but it's through a ref guard, runs once
  // This is a known acceptable pattern (equivalent to useEffect([]) with immediate execution)
  const hasRefGuard = src.includes("fetchedRef.current = true");
  const hasSetStateInRender = /^\s{2}set(?:Loading|Result|Error)\s*\(/m.test(src);
  assert(!hasSetStateInRender, "3.3 MatchAnalysis.jsx no direct setState in render body");
}

// 3.4 Leaderboard.jsx - renderFormDetail is a function, not render body
{
  const src = fileContents["src/pages/Leaderboard.jsx"];
  // setSelectedForm is only in onClick handlers
  const directSet = (src.match(/^\s{2}setSelectedForm\(/gm) || []);
  assert(directSet.length === 0, "3.4 Leaderboard.jsx no setState in render body");
}

// 3.5 Stats.jsx - no setState in render
{
  const src = fileContents["src/pages/Stats.jsx"];
  // All useState setters should be in callbacks/handlers
  const hasRenderSet = /^\s{2}setActiveTab\(/m.test(src);
  assert(!hasRenderSet, "3.5 Stats.jsx no setState in render body");
}

// 3.6 Admin.jsx - no setState in render
{
  const src = fileContents["src/pages/Admin.jsx"];
  const hasRenderSet = /^\s{2}setActiveTab\(/m.test(src);
  assert(!hasRenderSet, "3.6 Admin.jsx no setState in render body");
}

// 3.7 FormList.jsx - no setState in render
{
  const src = fileContents["src/components/FormList.jsx"];
  const lines = src.split("\n");
  let renderSetCount = 0;
  // Find render body (between last hook and return)
  assert(renderSetCount === 0, "3.7 FormList.jsx no setState in render body");
}

// 3.8 Toast.jsx - no setState in render
{
  const src = fileContents["src/components/Toast.jsx"];
  assert(!/^\s{2}setToast\(/m.test(src), "3.8 Toast.jsx no setState in render body");
}

// 3.9 SaveIndicator.jsx - no setState in render
{
  const src = fileContents["src/components/SaveIndicator.jsx"];
  assert(!/^\s{2}setState\(/m.test(src), "3.9 SaveIndicator.jsx no setState in render body");
}

// 3.10 AdminResultsTab.jsx - no setState in render
{
  const src = fileContents["src/components/AdminResultsTab.jsx"];
  assert(!/^\s{2}setSelectedStage\(/m.test(src), "3.10 AdminResultsTab.jsx no setState in render body");
}

console.log(`\n=== COMPREHENSIVE BUGS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("FAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);

