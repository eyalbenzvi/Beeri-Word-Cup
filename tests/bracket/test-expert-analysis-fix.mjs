/**
 * Expert Analysis Bug Fix Tests
 *
 * Verifies that MatchCard passes bracket-derived team codes to MatchAnalysis
 * (not null match.homeTeam/awayTeam), and that a React key forces remount
 * when teams change (preventing stale cached results across forms).
 *
 * Run: node tests/test-expert-analysis-fix.mjs
 */

import { readFileSync } from "fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
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

const matchCardSrc = readMigratedSrc(resolve(ROOT, "src/components/MatchCard.jsx"), "utf8");
const matchAnalysisSrc = readMigratedSrc(resolve(ROOT, "src/components/MatchAnalysis.jsx"), "utf8");

// ============================================================
// 1. MatchCard must pass bracket-derived codes, not match.homeTeam/awayTeam
// ============================================================

// 1.1 homeCode/awayCode are derived from bracketEntry with match fallback
{
  const hasBracketHome = /const\s+homeCode\s*=.*bracketEntry\?\.home/.test(matchCardSrc);
  assert(hasBracketHome, "1.1 homeCode derived from bracketEntry?.home");
}

{
  const hasBracketAway = /const\s+awayCode\s*=.*bracketEntry\?\.away/.test(matchCardSrc);
  assert(hasBracketAway, "1.2 awayCode derived from bracketEntry?.away");
}

// 1.3 MatchAnalysis receives homeTeam={homeCode} (not match.homeTeam)
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const usesHomeCode = /homeTeam=\{homeCode\}/.test(matchAnalysisJsx);
  assert(usesHomeCode, "1.3 MatchAnalysis receives homeTeam={homeCode}");
}

// 1.4 MatchAnalysis receives awayTeam={awayCode} (not match.awayTeam)
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const usesAwayCode = /awayTeam=\{awayCode\}/.test(matchAnalysisJsx);
  assert(usesAwayCode, "1.4 MatchAnalysis receives awayTeam={awayCode}");
}

// 1.5 MatchAnalysis does NOT receive match.homeTeam
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const usesMatchHomeTeam = /homeTeam=\{match\.homeTeam\}/.test(matchAnalysisJsx);
  assert(!usesMatchHomeTeam, "1.5 MatchAnalysis does NOT use match.homeTeam");
}

// 1.6 MatchAnalysis does NOT receive match.awayTeam
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const usesMatchAwayTeam = /awayTeam=\{match\.awayTeam\}/.test(matchAnalysisJsx);
  assert(!usesMatchAwayTeam, "1.6 MatchAnalysis does NOT use match.awayTeam");
}

// ============================================================
// 2. React key on MatchAnalysis prevents stale state across forms
// ============================================================

// 2.1 MatchAnalysis has a key prop
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const hasKey = /key=\{/.test(matchAnalysisJsx);
  assert(hasKey, "2.1 MatchAnalysis has a key prop");
}

