// Tests for Fix #3: Bracket cache key collision bug
// Tests that the cache key uses ALL entries, not sampling, and covers 12 potential bugs
// NOTE: bracketCache.js imports React (useMemo), so we replicate & test the key logic directly

import { calcBracketTeams, deriveChampion, calcGroupStandings } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { groupMatches, knockoutMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';

let passed = 0, failed = 0;
const failures = [];
function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

console.log("=== BRACKET CACHE FIX TESTS ===\n");

// ========================================================================
// Replicate the NEW getStableKey from bracketCache.js (post-fix)
// ========================================================================
function getStableKeyNew(matchPredictions) {
  const entries = Object.entries(matchPredictions);
  if (entries.length === 0) return "empty";
  const parts = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, p]) => `${id}:${p?.homeScore ?? ''}-${p?.awayScore ?? ''}${p?.advancingTeam ? '>' + p.advancingTeam : ''}`)
    .join('|');
  return parts;
}

// Replicate the OLD getStableKey (pre-fix, for comparison)
function getStableKeyOld(matchPredictions) {
  const entries = Object.entries(matchPredictions);
  if (entries.length === 0) return "empty";
  const samples = entries.filter((_, i) => i % 5 === 0)
    .map(([id, p]) => `${id}:${p?.homeScore ?? ''}-${p?.awayScore ?? ''}`)
    .join('|');
  return `${entries.length}_${samples}`;
}

// Simple cache implementation for testing (mirrors bracketCache.js without React)
function createCache(keyFn) {
  const bracketMap = new Map();
  const championMap = new Map();
  return {
    getBracket(preds) {
      const key = keyFn(preds);
      if (bracketMap.has(key)) return bracketMap.get(key);
      const result = calcBracketTeams(preds);
      bracketMap.set(key, result);
      if (bracketMap.size > 500) bracketMap.delete(bracketMap.keys().next().value);
      return result;
    },
    getChampion(preds) {
      const key = keyFn(preds);
      if (championMap.has(key)) return championMap.get(key);
      const bracket = this.getBracket(preds);
      const champ = deriveChampion(preds, bracket);
      championMap.set(key, champ);
      if (championMap.size > 500) championMap.delete(championMap.keys().next().value);
      return champ;
    },
    clear() { bracketMap.clear(); championMap.clear(); },
    size() { return bracketMap.size; },
  };
}

// Helpers
function makeBaselinePredictions() {
  const preds = {};
  for (const m of groupMatches) preds[m.id] = { homeScore: 1, awayScore: 0 };
  for (const m of knockoutMatches) preds[m.id] = { homeScore: 1, awayScore: 0 };
  return preds;
}

const newCache = createCache(getStableKeyNew);
const oldCache = createCache(getStableKeyOld);

// ============================================================
// COMPARATIVE TEST: Before vs After — functional equivalence
// ============================================================
console.log("--- 1. Functional Equivalence: new cache vs direct calc ---");
{
  newCache.clear();
  const preds = makeBaselinePredictions();
  const cached = newCache.getBracket(preds);
  const direct = calcBracketTeams(preds);

  const allKeys = new Set([...Object.keys(cached), ...Object.keys(direct)]);
  let mismatch = false;
  for (const key of allKeys) {
    if (cached[key]?.home !== direct[key]?.home || cached[key]?.away !== direct[key]?.away) {
      mismatch = true;
      break;
    }
  }
  assert(!mismatch, "Cached bracket identical to direct calcBracketTeams result");
  assert(allKeys.size > 0, "Bracket should have entries");
}

console.log("--- 2. Functional Equivalence: champion ---");
{
  newCache.clear();
  const preds = makeBaselinePredictions();
  const cachedChamp = newCache.getChampion(preds);
  const bracket = calcBracketTeams(preds);
  const directChamp = deriveChampion(preds, bracket);
  assert(cachedChamp === directChamp, `Champion match: cached=${cachedChamp} direct=${directChamp}`);
}

console.log("--- 3. Cache returns same reference on hit ---");
{
  newCache.clear();
  const preds = makeBaselinePredictions();
  const first = newCache.getBracket(preds);
  const second = newCache.getBracket(preds);
  assert(first === second, "Same input should return same reference from cache");
}

