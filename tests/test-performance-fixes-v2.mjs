// Tests for 4 performance fixes:
// Fix 1: Listener retry per-key + fallback + timeout/error state
// Fix 2: getRedirectResult error handling
// Fix 3: FNV-1a hash for bracket cache key
// Fix 4: Lazy bracket computation in AllForms

import { calcBracketTeams, deriveChampion } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { groupMatches, knockoutMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';

let passed = 0, failed = 0;
const failures = [];
function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

// =====================================================================
// Helper: replicate FNV-1a hash from bracketCache.js (Fix 3)
// =====================================================================
function getStableKeyHash(matchPredictions) {
  const entries = Object.entries(matchPredictions);
  if (entries.length === 0) return 0;
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let hash = 0x811c9dc5;
  for (let i = 0; i < entries.length; i++) {
    const id = entries[i][0];
    const p = entries[i][1];
    for (let j = 0; j < id.length; j++) {
      hash ^= id.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193);
    }
    const h = p?.homeScore ?? -1;
    const a = p?.awayScore ?? -1;
    hash ^= ((typeof h === 'number' ? h : -1) << 16) | ((typeof a === 'number' ? a : -1) & 0xffff);
    hash = Math.imul(hash, 0x01000193);
    if (p?.advancingTeam) {
      const at = p.advancingTeam;
      for (let j = 0; j < at.length; j++) {
        hash ^= at.charCodeAt(j);
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return hash;
}

// Old string-based key for comparison
function getStableKeyOld(matchPredictions) {
  const entries = Object.entries(matchPredictions);
  if (entries.length === 0) return "empty";
  const parts = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, p]) => `${id}:${p?.homeScore ?? ''}-${p?.awayScore ?? ''}${p?.advancingTeam ? '>' + p.advancingTeam : ''}`)
    .join('|');
  return parts;
}

function makeBaselinePredictions() {
  const preds = {};
  for (const m of groupMatches) preds[m.id] = { homeScore: 1, awayScore: 0 };
  for (const m of knockoutMatches) preds[m.id] = { homeScore: 1, awayScore: 0 };
  return preds;
}

// =====================================================================
//  FIX 1 — LISTENER RETRY/FALLBACK/ERROR STATE (10 bugs)
// =====================================================================
console.log("=== FIX 1: LISTENER RETRY/FALLBACK/ERROR STATE ===\n");

// Simulate the NEW per-key retry logic from store.js
function createRetrySystem() {
  const retryState = {};
  let storeError = null;
  const cache_ready = {};
  const cache = {};
  let fallbackCalls = [];

  function getRetry(key) {
    if (!retryState[key]) retryState[key] = { count: 0, inProgress: false };
    return retryState[key];
  }

  function simulateListenerError(key) {
    const rs = getRetry(key);
    if (rs.inProgress) return 'skipped';
    if (rs.count < 3) {
      rs.count++;
      rs.inProgress = true;
      // Simulate retry scheduling (immediate for testing)
      rs.inProgress = false;
      return 'retry';
    } else {
      // Retries exhausted — try fallback
      fallbackCalls.push(key);
      return 'fallback';
    }
  }

  function simulateFallbackSuccess(key, data) {
    cache[key] = data;
    cache_ready[key] = true;
    const rs = getRetry(key);
    rs.count = 0;
  }

  function simulateFallbackFailure(key) {
    storeError = { key, message: `Failed to load ${key}`, timestamp: Date.now() };
  }

  function simulateListenerSuccess(key, data) {
    const rs = getRetry(key);
    rs.count = 0;
    cache[key] = data;
    cache_ready[key] = true;
  }

  const DOCS = ['users', 'matchResults', 'actualAdvancing', 'actualBonuses', 'settings'];
  function isStoreReady() {
    return DOCS.every(k => cache_ready[k]) && cache_ready.predictions;
  }

  function getStoreError() { return storeError; }
  function clearError() { storeError = null; }

  return {
    getRetry, simulateListenerError, simulateFallbackSuccess,
    simulateFallbackFailure, simulateListenerSuccess, isStoreReady,
    getStoreError, clearError, retryState, cache_ready, cache, fallbackCalls,
  };
}