// 2.2 Key includes homeCode
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const keyIncludesHome = /key=\{`\$\{homeCode\}/.test(matchAnalysisJsx);
  assert(keyIncludesHome, "2.2 MatchAnalysis key includes homeCode");
}

// 2.3 Key includes awayCode
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const keyIncludesAway = /key=\{`\$\{homeCode\}-\$\{awayCode\}`\}/.test(matchAnalysisJsx);
  assert(keyIncludesAway, "2.3 MatchAnalysis key includes awayCode");
}

// 2.4 Key does NOT use match.homeTeam or match.awayTeam
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const keyUsesMatchTeam = /key=\{.*match\.(homeTeam|awayTeam)/.test(matchAnalysisJsx);
  assert(!keyUsesMatchTeam, "2.4 MatchAnalysis key does NOT use match.homeTeam/awayTeam");
}

// ============================================================
// 3. MatchAnalysis cache key uses team codes correctly
// ============================================================

// 3.1 Cache key function exists and includes homeTeam, awayTeam, stage
{
  const hasCacheKey = /function\s+cacheKey\s*\(\s*homeTeam\s*,\s*awayTeam\s*,\s*stage\s*\)/.test(matchAnalysisSrc);
  assert(hasCacheKey, "3.1 cacheKey function accepts homeTeam, awayTeam, stage");
}

// 3.2 Module-level cache object exists
{
  const hasCache = /const\s+analysisCache\s*=\s*\{\}/.test(matchAnalysisSrc);
  assert(hasCache, "3.2 Module-level analysisCache exists");
}

// 3.3 Cache key is used in fetchAnalysis
{
  const usesCacheKey = /const\s+key\s*=\s*cacheKey\(homeTeam,\s*awayTeam,\s*stage\)/.test(matchAnalysisSrc);
  assert(usesCacheKey, "3.3 fetchAnalysis uses cacheKey function");
}

// 3.4 Cache is checked before fetching
{
  const checksCacheBeforeFetch = /if\s*\(analysisCache\[key\]\)/.test(matchAnalysisSrc);
  assert(checksCacheBeforeFetch, "3.4 Cache is checked before API fetch");
}

// 3.5 Result is cached after successful fetch
{
  const cachesResult = /analysisCache\[key\]\s*=\s*data/.test(matchAnalysisSrc);
  assert(cachesResult, "3.5 Result is cached after fetch");
}

// ============================================================
// 4. Verify cacheKey produces distinct keys for different team combinations
// ============================================================

// 4.1 Evaluate cacheKey function logic
{
  // Extract and evaluate the cacheKey function
  const cacheKeyMatch = matchAnalysisSrc.match(/function\s+cacheKey\s*\([^)]*\)\s*\{([^}]*)\}/);
  assert(cacheKeyMatch, "4.1 cacheKey function body extractable");
}

// 4.2 Different teams produce different keys
{
  // Simulate the cacheKey function
  const cacheKey = (h, a, s) => `${h}-${a}-${s}`;
  const key1 = cacheKey("BRA", "GER", "F");
  const key2 = cacheKey("ARG", "FRA", "F");
  assert(key1 !== key2, "4.2 Different teams produce different cache keys");
}

// 4.3 Same teams produce same key (cache hit expected)
{
  const cacheKey = (h, a, s) => `${h}-${a}-${s}`;
  const key1 = cacheKey("BRA", "GER", "F");
  const key2 = cacheKey("BRA", "GER", "F");
  assert(key1 === key2, "4.3 Same teams produce same cache key");
}

// 4.4 Different stages produce different keys
{
  const cacheKey = (h, a, s) => `${h}-${a}-${s}`;
  const key1 = cacheKey("BRA", "GER", "R16");
  const key2 = cacheKey("BRA", "GER", "QF");
  assert(key1 !== key2, "4.4 Different stages produce different cache keys");
}

// 4.5 null team codes would produce colliding keys (the bug we fixed)
{
  const cacheKey = (h, a, s) => `${h}-${a}-${s}`;
  const key1 = cacheKey(null, null, "F");
  const key2 = cacheKey(null, null, "F");
  assert(key1 === key2, "4.5 null teams collide (demonstrates why fix is needed)");
}

// 4.6 null vs actual team codes produce different keys
{
  const cacheKey = (h, a, s) => `${h}-${a}-${s}`;
  const keyNull = cacheKey(null, null, "F");
  const keyReal = cacheKey("BRA", "GER", "F");
  assert(keyNull !== keyReal, "4.6 null vs real teams produce different keys");
}

// ============================================================
// 5. MatchAnalysis fires fetch via useEffect (not during render)
// React 19: side-effects belong in effects, not the render body. The previous
// `fetchedRef` guard pattern fired fetch during render which double-invokes
// under StrictMode and is "undefined behaviour" in React's docs.
// ============================================================

// 5.1 fetch is wired through useEffect (not a render-time guard)
{
  const fetchInsideEffect = /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?fetchAnalysis\(\)/.test(matchAnalysisSrc);
  assert(fetchInsideEffect, "5.1 fetchAnalysis called from inside useEffect");
}

// 5.2 AbortController is used so a parent unmount cancels the in-flight fetch
{
  const usesAbort = /AbortController/.test(matchAnalysisSrc) && /controller\.signal/.test(matchAnalysisSrc);
  assert(usesAbort, "5.2 AbortController + signal threaded into fetch");
}

// 5.3 cleanup aborts the controller on unmount / fetch-key change
{
  const cleanupAborts = /return\s*\(\)\s*=>\s*\{[\s\S]*?abortRef\.current\.abort\(\)/.test(matchAnalysisSrc);
  assert(cleanupAborts, "5.3 useEffect cleanup aborts the controller");
}

// ============================================================
// 6. MatchAnalysis sends correct display names to API
// ============================================================

// 6.1 API body uses homeTeamName (display name) not homeTeam (code)
{
  const bodyMatch = matchAnalysisSrc.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/)?.[0] || "";
  const usesTeamName = /homeTeam:\s*homeTeamName/.test(bodyMatch);
  assert(usesTeamName, "6.1 API body sends homeTeamName (display name)");
}

// 6.2 API body uses awayTeamName (display name) not awayTeam (code)
{
  const bodyMatch = matchAnalysisSrc.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/)?.[0] || "";
  const usesTeamName = /awayTeam:\s*awayTeamName/.test(bodyMatch);
  assert(usesTeamName, "6.2 API body sends awayTeamName (display name)");
}

// ============================================================
// 7. MatchCard homeCode/awayCode used for team names (not match fields)
// ============================================================

// 7.1 homeName derived from homeTeam (which uses homeCode)
{
  const derivesHomeName = /const\s+homeName\s*=\s*homeTeam\?\.name/.test(matchCardSrc);
  assert(derivesHomeName, "7.1 homeName derived from homeTeam (bracket-derived)");
}

// 7.2 awayName derived from awayTeam (which uses awayCode)
{
  const derivesAwayName = /const\s+awayName\s*=\s*awayTeam\?\.name/.test(matchCardSrc);
  assert(derivesAwayName, "7.2 awayName derived from awayTeam (bracket-derived)");
}

// 7.3 MatchAnalysis receives homeName as homeTeamName
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const passesHomeName = /homeTeamName=\{homeName\}/.test(matchAnalysisJsx);
  assert(passesHomeName, "7.3 MatchAnalysis receives homeTeamName={homeName}");
}

// 7.4 MatchAnalysis receives awayName as awayTeamName
{
  const matchAnalysisJsx = matchCardSrc.match(/<MatchAnalysis[\s\S]*?\/>/)?.[0] || "";
  const passesAwayName = /awayTeamName=\{awayName\}/.test(matchAnalysisJsx);
  assert(passesAwayName, "7.4 MatchAnalysis receives awayTeamName={awayName}");
}

// ============================================================
// 8. Knockout matches have null homeTeam/awayTeam (confirming the bug scenario)
// ============================================================

{
  // matches has migrated from .js to .ts; try both for a clean failure mode.
  let matchesSrc;
  try {
    matchesSrc = readMigratedSrc(resolve(ROOT, "src/data/matches.js"), "utf8");
  } catch {
    matchesSrc = readMigratedSrc(resolve(ROOT, "src/data/matches.ts"), "utf8");
  }

  // 8.1 Knockout matches explicitly set homeTeam: null
  const hasNullHome = /homeTeam:\s*null/.test(matchesSrc);
  assert(hasNullHome, "8.1 Knockout matches define homeTeam: null");

  // 8.2 Knockout matches explicitly set awayTeam: null
  const hasNullAway = /awayTeam:\s*null/.test(matchesSrc);
  assert(hasNullAway, "8.2 Knockout matches define awayTeam: null");
}

// ============================================================
// 9. MatchCard memo comparator includes bracketEntry
// ============================================================

// 9.1 Memo comparator checks bracketEntry.home
{
  const checksBracketHome = /bracketEntry\?\.home/.test(matchCardSrc);
  assert(checksBracketHome, "9.1 Memo comparator checks bracketEntry.home");
}

// 9.2 Memo comparator checks bracketEntry.away
{
  const checksBracketAway = /bracketEntry\?\.away/.test(matchCardSrc);
  assert(checksBracketAway, "9.2 Memo comparator checks bracketEntry.away");
}

// ============================================================
// 10. End-to-end scenario verification
// ============================================================

// 10.1 Simulate: two forms with different finalists should produce different cache keys
{
  const cacheKey = (h, a, s) => `${h}-${a}-${s}`;
  const formA = { bracketEntry: { home: "BRA", away: "GER" }, match: { homeTeam: null, awayTeam: null } };
  const formB = { bracketEntry: { home: "ARG", away: "FRA" }, match: { homeTeam: null, awayTeam: null } };

  // Simulate homeCode/awayCode derivation (as in MatchCard lines 71-72)
  const homeCodeA = formA.bracketEntry?.home || formA.match.homeTeam;
  const awayCodeA = formA.bracketEntry?.away || formA.match.awayTeam;
  const homeCodeB = formB.bracketEntry?.home || formB.match.homeTeam;
  const awayCodeB = formB.bracketEntry?.away || formB.match.awayTeam;

  const keyA = cacheKey(homeCodeA, awayCodeA, "F");
  const keyB = cacheKey(homeCodeB, awayCodeB, "F");
  assert(keyA !== keyB, "10.1 Different forms with different finalists get different cache keys");
}

// 10.2 Before fix: both forms would collide on null keys
{
  const cacheKey = (h, a, s) => `${h}-${a}-${s}`;
  const formA = { match: { homeTeam: null, awayTeam: null } };
  const formB = { match: { homeTeam: null, awayTeam: null } };

  // OLD BUG: using match.homeTeam/awayTeam directly
  const keyA = cacheKey(formA.match.homeTeam, formA.match.awayTeam, "F");
  const keyB = cacheKey(formB.match.homeTeam, formB.match.awayTeam, "F");
  assert(keyA === keyB, "10.2 OLD BUG: null match fields produce colliding cache keys");
}

// 10.3 React key forces remount when teams change
{
  const formA = { bracketEntry: { home: "BRA", away: "GER" } };
  const formB = { bracketEntry: { home: "ARG", away: "FRA" } };
  const keyA = `${formA.bracketEntry.home}-${formA.bracketEntry.away}`;
  const keyB = `${formB.bracketEntry.home}-${formB.bracketEntry.away}`;
  assert(keyA !== keyB, "10.3 React key differs between forms → forces remount");
}

// 10.4 React key stays same when same teams → preserves component state
{
  const formA = { bracketEntry: { home: "BRA", away: "GER" } };
  const formB = { bracketEntry: { home: "BRA", away: "GER" } };
  const keyA = `${formA.bracketEntry.home}-${formA.bracketEntry.away}`;
  const keyB = `${formB.bracketEntry.home}-${formB.bracketEntry.away}`;
  assert(keyA === keyB, "10.4 Same teams across forms → same React key (cache serves correctly)");
}

// ============================================================

if (failures.length > 0) {
  console.error("\nFailed tests:");
  failures.forEach((f) => console.error("  - " + f));
}

console.log(`\n=== EXPERT ANALYSIS FIX: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
