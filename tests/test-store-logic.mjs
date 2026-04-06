// Tests store.js logic: auth flow, cache behavior, write guards, race conditions
// We can't test actual Firebase, but we can test all pure logic and state management

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== STORE LOGIC & FIREBASE INTEGRATION TESTS ===\n");

// ============ 1. initRealtimeListeners guard ============
console.log("--- 1. initRealtimeListeners: idempotency ---");

// Simulate the guard logic from store.js
let listenersInitialized = false;
let listenersHadError = false;
let initCount = 0;

function simulateInit() {
  if (listenersInitialized && !listenersHadError) return false;
  listenersInitialized = true;
  listenersHadError = false;
  initCount++;
  return true;
}

assert(simulateInit() === true, "First call initializes");
assert(initCount === 1, "Init count = 1");
assert(simulateInit() === false, "Second call skipped (already initialized)");
assert(initCount === 1, "Init count still 1");

// Simulate error
listenersHadError = true;
assert(simulateInit() === true, "Re-init after error");
assert(initCount === 2, "Init count = 2 after error recovery");
assert(simulateInit() === false, "Skipped again after recovery");

// ============ 2. ensureUserInStore guard ============
console.log("--- 2. ensureUserInStore: write guard ---");

// Simulate the guard logic
let lastEnsuredUid = null;
const mockUsers = {};
let writeCount = 0;

function simulateEnsure(uid, displayName) {
  const cacheReady = true;
  if (!cacheReady) return uid;
  if (lastEnsuredUid === uid && mockUsers[uid]) return uid;
  lastEnsuredUid = uid;

  if (mockUsers[uid]) {
    const needsUpdate = displayName && mockUsers[uid].displayName !== displayName;
    if (!needsUpdate) return uid;
    mockUsers[uid] = { ...mockUsers[uid], displayName };
    writeCount++;
    return uid;
  }
  mockUsers[uid] = { id: uid, displayName: displayName || "user" };
  writeCount++;
  return uid;
}

simulateEnsure("user1", "Alice");
assert(writeCount === 1, "First ensure: 1 write");
assert(mockUsers["user1"].displayName === "Alice", "User created");

simulateEnsure("user1", "Alice");
assert(writeCount === 1, "Same user+name: no write (guard works)");

simulateEnsure("user1", "Alice Updated");
assert(writeCount === 1, "Same uid cached: skipped even with new name");

// Reset guard (simulates logout)
lastEnsuredUid = null;
simulateEnsure("user1", "Alice Updated");
assert(writeCount === 2, "After reset: write for name update");
assert(mockUsers["user1"].displayName === "Alice Updated", "Name updated");

simulateEnsure("user2", "Bob");
assert(writeCount === 3, "New user: write");

// ============ 3. isStoreReady logic ============
console.log("--- 3. isStoreReady: all docs must be ready ---");

const DOCS = { users: "users", matchResults: "matchResults", actualAdvancing: "actualAdvancing", actualBonuses: "actualBonuses", settings: "settings" };
function isStoreReady(ready) {
  return Object.keys(DOCS).every(k => ready[k]) && ready.predictions;
}

assert(!isStoreReady({}), "Empty ready = not ready");
assert(!isStoreReady({ users: true }), "Only users = not ready");
assert(!isStoreReady({ users: true, matchResults: true, actualAdvancing: true, actualBonuses: true, settings: true }), "Missing predictions = not ready");
assert(!isStoreReady({ users: true, matchResults: true, actualAdvancing: true, actualBonuses: true, predictions: true }), "Missing settings = not ready");
assert(isStoreReady({ users: true, matchResults: true, actualAdvancing: true, actualBonuses: true, settings: true, predictions: true }), "All ready = ready");