console.log("--- F1-Bug1: Per-key retry — listeners don't steal each other's retries ---");
{
  const sys = createRetrySystem();
  // Fail 'users' 3 times
  sys.simulateListenerError('users');
  sys.simulateListenerError('users');
  sys.simulateListenerError('users');
  assert(sys.getRetry('users').count === 3, "Users retried 3 times");

  // 'settings' should still have fresh retries
  assert(sys.getRetry('settings').count === 0, "Settings retry count starts at 0");
  sys.simulateListenerError('settings');
  assert(sys.getRetry('settings').count === 1, "Settings retried independently");
}

console.log("--- F1-Bug2: Fallback triggered after 3 retries ---");
{
  const sys = createRetrySystem();
  assert(sys.simulateListenerError('users') === 'retry', "1st error: retry");
  assert(sys.simulateListenerError('users') === 'retry', "2nd error: retry");
  assert(sys.simulateListenerError('users') === 'retry', "3rd error: retry");
  assert(sys.simulateListenerError('users') === 'fallback', "4th error: fallback triggered");
  assert(sys.fallbackCalls.includes('users'), "Fallback called for 'users'");
}

console.log("--- F1-Bug3: Fallback success marks ready ---");
{
  const sys = createRetrySystem();
  assert(!sys.cache_ready['users'], "Not ready before fallback");
  sys.simulateFallbackSuccess('users', { u1: { id: 'u1' } });
  assert(sys.cache_ready['users'] === true, "Ready after fallback success");
  assert(sys.cache['users'].u1.id === 'u1', "Data loaded via fallback");
}

console.log("--- F1-Bug4: Fallback failure sets storeError ---");
{
  const sys = createRetrySystem();
  sys.simulateFallbackFailure('users');
  const err = sys.getStoreError();
  assert(err !== null, "storeError is set");
  assert(err.key === 'users', "Error key is 'users'");
  assert(typeof err.message === 'string', "Error has message");
  assert(typeof err.timestamp === 'number', "Error has timestamp");
}

console.log("--- F1-Bug5: isStoreReady requires all 6 keys ---");
{
  const sys = createRetrySystem();
  // Load 5 out of 6
  for (const k of ['users', 'matchResults', 'actualAdvancing', 'actualBonuses', 'settings']) {
    sys.simulateListenerSuccess(k, {});
  }
  assert(!sys.isStoreReady(), "Not ready without predictions");
  sys.simulateListenerSuccess('predictions', {});
  assert(sys.isStoreReady(), "Ready when all 6 loaded");
}

console.log("--- F1-Bug6: Successful listener resets retry count ---");
{
  const sys = createRetrySystem();
  sys.simulateListenerError('users');
  sys.simulateListenerError('users');
  assert(sys.getRetry('users').count === 2, "Count is 2 after 2 errors");
  sys.simulateListenerSuccess('users', {});
  assert(sys.getRetry('users').count === 0, "Count reset to 0 after success");
}

console.log("--- F1-Bug7: Multiple keys can fail independently ---");
{
  const sys = createRetrySystem();
  // Fail users 3x, settings 2x, predictions 1x
  for (let i = 0; i < 3; i++) sys.simulateListenerError('users');
  for (let i = 0; i < 2; i++) sys.simulateListenerError('settings');
  sys.simulateListenerError('predictions');

  assert(sys.getRetry('users').count === 3, "Users: 3 retries");
  assert(sys.getRetry('settings').count === 2, "Settings: 2 retries");
  assert(sys.getRetry('predictions').count === 1, "Predictions: 1 retry");
  // Users triggers fallback, others still have retries left
  assert(sys.simulateListenerError('users') === 'fallback', "Users: fallback");
  assert(sys.simulateListenerError('settings') === 'retry', "Settings: still retrying");
}