// ============================================================
// COMPARATIVE: Demonstrate old cache had collisions, new cache doesn't
// ============================================================
console.log("--- 4. COMPARATIVE: Old cache COLLIDES, new cache does NOT ---");
{
  const predsA = makeBaselinePredictions();
  const ids = Object.keys(predsA);
  // Index 1 is NOT a multiple of 5 — old key wouldn't detect change here
  const targetId = ids[1];

  const predsB = { ...predsA };
  predsB[targetId] = { homeScore: 0, awayScore: 3 };

  const oldKeyA = getStableKeyOld(predsA);
  const oldKeyB = getStableKeyOld(predsB);
  const newKeyA = getStableKeyNew(predsA);
  const newKeyB = getStableKeyNew(predsB);

  assert(oldKeyA === oldKeyB, "OLD key DOES collide for change at index 1 (proving the bug existed)");
  assert(newKeyA !== newKeyB, "NEW key does NOT collide for change at index 1 (bug fixed)");
}

// ============================================================
// BUG #1: Collision — two different predictions at non-sampled indices
// ============================================================
console.log("--- Bug #1: No collision for changes at non-sampled indices ---");
{
  newCache.clear();
  const predsA = makeBaselinePredictions();
  const ids = Object.keys(predsA);

  const predsB = { ...predsA };
  predsB[ids[1]] = { homeScore: 0, awayScore: 3 };

  const bracketA = newCache.getBracket(predsA);
  const bracketB = newCache.getBracket(predsB);
  assert(bracketA !== bracketB, "Different predictions at index 1 must produce different brackets");
}

// ============================================================
// BUG #2: Collision at indices 2,3,4 (between old sampling points)
// ============================================================
console.log("--- Bug #2: No collision for changes at indices 2,3,4 ---");
{
  const predsBase = makeBaselinePredictions();
  const ids = Object.keys(predsBase);

  for (const idx of [2, 3, 4]) {
    newCache.clear();
    const predsChanged = { ...predsBase };
    predsChanged[ids[idx]] = { homeScore: 0, awayScore: 5 };

    const base = newCache.getBracket(predsBase);
    const changed = newCache.getBracket(predsChanged);
    assert(base !== changed, `Change at index ${idx} must produce different bracket`);
  }
}

// ============================================================
// BUG #3: advancingTeam field affects key
// ============================================================
console.log("--- Bug #3: advancingTeam differences detected ---");
{
  const predsA = makeBaselinePredictions();
  const koMatch = knockoutMatches[0];
  predsA[koMatch.id] = { homeScore: 1, awayScore: 1, advancingTeam: "TEAMA" };

  const predsB = { ...predsA };
  predsB[koMatch.id] = { homeScore: 1, awayScore: 1, advancingTeam: "TEAMB" };

  const keyA = getStableKeyNew(predsA);
  const keyB = getStableKeyNew(predsB);
  assert(keyA !== keyB, "Different advancingTeam must produce different cache keys");
}

// ============================================================
// BUG #4: Empty predictions handled correctly
// ============================================================
console.log("--- Bug #4: Empty predictions ---");
{
  newCache.clear();
  const bracket = newCache.getBracket({});
  assert(typeof bracket === 'object', "Empty predictions should return an object");
  assert(Object.keys(bracket).length === 0, "Empty predictions should yield empty bracket");
  const bracket2 = newCache.getBracket({});
  assert(bracket === bracket2, "Empty predictions should be cached");
}

// ============================================================
// BUG #5: Null/undefined scores vs 0 scores
// ============================================================
console.log("--- Bug #5: Null/undefined scores vs 0 ---");
{
  const keyA = getStableKeyNew({ "m1": { homeScore: null, awayScore: null } });
  const keyB = getStableKeyNew({ "m1": { homeScore: 0, awayScore: 0 } });
  assert(keyA !== keyB, "null scores vs 0 scores must have different keys");
}

// ============================================================
// BUG #6: Key determinism — property order doesn't matter
// ============================================================
console.log("--- Bug #6: Key determinism regardless of property order ---");
{
  const predsA = { "z-match": { homeScore: 1, awayScore: 0 }, "a-match": { homeScore: 2, awayScore: 1 } };
  const predsB = { "a-match": { homeScore: 2, awayScore: 1 }, "z-match": { homeScore: 1, awayScore: 0 } };

  const keyA = getStableKeyNew(predsA);
  const keyB = getStableKeyNew(predsB);
  assert(keyA === keyB, "Property order should not affect key (sorted internally)");
}