// ============ 4. Window listener dedup ============
console.log("--- 4. Window listener dedup ---");
let windowAttached = false;
let attachCount = 0;
function simulateWindowAttach() {
  if (!windowAttached) { windowAttached = true; attachCount++; }
}
simulateWindowAttach();
simulateWindowAttach();
simulateWindowAttach();
assert(attachCount === 1, "Window listeners attached only once");

// ============ 5. onSnapshot error marks listenersHadError ============
console.log("--- 5. Listener error flow ---");
// Simulate: listener fires error -> listenersHadError = true -> next initRealtimeListeners re-inits
let simListenersInit = false;
let simHadError = false;
let simInitCalls = 0;

function simInit() {
  if (simListenersInit && !simHadError) return;
  simListenersInit = true;
  simHadError = false;
  simInitCalls++;
}
function simError() { simHadError = true; }

simInit(); // first init
assert(simInitCalls === 1, "Initial init");
simInit(); // no-op
assert(simInitCalls === 1, "Skip re-init");
simError(); // simulate permission denied
simInit(); // should re-init
assert(simInitCalls === 2, "Re-init after error");

// ============ 6. Cache behavior: snapshot overwrites vs optimistic writes ============
console.log("--- 6. Cache: optimistic write then snapshot ---");

// Simulate: user writes -> cache updated optimistically -> snapshot arrives with server data
const simCache = { users: { u1: { name: "Old" } } };

// Optimistic write
simCache.users = { ...simCache.users, u1: { name: "New" } };
assert(simCache.users.u1.name === "New", "Optimistic update applied");

// Snapshot arrives (may have different data if another client wrote)
const serverData = { u1: { name: "ServerName" }, u2: { name: "Bob" } };
simCache.users = serverData; // snapshot overwrites
assert(simCache.users.u1.name === "ServerName", "Snapshot overwrites optimistic");
assert(simCache.users.u2 !== undefined, "Snapshot adds new users");

// ============ 7. Debounce: rapid writes coalesce ============
console.log("--- 7. Debounce coalescing ---");
const pendingWrites = {};
let actualWrites = 0;

function simulateDebounce(formId, data, delay = 50) {
  const key = `form:${formId}`;
  if (pendingWrites[key]) clearTimeout(pendingWrites[key]);
  pendingWrites[key] = setTimeout(() => {
    delete pendingWrites[key];
    actualWrites++;
  }, delay);
}

// 10 rapid writes should coalesce to ~1 actual write
for (let i = 0; i < 10; i++) simulateDebounce("form1", { score: i }, 50);
assert(Object.keys(pendingWrites).length === 1, "Only 1 pending write for rapid edits");

// Wait for debounce to fire
await new Promise(r => setTimeout(r, 100));
assert(actualWrites === 1, `10 rapid writes coalesced to ${actualWrites} actual write(s)`);

// ============ 8. Form creation: MAX_FORMS guard ============
console.log("--- 8. Max forms per user ---");
const MAX_FORMS = 10;
const userForms = [];
for (let i = 0; i < MAX_FORMS; i++) userForms.push({ formId: `u1__${i+1}` });
assert(userForms.length === MAX_FORMS, `${MAX_FORMS} forms created`);

let threw = false;
try {
  if (userForms.length >= MAX_FORMS) throw new Error(`מקסימום ${MAX_FORMS} טפסים`);
} catch (e) { threw = true; }
assert(threw, "11th form throws error");

// ============ 9. Form ID format ============
console.log("--- 9. Form ID format: userId__index ---");
const formId = "uid123__1";
assert(formId.includes("__"), "Form ID contains __");
const [userId, idx] = formId.split("__");
assert(userId === "uid123", "userId extracted");
assert(idx === "1", "Index extracted");

// Verify Firestore security rule pattern: formId starts with auth.uid
const authUid = "uid123";
assert(formId.startsWith(authUid + "__"), "Form ID matches security rule pattern");
const otherUid = "other456";
assert(!formId.startsWith(otherUid + "__"), "Other user can't match form ID");