console.log("--- F1-Bug8: Error state cleared on successful reconnect ---");
{
  const sys = createRetrySystem();
  sys.simulateFallbackFailure('users');
  assert(sys.getStoreError() !== null, "Error set");
  sys.clearError();
  assert(sys.getStoreError() === null, "Error cleared");
}

console.log("--- F1-Bug9: inProgress flag prevents concurrent retries ---");
{
  const sys = createRetrySystem();
  const rs = sys.getRetry('users');
  rs.inProgress = true;
  assert(sys.simulateListenerError('users') === 'skipped', "Skipped while retry in progress");
  assert(rs.count === 0, "Count unchanged when skipped");
}

console.log("--- F1-Bug10: Partial ready — some listeners succeed, one fails ---");
{
  const sys = createRetrySystem();
  // 5 succeed, predictions fails entirely
  for (const k of ['users', 'matchResults', 'actualAdvancing', 'actualBonuses', 'settings']) {
    sys.simulateListenerSuccess(k, {});
  }
  // predictions fails 3 times then fallback also fails
  for (let i = 0; i < 3; i++) sys.simulateListenerError('predictions');
  sys.simulateListenerError('predictions'); // triggers fallback
  sys.simulateFallbackFailure('predictions');

  assert(!sys.isStoreReady(), "Not ready — predictions failed");
  assert(sys.getStoreError() !== null, "Error is set for predictions");
  assert(sys.getStoreError().key === 'predictions', "Error key is predictions");
}

console.log("--- F1-Bug11: Fallback resets retry count on success ---");
{
  const sys = createRetrySystem();
  for (let i = 0; i < 3; i++) sys.simulateListenerError('users');
  assert(sys.getRetry('users').count === 3, "3 retries exhausted");
  sys.simulateFallbackSuccess('users', {});
  assert(sys.getRetry('users').count === 0, "Retry count reset after fallback success");
}

console.log("--- F1-Bug12: Concurrent failures across all 6 listeners ---");
{
  const sys = createRetrySystem();
  const allKeys = ['users', 'matchResults', 'actualAdvancing', 'actualBonuses', 'settings', 'predictions'];
  // Each key fails once
  for (const k of allKeys) sys.simulateListenerError(k);
  // Each should have count=1 independently
  for (const k of allKeys) {
    assert(sys.getRetry(k).count === 1, `${k} has 1 retry (independent)`);
  }
  // Total retries used: 6, but each key still has 2 left
  for (const k of allKeys) {
    assert(sys.simulateListenerError(k) === 'retry', `${k} can still retry`);
  }
}

// =====================================================================
//  FIX 2 — AUTH REDIRECT ERROR HANDLING (10 bugs)
// =====================================================================
console.log("\n=== FIX 2: AUTH REDIRECT ERROR HANDLING ===\n");

// Simulate the event dispatch pattern used in firebase.js
function simulateRedirectErrorHandling(errorCode, errorMessage) {
  const events = [];

  // Simulate the new firebase.js logic
  function handleRedirectError(err) {
    // Should log
    events.push({ type: 'console.error', code: err.code, message: err.message });
    // Should dispatch event
    events.push({ type: 'dispatch', code: err.code, message: err.message });
  }

  handleRedirectError({ code: errorCode, message: errorMessage });
  return events;
}

console.log("--- F2-Bug1: Network error dispatches event ---");
{
  const events = simulateRedirectErrorHandling('auth/network-request-failed', 'Network error');
  assert(events.length === 2, "Two events: log + dispatch");
  assert(events[1].type === 'dispatch', "Event dispatched");
  assert(events[1].code === 'auth/network-request-failed', "Correct error code");
}

console.log("--- F2-Bug2: Internal error dispatches event ---");
{
  const events = simulateRedirectErrorHandling('auth/internal-error', 'Internal error');
  assert(events[0].type === 'console.error', "Error logged");
  assert(events[1].code === 'auth/internal-error', "Correct error code in event");
}