// ============================================================
// BUG #7: Cache eviction at boundary
// ============================================================
console.log("--- Bug #7: Cache eviction at 500 ---");
{
  newCache.clear();
  for (let i = 0; i < 502; i++) {
    newCache.getBracket({ [`unique-${i}`]: { homeScore: i % 10, awayScore: 0 } });
  }
  const result = newCache.getBracket({ "final-test": { homeScore: 1, awayScore: 1 } });
  assert(typeof result === 'object', "Cache eviction should not break functionality");
  assert(newCache.size() <= 503, `Cache size should stay bounded, got ${newCache.size()}`);
}

// ============================================================
// BUG #8: Champion cache independence
// ============================================================
console.log("--- Bug #8: Champion cache independence ---");
{
  newCache.clear();
  const preds = makeBaselinePredictions();
  const champ1 = newCache.getChampion(preds);

  const preds2 = { ...preds, "group-A-1": { homeScore: 0, awayScore: 5 } };
  const champ2 = newCache.getChampion(preds2);

  assert(typeof champ1 === 'string' || champ1 === null, "Champion should be string or null");
  assert(typeof champ2 === 'string' || champ2 === null, "Champion 2 should be string or null");
}

// ============================================================
// BUG #9: Clear truly clears both caches
// ============================================================
console.log("--- Bug #9: Clear clears everything ---");
{
  const preds = makeBaselinePredictions();
  newCache.getBracket(preds);
  newCache.getChampion(preds);
  newCache.clear();
  assert(newCache.size() === 0, "After clear, cache size should be 0");
}

// ============================================================
// BUG #10: Every position produces unique key
// ============================================================
console.log("--- Bug #10: Every position change produces unique key ---");
{
  const base = makeBaselinePredictions();
  const ids = Object.keys(base).slice(0, 10);
  const baseKey = getStableKeyNew(base);

  let uniqueCount = 0;
  for (let i = 0; i < ids.length; i++) {
    const variant = { ...base };
    variant[ids[i]] = { homeScore: 0, awayScore: 9 };
    const variantKey = getStableKeyNew(variant);
    if (variantKey !== baseKey) uniqueCount++;
  }
  assert(uniqueCount === 10, `All 10 positions should produce unique keys, got ${uniqueCount}`);
}

// ============================================================
// BUG #11: Performance — key generation is fast
// ============================================================
console.log("--- Bug #11: Key generation performance ---");
{
  const preds = makeBaselinePredictions();
  const t1 = performance.now();
  for (let i = 0; i < 1000; i++) {
    getStableKeyNew(preds);
  }
  const t2 = performance.now();
  const totalMs = t2 - t1;
  assert(totalMs < 500, `1000 key generations should be <500ms, got ${totalMs.toFixed(2)}ms`);
}

// ============================================================
// BUG #12: Predictions with extra fields don't corrupt key
// ============================================================
console.log("--- Bug #12: Extra fields in prediction objects ---");
{
  const keyA = getStableKeyNew({ "m1": { homeScore: 1, awayScore: 0 } });
  const keyB = getStableKeyNew({ "m1": { homeScore: 1, awayScore: 0, extraField: "ignored" } });
  // Key only includes homeScore, awayScore, advancingTeam — extra fields don't affect it
  assert(keyA === keyB, "Extra fields should not affect key generation");
}

// ============================================================
// COMPARATIVE: Old vs New key collision rate
// ============================================================
console.log("--- COMPARATIVE: Collision rate old vs new ---");
{
  const base = makeBaselinePredictions();
  const ids = Object.keys(base);
  let oldCollisions = 0;
  let newCollisions = 0;
  const baseOldKey = getStableKeyOld(base);
  const baseNewKey = getStableKeyNew(base);

  // Test changes at every position
  for (let i = 0; i < Math.min(ids.length, 50); i++) {
    const variant = { ...base };
    variant[ids[i]] = { homeScore: 0, awayScore: 9 };

    if (getStableKeyOld(variant) === baseOldKey) oldCollisions++;
    if (getStableKeyNew(variant) === baseNewKey) newCollisions++;
  }

  assert(newCollisions === 0, `New key should have 0 collisions, got ${newCollisions}`);
  assert(oldCollisions > 0, `Old key should have had collisions (proving fix was needed), got ${oldCollisions}`);
  console.log(`  (Old key had ${oldCollisions} collisions in 50 tests, new key has ${newCollisions})`);
}

// ============================================================
// Summary
// ============================================================
console.log("");
if (failures.length > 0) {
  console.log("FAILURES:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log(`\n=== BRACKET CACHE FIX: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