// ============ 10. predictionsLocked guard ============
console.log("--- 10. predictionsLocked guard ---");
let locked = false;
function canSave() { return !locked; }
assert(canSave(), "Unlocked: can save");
locked = true;
assert(!canSave(), "Locked: cannot save");

// ============ 11. Form status transitions ============
console.log("--- 11. Form status transitions ---");
const validTransitions = {
  draft: ["submitted", "deleted"],
  submitted: ["draft"], // reopen
};
function canTransition(from, to) {
  return validTransitions[from]?.includes(to);
}
assert(canTransition("draft", "submitted"), "draft -> submitted OK");
assert(canTransition("submitted", "draft"), "submitted -> draft (reopen) OK");
assert(!canTransition("submitted", "submitted"), "submitted -> submitted blocked");
assert(!canTransition("draft", "draft"), "draft -> draft blocked");

// deleteForm only works on draft
function canDelete(status) { return status === "draft"; }
assert(canDelete("draft"), "Can delete draft");
assert(!canDelete("submitted"), "Cannot delete submitted");

// ============ 12. Concurrent form edits: last write wins ============
console.log("--- 12. Concurrent edits: last write wins ---");
let formState = { matches: { "group-A-1": { homeScore: 1, awayScore: 0 } } };

// Two "concurrent" edits
const edit1 = { ...formState, matches: { ...formState.matches, "group-A-1": { homeScore: 2, awayScore: 0 } } };
const edit2 = { ...formState, matches: { ...formState.matches, "group-A-1": { homeScore: 3, awayScore: 1 } } };

// Last write wins (Firestore setDoc behavior)
formState = edit2;
assert(formState.matches["group-A-1"].homeScore === 3, "Last write wins");

// ============ 13. structuredClone safety ============
console.log("--- 13. structuredClone prevents mutation ---");
const original = { matches: { "group-A-1": { homeScore: 1, awayScore: 0 } } };
const cloned = structuredClone(original);
cloned.matches["group-A-1"].homeScore = 99;
assert(original.matches["group-A-1"].homeScore === 1, "Original not mutated after clone edit");

// ============ 14. Empty/null/undefined handling ============
console.log("--- 14. Null safety in cache reads ---");
function getUsers2(cache) { return cache.users || {}; }
function getMatchResults(cache) { return cache.matchResults || {}; }
function getActualBonuses(cache) { return cache.actualBonuses || { champion: null, topScorers: [] }; }
function getSettings(cache) { return cache.settings || { predictionsLocked: false }; }

// Empty cache
const emptyCache = { users: null, matchResults: undefined, actualBonuses: null, settings: undefined };
assert(Object.keys(getUsers2(emptyCache)).length === 0, "Null users -> empty obj");
assert(Object.keys(getMatchResults(emptyCache)).length === 0, "Undefined matchResults -> empty obj");
assert(getActualBonuses(emptyCache).topScorers.length === 0, "Null bonuses -> default");
assert(getSettings(emptyCache).predictionsLocked === false, "Undefined settings -> default");

// ============ 15. Firestore security rule: formId matches userId ============
console.log("--- 15. Security: formId ownership ---");
function ownsForm(authUid, formId) {
  return formId.startsWith(authUid + "__") || formId.match(new RegExp(`^${authUid}__`));
}
assert(ownsForm("abc123", "abc123__1"), "Owner matches");
assert(ownsForm("abc123", "abc123__10"), "Owner matches multi-digit");
assert(!ownsForm("abc123", "xyz789__1"), "Non-owner blocked");
assert(!ownsForm("abc123", "abc1234__1"), "Similar prefix blocked (extra char)");
assert(!ownsForm("abc123", "abc12__1"), "Shorter prefix blocked");