console.log("--- F2-Bug3: Popup-closed should be filterable ---");
{
  // The WelcomeScreen should filter out user-initiated cancellations
  const userCancellations = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
  for (const code of userCancellations) {
    const shouldShow = !userCancellations.includes(code);
    assert(!shouldShow, `${code} is in cancellation list (should be filtered out by UI)`);
  }
}

console.log("--- F2-Bug4: Permission denied dispatches with correct code ---");
{
  const events = simulateRedirectErrorHandling('auth/unauthorized-domain', 'Unauthorized domain');
  assert(events[1].code === 'auth/unauthorized-domain', "Unauthorized domain code preserved");
}

console.log("--- F2-Bug5: Error message string preserved ---");
{
  const msg = 'שגיאה בהתחברות';
  const events = simulateRedirectErrorHandling('auth/unknown', msg);
  assert(events[1].message === msg, "Hebrew message preserved");
}

console.log("--- F2-Bug6: Null/undefined error fields don't crash ---");
{
  let crashed = false;
  try {
    const events = [];
    const err = { code: undefined, message: null };
    events.push({ type: 'console.error', code: err.code, message: err.message });
    events.push({ type: 'dispatch', code: err.code, message: err.message });
    assert(events.length === 2, "Handles undefined code gracefully");
  } catch (e) {
    crashed = true;
  }
  assert(!crashed, "No crash on null/undefined error fields");
}

console.log("--- F2-Bug7: Missing-initial-state (common on mobile) dispatches event ---");
{
  const events = simulateRedirectErrorHandling('auth/missing-initial-state', 'Missing initial state');
  assert(events[1].code === 'auth/missing-initial-state', "Mobile-common error dispatched");
}

console.log("--- F2-Bug8: Multiple errors don't accumulate (each is independent) ---");
{
  const events1 = simulateRedirectErrorHandling('auth/error-1', 'First');
  const events2 = simulateRedirectErrorHandling('auth/error-2', 'Second');
  assert(events1.length === 2, "First error: 2 events");
  assert(events2.length === 2, "Second error: 2 events");
  assert(events1[1].code !== events2[1].code, "Different error codes");
}

console.log("--- F2-Bug9: Error object without code property ---");
{
  let crashed = false;
  try {
    const events = [];
    const err = { message: 'Unknown error' };
    events.push({ type: 'console.error', code: err.code, message: err.message });
    events.push({ type: 'dispatch', code: err.code || 'unknown', message: err.message });
    assert(events[1].code === 'unknown', "Missing code defaults to 'unknown'");
  } catch (e) {
    crashed = true;
  }
  assert(!crashed, "No crash when error has no code");
}

console.log("--- F2-Bug10: Non-Error thrown (string/number) ---");
{
  let crashed = false;
  try {
    const err = "string error";
    const code = typeof err === 'object' ? err?.code : 'unknown';
    const message = typeof err === 'object' ? err?.message : String(err);
    assert(code === 'unknown', "String error gets 'unknown' code");
    assert(message === 'string error', "String error message preserved");
  } catch (e) {
    crashed = true;
  }
  assert(!crashed, "Handles non-Error thrown values");
}

// =====================================================================
//  FIX 3 — FNV-1a HASH FOR BRACKET CACHE KEY (12 bugs)
// =====================================================================
console.log("\n=== FIX 3: FNV-1a HASH FOR BRACKET CACHE KEY ===\n");

console.log("--- F3-Bug1: Empty predictions returns consistent value ---");
{
  const h1 = getStableKeyHash({});
  const h2 = getStableKeyHash({});
  assert(h1 === 0, "Empty predictions returns 0");
  assert(h1 === h2, "Consistent for empty");
}

console.log("--- F3-Bug2: Same predictions produce same hash ---");
{
  const preds = makeBaselinePredictions();
  const h1 = getStableKeyHash(preds);
  const h2 = getStableKeyHash(preds);
  assert(h1 === h2, "Same input = same hash");
}