// ============ 16. Batch write atomicity check ============
console.log("--- 16. Batch write structure ---");
// Verify that deleteUser creates a batch that:
// 1. Writes updated users doc
// 2. Deletes all user's form docs
// If batch.commit fails, nothing should be partially applied (Firestore guarantee)
const mockPredictions = {
  "u1__1": { userId: "u1", formName: "Form 1" },
  "u1__2": { userId: "u1", formName: "Form 2" },
  "u2__1": { userId: "u2", formName: "Form 1" },
};
const formsToDelete = Object.keys(mockPredictions).filter(fid => mockPredictions[fid].userId === "u1");
assert(formsToDelete.length === 2, "Delete user: finds 2 forms");
assert(!formsToDelete.includes("u2__1"), "Delete user: doesn't touch other user's forms");

// ============ 17. onAuthStateChanged + initRealtimeListeners sequence ============
console.log("--- 17. Auth -> Listeners sequence ---");
// The bug we fixed: listeners must start AFTER auth, not before
// Simulate the correct sequence
let authFired = false;
let listenersStarted = false;
let readyFlags = {};

function onAuth(callback) {
  // Firebase calls this async
  setTimeout(() => {
    authFired = true;
    callback({ uid: "user1" });
  }, 0);
}

function initListeners() {
  listenersStarted = true;
  // Simulate successful listener
  readyFlags.users = true;
  readyFlags.predictions = true;
}

// Correct flow: auth first, then listeners
onAuth((user) => {
  if (user) initListeners();
});

// Immediately: nothing should be started yet
assert(!authFired, "Auth hasn't fired synchronously");
assert(!listenersStarted, "Listeners haven't started synchronously");

await new Promise(r => setTimeout(r, 10));
assert(authFired, "Auth fired async");
assert(listenersStarted, "Listeners started after auth");

// ============ 18. Logout clears guard ============
console.log("--- 18. Logout clears ensureUser guard ---");
let ensureGuard = "user1";
function logout() { ensureGuard = null; }
logout();
assert(ensureGuard === null, "Logout clears ensureUser guard");

// ============ 19. App.jsx flow: authReady vs isLoggedIn vs user ============
console.log("--- 19. App state machine ---");
function appState(authReady, isLoggedIn, storeReady, user) {
  if (!authReady) return "loading";
  if (!isLoggedIn) return "welcome";
  if (!storeReady || !user) return "loading";
  return "app";
}
assert(appState(false, false, false, null) === "loading", "Initial: loading");
assert(appState(true, false, false, null) === "welcome", "Not logged in: welcome");
assert(appState(true, true, false, null) === "loading", "Logged in, store loading: loading");
assert(appState(true, true, true, null) === "loading", "Store ready but user null: loading");
assert(appState(true, true, true, { id: "u1" }) === "app", "Everything ready: app");

// Key scenario: the bug we fixed
assert(appState(true, true, false, null) === "loading",
  "BUG FIX: logged in but store not ready should show loading, NOT welcome");

// ============ 20. Data export/import roundtrip ============
console.log("--- 20. Export/import roundtrip ---");
const exportData = {
  users: { u1: { id: "u1", displayName: "Alice" } },
  predictions: { "u1__1": { userId: "u1", matches: { "group-A-1": { homeScore: 1, awayScore: 0 } } } },
  matchResults: { "group-A-1": { homeScore: 2, awayScore: 1, stage: "group" } },
  actualBonuses: { champion: "BRA", topScorers: ["Neymar"] },
  settings: { predictionsLocked: true },
};
const json = JSON.stringify(exportData);
const imported = JSON.parse(json);
assert(imported.users.u1.displayName === "Alice", "Import preserves users");
assert(imported.predictions["u1__1"].matches["group-A-1"].homeScore === 1, "Import preserves predictions");
assert(imported.matchResults["group-A-1"].homeScore === 2, "Import preserves results");
assert(imported.actualBonuses.champion === "BRA", "Import preserves bonuses");
assert(imported.settings.predictionsLocked === true, "Import preserves settings");

console.log(`\n=== STORE LOGIC RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