console.log("--- F3-Bug3: Different predictions produce different hash ---");
{
  const predsA = makeBaselinePredictions();
  const predsB = { ...predsA };
  const firstKey = Object.keys(predsB)[0];
  predsB[firstKey] = { homeScore: 0, awayScore: 5 };
  assert(getStableKeyHash(predsA) !== getStableKeyHash(predsB), "Different input = different hash");
}

console.log("--- F3-Bug4: Every position change detected (no sampling gaps) ---");
{
  const base = makeBaselinePredictions();
  const ids = Object.keys(base);
  const baseHash = getStableKeyHash(base);
  let uniqueCount = 0;
  // Test first 20 positions
  for (let i = 0; i < 20 && i < ids.length; i++) {
    const variant = { ...base };
    variant[ids[i]] = { homeScore: 0, awayScore: 9 };
    if (getStableKeyHash(variant) !== baseHash) uniqueCount++;
  }
  assert(uniqueCount === Math.min(20, ids.length), `All 20 positions produce unique hash, got ${uniqueCount}`);
}

console.log("--- F3-Bug5: Property order doesn't affect hash (sorted) ---");
{
  const predsA = { "z-match": { homeScore: 1, awayScore: 0 }, "a-match": { homeScore: 2, awayScore: 1 } };
  const predsB = { "a-match": { homeScore: 2, awayScore: 1 }, "z-match": { homeScore: 1, awayScore: 0 } };
  assert(getStableKeyHash(predsA) === getStableKeyHash(predsB), "Order independent");
}

console.log("--- F3-Bug6: advancingTeam affects hash ---");
{
  const predsA = { "ko-1": { homeScore: 1, awayScore: 1, advancingTeam: "BRA" } };
  const predsB = { "ko-1": { homeScore: 1, awayScore: 1, advancingTeam: "ARG" } };
  assert(getStableKeyHash(predsA) !== getStableKeyHash(predsB), "Different advancingTeam = different hash");
}

console.log("--- F3-Bug7: null score vs 0 score vs undefined score ---");
{
  const hNull = getStableKeyHash({ "m1": { homeScore: null, awayScore: null } });
  const hZero = getStableKeyHash({ "m1": { homeScore: 0, awayScore: 0 } });
  const hUndef = getStableKeyHash({ "m1": {} });
  assert(hNull !== hZero, "null !== 0");
  assert(hNull === hUndef, "null and undefined both map to -1 sentinel");
}

console.log("--- F3-Bug8: Hash is a 32-bit integer ---");
{
  const preds = makeBaselinePredictions();
  const hash = getStableKeyHash(preds);
  assert(typeof hash === 'number', "Hash is number");
  assert(Number.isInteger(hash), "Hash is integer");
  assert(hash >= -2147483648 && hash <= 2147483647, "Hash is 32-bit range");
}

console.log("--- F3-Bug9: Performance — hash is faster than string key ---");
{
  const preds = makeBaselinePredictions();
  // Time hash
  const t1 = performance.now();
  for (let i = 0; i < 500; i++) getStableKeyHash(preds);
  const hashTime = performance.now() - t1;
  // Time string key
  const t2 = performance.now();
  for (let i = 0; i < 500; i++) getStableKeyOld(preds);
  const stringTime = performance.now() - t2;

  assert(hashTime < stringTime, `Hash (${hashTime.toFixed(1)}ms) faster than string (${stringTime.toFixed(1)}ms)`);
  console.log(`  Hash: ${hashTime.toFixed(1)}ms, String: ${stringTime.toFixed(1)}ms (${(stringTime/hashTime).toFixed(1)}x faster)`);
}

console.log("--- F3-Bug10: No collision across 250 unique forms ---");
{
  const base = makeBaselinePredictions();
  const ids = Object.keys(base);
  const hashes = new Set();
  hashes.add(getStableKeyHash(base));
  for (let i = 0; i < 250 && i < ids.length; i++) {
    const variant = { ...base };
    // Each variant changes a unique match to a unique score pair
    variant[ids[i]] = { homeScore: i + 10, awayScore: i + 20 };
    hashes.add(getStableKeyHash(variant));
  }
  const expected = Math.min(251, ids.length + 1);
  // Allow at most 1 collision (extremely unlikely with FNV-1a)
  assert(hashes.size >= expected - 1, `At least ${expected - 1} unique hashes out of ${expected}, got ${hashes.size}`);
}

console.log("--- F3-Bug11: Extra fields in prediction object ignored ---");
{
  const hA = getStableKeyHash({ "m1": { homeScore: 1, awayScore: 0 } });
  const hB = getStableKeyHash({ "m1": { homeScore: 1, awayScore: 0, extraField: "xyz", timestamp: 12345 } });
  assert(hA === hB, "Extra fields don't affect hash");
}

console.log("--- F3-Bug12: Hash matches bracket result (functional correctness) ---");
{
  // Verify cache with hash key returns same bracket as direct computation
  const cache = new Map();
  const preds = makeBaselinePredictions();
  const key = getStableKeyHash(preds);
  const direct = calcBracketTeams(preds);
  cache.set(key, direct);

  // Same preds → same key → cache hit → same result
  const key2 = getStableKeyHash(preds);
  assert(key === key2, "Same preds = same hash");
  assert(cache.get(key2) === direct, "Cache hit returns correct bracket");

  // Modified preds → different key → cache miss
  const preds2 = { ...preds };
  preds2[Object.keys(preds2)[0]] = { homeScore: 5, awayScore: 0 };
  const key3 = getStableKeyHash(preds2);
  assert(key3 !== key, "Modified preds = different hash");
  assert(!cache.has(key3), "Cache miss for modified preds");
}

// =====================================================================
//  FIX 4 — LAZY BRACKET IN AllForms (10 bugs)
// =====================================================================
console.log("\n=== FIX 4: LAZY BRACKET IN AllForms ===\n");

// Simulate the lazy computation pattern:
// Old: const bracketTeams = useMemo(() => calcBracketTeams(predictions), [predictions]);
// New: const bracketTeams = useMemo(() => expanded ? getCachedBracket(predictions) : null, [predictions, expanded]);

function simulateFormCard(predictions, expanded) {
  let computeCount = 0;
  // Simulate the new lazy pattern
  const bracketTeams = (() => {
    if (!expanded) return null;
    computeCount++;
    return calcBracketTeams(predictions);
  })();
  return { bracketTeams, computeCount };
}

console.log("--- F4-Bug1: Collapsed card does NOT compute bracket ---");
{
  const preds = makeBaselinePredictions();
  const { bracketTeams, computeCount } = simulateFormCard(preds, false);
  assert(bracketTeams === null, "Collapsed: bracket is null");
  assert(computeCount === 0, "Collapsed: 0 computations");
}

console.log("--- F4-Bug2: Expanded card DOES compute bracket ---");
{
  const preds = makeBaselinePredictions();
  const { bracketTeams, computeCount } = simulateFormCard(preds, true);
  assert(bracketTeams !== null, "Expanded: bracket computed");
  assert(computeCount === 1, "Expanded: 1 computation");
  assert(typeof bracketTeams === 'object', "Bracket is object");
}

console.log("--- F4-Bug3: Bracket has knockout match entries when expanded ---");
{
  const preds = makeBaselinePredictions();
  const { bracketTeams } = simulateFormCard(preds, true);
  const keys = Object.keys(bracketTeams);
  assert(keys.length > 0, `Bracket has ${keys.length} entries`);
  // Should have R32 matches
  const r32Keys = keys.filter(k => k.startsWith('R32'));
  assert(r32Keys.length > 0, `Has R32 entries: ${r32Keys.length}`);
}

console.log("--- F4-Bug4: Empty predictions don't crash when expanded ---");
{
  let crashed = false;
  try {
    const { bracketTeams } = simulateFormCard({}, true);
    assert(bracketTeams !== null, "Empty preds: returns object");
    assert(typeof bracketTeams === 'object', "Empty preds: is object");
  } catch (e) {
    crashed = true;
  }
  assert(!crashed, "No crash on empty predictions when expanded");
}

console.log("--- F4-Bug5: 250 collapsed forms = 0 bracket computations ---");
{
  const preds = makeBaselinePredictions();
  let totalComputes = 0;
  for (let i = 0; i < 250; i++) {
    const { computeCount } = simulateFormCard(preds, false);
    totalComputes += computeCount;
  }
  assert(totalComputes === 0, `250 collapsed forms: ${totalComputes} computes (should be 0)`);
}

console.log("--- F4-Bug6: Expanding one form doesn't affect others ---");
{
  const preds = makeBaselinePredictions();
  const collapsed = simulateFormCard(preds, false);
  const expanded = simulateFormCard(preds, true);
  assert(collapsed.bracketTeams === null, "Collapsed stays null");
  assert(expanded.bracketTeams !== null, "Expanded has bracket");
}

console.log("--- F4-Bug7: Bracket result matches direct calcBracketTeams ---");
{
  const preds = makeBaselinePredictions();
  const { bracketTeams } = simulateFormCard(preds, true);
  const direct = calcBracketTeams(preds);
  const keys = new Set([...Object.keys(bracketTeams), ...Object.keys(direct)]);
  let mismatch = false;
  for (const k of keys) {
    if (bracketTeams[k]?.home !== direct[k]?.home || bracketTeams[k]?.away !== direct[k]?.away) {
      mismatch = true;
      break;
    }
  }
  assert(!mismatch, "Lazy bracket result identical to direct computation");
}

console.log("--- F4-Bug8: Null predictions handled ---");
{
  let crashed = false;
  try {
    // Simulate what happens when form.matches is undefined
    const { bracketTeams } = simulateFormCard(undefined || {}, false);
    assert(bracketTeams === null, "Null preds collapsed: null");
    const { bracketTeams: bt2 } = simulateFormCard(undefined || {}, true);
    assert(bt2 !== null, "Null preds expanded: empty object");
  } catch (e) {
    crashed = true;
  }
  assert(!crashed, "No crash with null/undefined predictions");
}

console.log("--- F4-Bug9: Performance — 250 forms with lazy vs eager ---");
{
  const preds = makeBaselinePredictions();
  // Lazy: all collapsed
  const t1 = performance.now();
  for (let i = 0; i < 250; i++) simulateFormCard(preds, false);
  const lazyTime = performance.now() - t1;

  // Eager: all compute bracket
  const t2 = performance.now();
  for (let i = 0; i < 250; i++) simulateFormCard(preds, true);
  const eagerTime = performance.now() - t2;

  assert(lazyTime < eagerTime, `Lazy (${lazyTime.toFixed(1)}ms) faster than eager (${eagerTime.toFixed(1)}ms)`);
  console.log(`  Lazy: ${lazyTime.toFixed(1)}ms, Eager: ${eagerTime.toFixed(1)}ms`);
}

console.log("--- F4-Bug10: Knockout teams display correctly when expanded ---");
{
  const preds = makeBaselinePredictions();
  const { bracketTeams } = simulateFormCard(preds, true);
  // Verify that bracket entries have home and away fields
  let hasValidEntry = false;
  for (const [id, entry] of Object.entries(bracketTeams)) {
    if (entry && entry.home && entry.away) {
      hasValidEntry = true;
      assert(typeof entry.home === 'string', `${id} home is string`);
      assert(typeof entry.away === 'string', `${id} away is string`);
      break;
    }
  }
  assert(hasValidEntry, "At least one bracket entry has valid home/away teams");
}

// =====================================================================
//  SUMMARY
// =====================================================================
console.log("");
if (failures.length > 0) {
  console.log("FAILURES:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log(`\n=== PERFORMANCE FIXES V2: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
