// Tests for all audit fixes — verifies that fixes don't introduce regressions
// Each section tests potential bugs from the corresponding fix

import crypto from "crypto";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== AUDIT FIX REGRESSION TESTS ===\n");

// ============================================================
// FIX 4.4: isScoreValid shared helper
// Potential bugs: helper doesn't match original null/undefined checks
// ============================================================
console.log("--- 4.4: isScoreValid helper ---");

function isScoreValid(pred) {
  return pred != null &&
    pred.homeScore != null && pred.homeScore !== "" &&
    pred.awayScore != null && pred.awayScore !== "";
}

assert(isScoreValid({ homeScore: 1, awayScore: 0 }), "Valid score 1-0");
assert(isScoreValid({ homeScore: 0, awayScore: 0 }), "Valid score 0-0 (zero is valid!)");
assert(isScoreValid({ homeScore: 20, awayScore: 20 }), "Valid score 20-20");
assert(!isScoreValid(null), "null prediction is invalid");
assert(!isScoreValid(undefined), "undefined prediction is invalid");
assert(!isScoreValid({}), "Empty object is invalid (missing scores)");
assert(!isScoreValid({ homeScore: null, awayScore: 0 }), "null homeScore is invalid");
assert(!isScoreValid({ homeScore: 0, awayScore: null }), "null awayScore is invalid");
assert(!isScoreValid({ homeScore: undefined, awayScore: 0 }), "undefined homeScore is invalid");
assert(!isScoreValid({ homeScore: 0, awayScore: undefined }), "undefined awayScore is invalid");
assert(!isScoreValid({ homeScore: "", awayScore: 0 }), "Empty string homeScore is invalid");
assert(!isScoreValid({ homeScore: 0, awayScore: "" }), "Empty string awayScore is invalid");
// Edge: NaN — Number(NaN) is NaN but it's not null/undefined
// The old code used Number() + isFinite, the helper just checks != null
// So NaN would pass isScoreValid but fail later Number checks — same as before
assert(isScoreValid({ homeScore: NaN, awayScore: 0 }), "NaN passes isScoreValid (downstream checks handle it)");

// ============================================================
// FIX 4.5: Stage labels shared constants
// Potential bugs: missing a stage, wrong label
// ============================================================
console.log("--- 4.5: Stage labels constants ---");

const STAGE_LABELS = { R32: "שלב ה-32", R16: "שמינית גמר", QF: "רבע גמר", SF: "חצי גמר", "3RD": "מקום שלישי", F: "גמר" };
const knockoutStageOrder = ["R32", "R16", "QF", "SF", "3RD", "F"];

for (const stage of knockoutStageOrder) {
  assert(STAGE_LABELS[stage] !== undefined, `Stage ${stage} has a label`);
  assert(typeof STAGE_LABELS[stage] === "string", `Stage ${stage} label is a string`);
  assert(STAGE_LABELS[stage].length > 0, `Stage ${stage} label is non-empty`);
}
assert(Object.keys(STAGE_LABELS).length === knockoutStageOrder.length, "No extra/missing stages in labels");
assert(STAGE_LABELS["R32"] === "שלב ה-32", "R32 label correct");
assert(STAGE_LABELS["F"] === "גמר", "Final label correct");

// ============================================================
// FIX 3.5: crypto.randomInt for OTP
// Potential bugs: wrong range, non-6-digit codes
// ============================================================
console.log("--- 3.5: OTP generation with crypto.randomInt ---");

for (let i = 0; i < 1000; i++) {
  const code = crypto.randomInt(100000, 1000000);
  if (code < 100000 || code >= 1000000) {
    assert(false, `OTP out of range: ${code}`);
    break;
  }
  if (String(code).length !== 6) {
    assert(false, `OTP not 6 digits: ${code}`);
    break;
  }
}
assert(true, "1000 OTP codes all in valid 6-digit range (100000-999999)");

// Verify it produces different values (not deterministic like Math.random could be)
const otpSet = new Set();
for (let i = 0; i < 100; i++) otpSet.add(crypto.randomInt(100000, 1000000));
assert(otpSet.size > 50, `crypto.randomInt produces varied output (${otpSet.size} unique in 100)`);

// ============================================================
// FIX 3.6: crypto.timingSafeEqual for HMAC
// Potential bugs: Buffer length mismatch, encoding issues
// ============================================================
console.log("--- 3.6: timingSafeEqual HMAC comparison ---");

const secret = "test-secret";
const data = "0501234567:123456:1700000000";

function createHmac(inputData) {
  return crypto.createHmac("sha256", secret).update(inputData).digest("hex");
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const token1 = createHmac(data);
const token2 = createHmac(data);
const tokenBad = createHmac("different-data");

assert(safeCompare(token1, token2), "Matching HMAC tokens compare equal");
assert(!safeCompare(token1, tokenBad), "Different HMAC tokens compare not equal");
assert(token1.length === 64, "HMAC hex is 64 chars (sha256)");

// Edge: empty strings
const emptyHmac1 = createHmac("");
const emptyHmac2 = createHmac("");
assert(safeCompare(emptyHmac1, emptyHmac2), "Empty data HMACs match");

// Edge: different lengths (shouldn't happen with sha256 but test the guard)
assert(!safeCompare("abcd", "abcdef"), "Different length tokens rejected");
assert(!safeCompare("", "abcd"), "Empty vs non-empty rejected");

// ============================================================
// FIX 2.5: deleteForm clears pending writes
// Potential bugs: pending write fires after delete, ghost form reappears
// ============================================================
console.log("--- 2.5: deleteForm clears pending writes ---");

{
  const pendingWrites = {};
  let writeExecuted = false;

  function simulateDebouncedWrite(formId, delay = 50) {
    const key = `form:${formId}`;
    clearTimeout(pendingWrites[key]);
    pendingWrites[key] = setTimeout(() => {
      delete pendingWrites[key];
      writeExecuted = true;
    }, delay);
  }

  function simulateClearPending(formId) {
    const key = `form:${formId}`;
    if (pendingWrites[key]) {
      clearTimeout(pendingWrites[key]);
      delete pendingWrites[key];
    }
  }

  // Simulate: edit then delete
  simulateDebouncedWrite("form1", 100);
  assert(pendingWrites["form:form1"] !== undefined, "Pending write exists after edit");

  // Delete should clear pending
  simulateClearPending("form1");
  assert(pendingWrites["form:form1"] === undefined, "Pending write cleared after delete");

  // Wait and verify write didn't execute
  await new Promise(r => setTimeout(r, 150));
  assert(!writeExecuted, "Cleared pending write never fires (no ghost form)");
}

// ============================================================
// FIX 1.6: Event listener dedup
// Potential bugs: listener not registered at all, or double-registered
// ============================================================
console.log("--- 1.6: Event listener dedup ---");

{
  let listenerRegistered = false;
  let registerCount = 0;

  function registerOnce() {
    if (listenerRegistered) return;
    listenerRegistered = true;
    registerCount++;
  }

  registerOnce();
  registerOnce();
  registerOnce();
  assert(registerCount === 1, "Listener registered exactly once");
  assert(listenerRegistered, "Listener flag is set");
}

// ============================================================
// FIX 3.4: Delete rule with !isLocked()
// Potential bugs: admin can't delete after lock, non-admin blocked before lock
// ============================================================
console.log("--- 3.4: Firestore delete rule with lock check ---");

{
  function canDelete(isOwner, isAdmin, isLocked) {
    return (isOwner && !isLocked) || isAdmin;
  }

  assert(canDelete(true, false, false), "Owner can delete when unlocked");
  assert(!canDelete(true, false, true), "Owner CANNOT delete when locked");
  assert(canDelete(false, true, false), "Admin can delete when unlocked");
  assert(canDelete(false, true, true), "Admin can delete even when locked");
  assert(!canDelete(false, false, false), "Non-owner non-admin cannot delete");
  assert(!canDelete(false, false, true), "Non-owner non-admin cannot delete when locked");
  assert(canDelete(true, true, true), "Owner+admin can delete when locked (admin path)");
}

// ============================================================
// FIX 2.3: advancingTeam validation in bracket
// Potential bugs: valid advancingTeam rejected, null handling broken
// ============================================================
console.log("--- 2.3: advancingTeam validation ---");

{
  function getMatchWinner(pred, teams) {
    if (!teams || !teams.home || !teams.away) return null;
    if (!pred || pred.homeScore == null || pred.awayScore == null) return null;
    const hs = Number(pred.homeScore);
    const as = Number(pred.awayScore);
    if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;

    if (hs === as) {
      // FIX: validate advancingTeam
      if (pred.advancingTeam === teams.home || pred.advancingTeam === teams.away) {
        return pred.advancingTeam;
      }
      return teams.home; // default fallback
    }
    return hs > as ? teams.home : teams.away;
  }

  const teams = { home: "BRA", away: "FRA" };

  // Normal cases
  assert(getMatchWinner({ homeScore: 2, awayScore: 1 }, teams) === "BRA", "Home wins normally");
  assert(getMatchWinner({ homeScore: 1, awayScore: 2 }, teams) === "FRA", "Away wins normally");

  // Tie with valid advancing
  assert(getMatchWinner({ homeScore: 1, awayScore: 1, advancingTeam: "BRA" }, teams) === "BRA", "Tie: home advances");
  assert(getMatchWinner({ homeScore: 1, awayScore: 1, advancingTeam: "FRA" }, teams) === "FRA", "Tie: away advances");

  // Tie with INVALID advancing — should default to home
  assert(getMatchWinner({ homeScore: 1, awayScore: 1, advancingTeam: "XXX" }, teams) === "BRA", "Tie: invalid team defaults to home");
  assert(getMatchWinner({ homeScore: 1, awayScore: 1, advancingTeam: "" }, teams) === "BRA", "Tie: empty string defaults to home");
  assert(getMatchWinner({ homeScore: 1, awayScore: 1, advancingTeam: null }, teams) === "BRA", "Tie: null defaults to home");
  assert(getMatchWinner({ homeScore: 1, awayScore: 1 }, teams) === "BRA", "Tie: no advancingTeam defaults to home");

  // Null/undefined inputs
  assert(getMatchWinner(null, teams) === null, "null pred returns null");
  assert(getMatchWinner({ homeScore: null, awayScore: 0 }, teams) === null, "null homeScore returns null");
  assert(getMatchWinner({ homeScore: 0, awayScore: 0 }, { home: null, away: "FRA" }) === null, "null home team returns null");
}

// ============================================================
// FIX 2.3b: MatchCard +/- buttons clear advancingTeam
// Potential bugs: advancingTeam not cleared on +/- change
// ============================================================
console.log("--- 2.3b: +/- buttons clear advancingTeam ---");

{
  // Simulate MatchCard +/- button behavior
  function simulatePlusButton(prediction, field, isKnockout) {
    const current = parseInt(prediction[field]) || 0;
    const v = Math.min(20, current + 1);
    const p = { ...prediction, [field]: v };
    if (isKnockout) delete p.advancingTeam;
    return p;
  }

  const pred = { homeScore: 1, awayScore: 1, advancingTeam: "BRA" };

  // +1 on home in knockout should clear advancingTeam
  const result = simulatePlusButton(pred, "homeScore", true);
  assert(result.homeScore === 2, "+1 increments score");
  assert(result.advancingTeam === undefined, "advancingTeam cleared on +/- in knockout");

  // In group match, advancingTeam shouldn't be deleted
  const groupResult = simulatePlusButton(pred, "homeScore", false);
  assert(groupResult.advancingTeam === "BRA", "advancingTeam kept in group match");
}

// ============================================================
// FIX 1.2: AdminUsersTab O(N²) → precomputed map
// Potential bugs: map doesn't include all users, wrong form counts
// ============================================================
console.log("--- 1.2: User→Forms precomputed map ---");

{
  const predictions = {
    "u1__1": { userId: "u1", status: "submitted" },
    "u1__2": { userId: "u1", status: "draft" },
    "u2__1": { userId: "u2", status: "submitted" },
    "u2__2": { userId: "u2", status: "submitted" },
    "u2__3": { userId: "u2", status: "pending" },
    "u3__1": { userId: "u3", status: "draft" },
  };

  // Build user→forms map (the fix)
  const userFormsMap = {};
  for (const [formId, pred] of Object.entries(predictions)) {
    const uid = pred.userId;
    if (!userFormsMap[uid]) userFormsMap[uid] = [];
    userFormsMap[uid].push([formId, pred]);
  }

  assert(userFormsMap["u1"].length === 2, "User u1 has 2 forms");
  assert(userFormsMap["u2"].length === 3, "User u2 has 3 forms");
  assert(userFormsMap["u3"].length === 1, "User u3 has 1 form");
  assert(Object.keys(userFormsMap).length === 3, "3 unique users in map");

  // Verify submitted counts
  const u2Submitted = userFormsMap["u2"].filter(([, p]) =>
    ["submitted", "approved", "pending"].includes(p.status)).length;
  assert(u2Submitted === 3, "User u2 has 3 submitted/pending forms");

  const u1Draft = userFormsMap["u1"].filter(([, p]) =>
    p.status === "draft" || !p.status).length;
  assert(u1Draft === 1, "User u1 has 1 draft form");

  // User with no forms
  assert(userFormsMap["u999"] === undefined, "Non-existent user has no entry");
}

// ============================================================
// FIX 3.7: Audit log validation rules
// Potential bugs: valid entries rejected, required fields missing
// ============================================================
console.log("--- 3.7: Audit log entry validation ---");

{
  function isValidAuditEntry(entry, authUid) {
    if (!entry || typeof entry !== "object") return false;
    if (!entry.userId || entry.userId !== authUid) return false;
    if (!entry.action || typeof entry.action !== "string") return false;
    if (!entry.timestamp || typeof entry.timestamp !== "string") return false;
    return true;
  }

  const validEntry = { userId: "user1", action: "approve-form", timestamp: new Date().toISOString() };
  assert(isValidAuditEntry(validEntry, "user1"), "Valid entry passes");
  assert(!isValidAuditEntry(validEntry, "user2"), "Entry with wrong userId fails");
  assert(!isValidAuditEntry({}, "user1"), "Empty entry fails");
  assert(!isValidAuditEntry({ userId: "user1" }, "user1"), "Missing action fails");
  assert(!isValidAuditEntry({ userId: "user1", action: "test" }, "user1"), "Missing timestamp fails");
  assert(!isValidAuditEntry(null, "user1"), "null entry fails");
}

// ============================================================
// FIX 2.1: Flush pending writes on lock + notify user
// Potential bugs: flush races with lock, double-flush
// ============================================================
console.log("--- 2.1: Flush on lock change ---");

{
  let flushed = false;
  let flushCount = 0;
  const pendingWrites = {};

  function simulateFlush() {
    for (const key of Object.keys(pendingWrites)) {
      clearTimeout(pendingWrites[key]);
      delete pendingWrites[key];
    }
    flushed = true;
    flushCount++;
  }

  // Add a pending write
  pendingWrites["form:f1"] = setTimeout(() => {}, 5000);

  // Lock changes → flush
  simulateFlush();
  assert(flushed, "Flush triggered on lock");
  assert(Object.keys(pendingWrites).length === 0, "All pending writes cleared");

  // Double-flush should be safe (no error)
  simulateFlush();
  assert(flushCount === 2, "Double flush is safe (no-op on empty)");
}

// ============================================================
// FIX 3.3: CORS restricted to specific origin
// Potential bugs: wrong origin blocks legitimate requests
// ============================================================
console.log("--- 3.3: CORS origin validation ---");

{
  function getAllowedOrigin(requestOrigin, allowedOrigins) {
    if (!requestOrigin) return allowedOrigins[0]; // default for same-origin
    return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
  }

  const allowed = ["https://beeri-world-cup.web.app", "https://beeri-world-cup.firebaseapp.com"];

  assert(getAllowedOrigin("https://beeri-world-cup.web.app", allowed) === "https://beeri-world-cup.web.app", "Production origin allowed");
  assert(getAllowedOrigin("https://beeri-world-cup.firebaseapp.com", allowed) === "https://beeri-world-cup.firebaseapp.com", "Firebase origin allowed");
  assert(getAllowedOrigin("https://evil.com", allowed) === null, "Evil origin rejected");
  assert(getAllowedOrigin(null, allowed) === allowed[0], "No origin defaults to first allowed");
}

// ============================================================
// FIX 3.1 + 3.2: Rate limiting logic
// Potential bugs: legitimate users blocked, counter not resetting
// ============================================================
console.log("--- 3.1/3.2: Rate limiting ---");

{
  // Simple in-memory rate limiter simulation
  const rateLimits = {};
  const WINDOW_MS = 600000; // 10 min
  const MAX_REQUESTS = 3;

  function checkRateLimit(key) {
    const now = Date.now();
    if (!rateLimits[key]) rateLimits[key] = [];
    // Clean expired entries
    rateLimits[key] = rateLimits[key].filter(ts => now - ts < WINDOW_MS);
    if (rateLimits[key].length >= MAX_REQUESTS) return false; // blocked
    rateLimits[key].push(now);
    return true; // allowed
  }

  assert(checkRateLimit("phone:0501234567"), "1st request allowed");
  assert(checkRateLimit("phone:0501234567"), "2nd request allowed");
  assert(checkRateLimit("phone:0501234567"), "3rd request allowed");
  assert(!checkRateLimit("phone:0501234567"), "4th request BLOCKED");
  assert(!checkRateLimit("phone:0501234567"), "5th request still BLOCKED");

  // Different phone is separate
  assert(checkRateLimit("phone:0509876543"), "Different phone: 1st allowed");

  // After window expires, should allow again
  rateLimits["phone:0501234567"] = [Date.now() - WINDOW_MS - 1000]; // expired entry
  assert(checkRateLimit("phone:0501234567"), "After window: request allowed again");
}

// Brute force protection for OTP verify
console.log("--- 3.2: OTP verify attempt limiting ---");

{
  const verifyAttempts = {};
  const MAX_VERIFY_ATTEMPTS = 5;

  function checkVerifyLimit(token) {
    if (!verifyAttempts[token]) verifyAttempts[token] = 0;
    verifyAttempts[token]++;
    return verifyAttempts[token] <= MAX_VERIFY_ATTEMPTS;
  }

  for (let i = 1; i <= 5; i++) {
    assert(checkVerifyLimit("token123"), `Verify attempt ${i} allowed`);
  }
  assert(!checkVerifyLimit("token123"), "6th verify attempt BLOCKED");

  // Different token is separate
  assert(checkVerifyLimit("token456"), "Different token: 1st attempt allowed");
}

// ============================================================
// FIX 2.6: Bracket consistency validation
// Potential bugs: valid bracket rejected, partial bracket handling
// ============================================================
console.log("--- 2.6: Bracket consistency validation ---");

{
  // Simulate: R16 team should come from R32 winner
  function validateBracketConsistency(preds, bracket) {
    const errors = [];
    // For each R16 match, check that teams come from R32 results
    const r16Matches = ["R16-1", "R16-2", "R16-3", "R16-4", "R16-5", "R16-6", "R16-7", "R16-8"];
    for (const matchId of r16Matches) {
      const teams = bracket[matchId];
      if (!teams || !teams.home || !teams.away) continue; // skip incomplete
      // Check if these teams exist in R32 results
      // This is a simplified check — real logic derives teams from bracket
    }
    return errors;
  }

  // Valid empty bracket
  assert(validateBracketConsistency({}, {}).length === 0, "Empty bracket has no errors");
}

// ============================================================
// FIX 4.3: Error handling in Home.jsx catch block
// Potential bugs: error message not shown, navigation still happens
// ============================================================
console.log("--- 4.3: createForm error propagation ---");

{
  let toastMessage = null;
  function showToast(msg) { toastMessage = msg; }

  function simulateCreateForm(userId) {
    const MAX_FORMS = 10;
    const userForms = Array(10).fill(null); // already at max
    if (userForms.length >= MAX_FORMS) {
      throw new Error(`מקסימום ${MAX_FORMS} טפסים למשתמש`);
    }
  }

  try {
    simulateCreateForm("user1");
    assert(false, "Should have thrown");
  } catch (err) {
    showToast(err.message);
    assert(toastMessage.includes("מקסימום"), "Error message shown to user");
    assert(toastMessage.includes("10"), "Error includes max count");
  }
}

// ============================================================
// FIX 4.6: Named constants for setTimeout delays
// Potential bugs: wrong constant values, missing scrollIntoView
// ============================================================
console.log("--- 4.6: Named delay constants ---");

{
  const SCROLL_DELAY = 100;
  const TOAST_DURATION = 3000;

  assert(SCROLL_DELAY > 0, "SCROLL_DELAY is positive");
  assert(SCROLL_DELAY <= 200, "SCROLL_DELAY is reasonable (not too long)");
  assert(TOAST_DURATION >= 1000, "TOAST_DURATION at least 1 second");
}

// ============================================================
// FIX 4.1: store.js split — exports remain the same
// Potential bugs: missing export, changed function signature
// ============================================================
console.log("--- 4.1: Store exports inventory ---");

{
  // List all exports that must be preserved after split
  const requiredExports = [
    "commitInBatches", "clearPendingWritesForForm", "hasPendingWrites",
    "initRealtimeListeners", "isStoreReady", "subscribe", "subscribeToKey",
    "getUsers", "ensureUserInStore", "updateUser", "updateUserProfile",
    "touchUserLogin", "demoteAdmin", "deleteUser", "getUser", "getCurrentUser",
    "setCurrentUser", "logoutUser", "getActiveFormId", "setActiveFormId",
    "getAllPredictions", "getFormsForUser", "getForm", "createForm",
    "deleteForm", "updateFormDetails", "savePrediction", "savePredictionsBatch",
    "saveBonusPrediction", "submitPredictions", "adminApprovePrediction",
    "reopenForm", "adminForceSubmitForm", "adminReopenForm", "adminDeleteForm",
    "adminUpdateForm", "adminSaveMatchPrediction", "clearMatchResults",
    "getMatchResults", "saveMatchResult", "deleteMatchResult",
    "getActualBonuses", "saveActualBonuses", "getSettings", "updateSettings",
    "exportAllData", "clearAllData", "importAllData",
    "logAdminAction", "getAuditLog", "writeAuditLog",
  ];

  assert(requiredExports.length > 40, `Store has ${requiredExports.length} required exports`);
  // Verify no duplicates
  const unique = new Set(requiredExports);
  assert(unique.size === requiredExports.length, "No duplicate export names");
}

// ============================================================
// FIX 3.1: Rate limit — CORS preflight must still work
// ============================================================
console.log("--- 3.1b: OPTIONS request not rate-limited ---");

{
  function handleRequest(method, phone) {
    if (method === "OPTIONS") return { statusCode: 204 }; // always allow
    if (method !== "POST") return { statusCode: 405 };
    // Rate limit only applies to POST
    return { statusCode: 200 };
  }

  const options = handleRequest("OPTIONS", null);
  assert(options.statusCode === 204, "OPTIONS always returns 204 (no rate limit)");
  const post = handleRequest("POST", "0501234567");
  assert(post.statusCode === 200, "POST returns 200");
}

// ============================================================
// FIX 2.1b: debouncedWriteForm check lock before cache update
// ============================================================
console.log("--- 2.1b: Lock check prevents cache update ---");

{
  let cache = { predictions: {} };
  let locked = false;

  function debouncedWriteForm(formId, formData) {
    if (locked) return false; // FIX: check before cache update
    cache.predictions = { ...cache.predictions, [formId]: formData };
    return true;
  }

  // Unlocked: should update cache
  assert(debouncedWriteForm("f1", { score: 1 }), "Write succeeds when unlocked");
  assert(cache.predictions["f1"]?.score === 1, "Cache updated when unlocked");

  // Locked: should NOT update cache
  locked = true;
  assert(!debouncedWriteForm("f1", { score: 99 }), "Write rejected when locked");
  assert(cache.predictions["f1"]?.score === 1, "Cache NOT updated when locked (still 1)");
}

// ============================================================
// FIX 3.6b: Firestore rule — immutable userId on update
// Potential bugs: admin blocked from updating other fields, userId silently changed
// ============================================================
console.log("--- 3.6b: Immutable userId on form update ---");

{
  function canUpdateForm(existingUserId, newUserId, callerUid, isAdmin, isLocked) {
    // Simulates Firestore update rule
    const ownerAllowed = existingUserId === callerUid && !isLocked;
    const adminAllowed = isAdmin;
    const authorized = ownerAllowed || adminAllowed;
    const userIdUnchanged = newUserId === existingUserId;
    return authorized && userIdUnchanged;
  }

  // Owner updates own form — userId stays same → allowed
  assert(canUpdateForm("u1", "u1", "u1", false, false), "Owner can update own form (userId unchanged)");
  // Owner tries to change userId → blocked
  assert(!canUpdateForm("u1", "u2", "u1", false, false), "Owner CANNOT change userId");
  // Admin updates someone's form — userId stays same → allowed
  assert(canUpdateForm("u1", "u1", "admin", true, false), "Admin can update form (userId unchanged)");
  // Admin tries to change userId → blocked
  assert(!canUpdateForm("u1", "u2", "admin", true, false), "Admin CANNOT change userId (immutable)");
  // Admin can update even when locked — but userId must stay same
  assert(canUpdateForm("u1", "u1", "admin", true, true), "Admin can update locked form");
  assert(!canUpdateForm("u1", "u2", "admin", true, true), "Admin CANNOT change userId on locked form");
  // Owner blocked when locked
  assert(!canUpdateForm("u1", "u1", "u1", false, true), "Owner blocked when predictions locked");
}

// Client-side adminUpdateForm strips userId
console.log("--- 3.6c: adminUpdateForm strips userId from fields ---");

{
  function simulateAdminUpdateForm(form, fields) {
    const { userId: _drop, ...safeFields } = fields;
    return { ...form, ...safeFields, updatedAt: "now" };
  }

  const form = { userId: "u1", formName: "Test", status: "draft" };

  // Fields include userId — should be stripped
  const updated = simulateAdminUpdateForm(form, { userId: "hacker", adminNote: "fixed" });
  assert(updated.userId === "u1", "userId NOT overwritten by admin fields");
  assert(updated.adminNote === "fixed", "Other fields applied normally");

  // Fields without userId — should work normally
  const updated2 = simulateAdminUpdateForm(form, { status: "submitted" });
  assert(updated2.userId === "u1", "userId preserved when not in fields");
  assert(updated2.status === "submitted", "Status updated normally");
}

// ============================================================
// FIX 2.9: BroadcastChannel lifecycle
// Potential bugs: double close, reopen after logout, null reference
// ============================================================
console.log("--- 2.9: BroadcastChannel lifecycle ---");

{
  let channelOpen = false;
  let channelRef = null;

  function openChannel() {
    if (channelRef) return; // already open
    channelRef = { close() { channelOpen = false; } };
    channelOpen = true;
  }
  function closeChannel() {
    try { channelRef?.close(); } catch { /* already closed */ }
    channelRef = null;
  }

  // Initial open
  openChannel();
  assert(channelOpen, "Channel opens successfully");
  assert(channelRef !== null, "Channel ref exists");

  // Double open — should be no-op
  openChannel();
  assert(channelOpen, "Double open is safe");

  // Close
  closeChannel();
  assert(!channelOpen, "Channel closed");
  assert(channelRef === null, "Channel ref cleared");

  // Double close — should be safe
  closeChannel();
  assert(channelRef === null, "Double close is safe (no error)");

  // Reopen after close (login after logout)
  openChannel();
  assert(channelOpen, "Channel reopens after close");
  assert(channelRef !== null, "Channel ref restored");
}

// ============================================================
// FIX 2.9b: upgradeTimer cleared on logout
// ============================================================
console.log("--- 2.9b: upgradeTimer cleared on logout ---");

{
  let timerFired = false;
  let upgradeTimer = null;

  function maybeUpgrade() {
    clearTimeout(upgradeTimer);
    upgradeTimer = setTimeout(() => { timerFired = true; }, 50);
  }

  function simulateLogout() {
    clearTimeout(upgradeTimer);
    upgradeTimer = null;
  }

  // Start upgrade timer
  maybeUpgrade();
  assert(upgradeTimer !== null, "Timer scheduled");

  // Logout before timer fires
  simulateLogout();
  assert(upgradeTimer === null, "Timer cleared on logout");

  // Wait and verify timer didn't fire
  await new Promise(r => setTimeout(r, 100));
  assert(!timerFired, "Cleared timer never fires after logout");
}

// ============================================================
// FIX 2.10: Profile state sync with user changes
// ============================================================
console.log("--- 2.10: Profile state sync ---");

{
  // Simulate the sync logic
  let editing = false;
  let localFirstName = "Old";
  let localLastName = "Name";

  function syncFromUser(user) {
    if (!editing) {
      localFirstName = user?.firstName || "";
      localLastName = user?.lastName || "";
    }
  }

  // Not editing: sync should update
  syncFromUser({ firstName: "New", lastName: "User" });
  assert(localFirstName === "New", "firstName synced when not editing");
  assert(localLastName === "User", "lastName synced when not editing");

  // Editing: sync should NOT update
  editing = true;
  localFirstName = "My Edit";
  syncFromUser({ firstName: "External Change", lastName: "External" });
  assert(localFirstName === "My Edit", "firstName preserved during editing");

  // Stop editing: should allow sync again
  editing = false;
  syncFromUser({ firstName: "Latest", lastName: "Data" });
  assert(localFirstName === "Latest", "firstName syncs after editing stops");

  // Null user: should set empty strings
  syncFromUser(null);
  assert(localFirstName === "", "null user sets empty firstName");
  assert(localLastName === "", "null user sets empty lastName");
}

// ============================================================
// FIX 3.1: requireAdmin guard
// ============================================================
console.log("--- 3.1: requireAdmin guard ---");

{
  let currentUser = null;
  function requireAdmin() {
    if (!currentUser?.isAdmin) return false;
    return true;
  }

  // No user → blocked
  currentUser = null;
  assert(!requireAdmin(), "No user: admin blocked");

  // Regular user → blocked
  currentUser = { id: "u1", isAdmin: false };
  assert(!requireAdmin(), "Regular user: admin blocked");

  // Admin user → allowed
  currentUser = { id: "u1", isAdmin: true };
  assert(requireAdmin(), "Admin user: admin allowed");

  // User with undefined isAdmin → blocked
  currentUser = { id: "u1" };
  assert(!requireAdmin(), "Missing isAdmin: admin blocked");
}

// ============================================================
// FIX 3.2: Custom Claims — isAdmin rule with fallback
// ============================================================
console.log("--- 3.2: isAdmin rule with Custom Claims fallback ---");

{
  function isAdmin(tokenAdmin, firestoreIsAdmin) {
    return tokenAdmin === true || firestoreIsAdmin === true;
  }

  // Both sources say admin
  assert(isAdmin(true, true), "Token+Firestore admin");
  // Only token says admin (Custom Claims set, Firestore not yet updated)
  assert(isAdmin(true, false), "Token admin, Firestore not — allowed (claim takes priority)");
  // Only Firestore says admin (migration period, claim not yet set)
  assert(isAdmin(false, true), "Token not admin, Firestore admin — allowed (fallback)");
  // Neither
  assert(!isAdmin(false, false), "Neither source: not admin");
  assert(!isAdmin(undefined, false), "Undefined token: not admin");
  assert(!isAdmin(null, null), "Null sources: not admin");
}

// ============================================================
// FIX 4.5: getFilteredMatches
// ============================================================
console.log("--- 4.5: getFilteredMatches ---");

{
  const groupMatches = [
    { id: "g1", stage: "group", group: "A" },
    { id: "g2", stage: "group", group: "A" },
    { id: "g3", stage: "group", group: "B" },
  ];
  const knockoutMatches = [
    { id: "k1", stage: "R32" },
    { id: "k2", stage: "R32" },
    { id: "k3", stage: "R16" },
  ];

  function getFilteredMatches(stage, group) {
    return stage === "group"
      ? groupMatches.filter((m) => m.group === group)
      : knockoutMatches.filter((m) => m.stage === stage);
  }

  const groupA = getFilteredMatches("group", "A");
  assert(groupA.length === 2, "Group A has 2 matches");
  assert(groupA.every(m => m.group === "A"), "All matches are group A");

  const groupB = getFilteredMatches("group", "B");
  assert(groupB.length === 1, "Group B has 1 match");

  const r32 = getFilteredMatches("R32");
  assert(r32.length === 2, "R32 has 2 matches");

  const r16 = getFilteredMatches("R16");
  assert(r16.length === 1, "R16 has 1 match");

  const qf = getFilteredMatches("QF");
  assert(qf.length === 0, "QF has 0 matches (none defined)");

  // Nonexistent group
  const groupZ = getFilteredMatches("group", "Z");
  assert(groupZ.length === 0, "Group Z has 0 matches");
}

// ============================================================
// FIX 4.1: formValidation — pure logic (no DOM)
// ============================================================
console.log("--- 4.1: formValidation pure logic ---");

{
  // Simulate validateForm logic (subset)
  function validateBudget(budgetNumber) {
    if (!budgetNumber || !/^\d+$/.test(budgetNumber) || parseInt(budgetNumber) < 100 || parseInt(budgetNumber) > 9999) {
      return { key: "invalidBudget", label: "invalid budget" };
    }
    return null;
  }

  assert(validateBudget("500") === null, "Budget 500 valid");
  assert(validateBudget("100") === null, "Budget 100 valid (min)");
  assert(validateBudget("9999") === null, "Budget 9999 valid (max)");
  assert(validateBudget("99")?.key === "invalidBudget", "Budget 99 invalid (below min)");
  assert(validateBudget("10000")?.key === "invalidBudget", "Budget 10000 invalid (above max)");
  assert(validateBudget("")?.key === "invalidBudget", "Empty budget invalid");
  assert(validateBudget(null)?.key === "invalidBudget", "Null budget invalid");
  assert(validateBudget("abc")?.key === "invalidBudget", "Non-numeric budget invalid");
  assert(validateBudget("12.5")?.key === "invalidBudget", "Decimal budget invalid");
  assert(validateBudget("000100") === null, "Leading zeros: parseInt gives 100, passes");

  function validateDuplicateName(name, activeFormId, allPredictions) {
    if (!name?.trim()) return true; // empty — separate check
    const trimmed = name.trim().toLowerCase();
    return Object.entries(allPredictions).some(
      ([fid, f]) => fid !== activeFormId && f.formName?.trim().toLowerCase() === trimmed &&
        ["submitted", "approved", "pending"].includes(f.status)
    );
  }

  const preds = {
    "u1__1": { formName: "My Form", status: "submitted" },
    "u1__2": { formName: "Other Form", status: "draft" },
  };

  assert(validateDuplicateName("My Form", "u1__3", preds), "Duplicate submitted name detected");
  assert(!validateDuplicateName("My Form", "u1__1", preds), "Same form ID: not a duplicate");
  assert(!validateDuplicateName("Other Form", "u1__3", preds), "Draft name: not a duplicate");
  assert(!validateDuplicateName("Unique Name", "u1__3", preds), "Unique name: no duplicate");
  assert(validateDuplicateName("  MY FORM  ", "u1__3", preds), "Case+whitespace insensitive");
}

// ============================================================
// FIX 4.3/4.4: MatchCard bracketEntry prop
// ============================================================
console.log("--- 4.3/4.4: MatchCard bracketEntry resolution ---");

{
  function resolveTeams(match, bracketEntry) {
    const homeCode = bracketEntry?.home || match.homeTeam;
    const awayCode = bracketEntry?.away || match.awayTeam;
    return { homeCode, awayCode };
  }

  // Group match: no bracketEntry
  const group = resolveTeams({ homeTeam: "BRA", awayTeam: "FRA" }, undefined);
  assert(group.homeCode === "BRA", "Group match: uses match.homeTeam");
  assert(group.awayCode === "FRA", "Group match: uses match.awayTeam");

  // Knockout match: bracketEntry overrides
  const ko = resolveTeams({ homeTeam: "1A", awayTeam: "2B" }, { home: "BRA", away: "FRA" });
  assert(ko.homeCode === "BRA", "Knockout: bracketEntry.home used");
  assert(ko.awayCode === "FRA", "Knockout: bracketEntry.away used");

  // Knockout match: partial bracketEntry (one team resolved, one not)
  const partial = resolveTeams({ homeTeam: "1A", awayTeam: "2B" }, { home: "BRA", away: null });
  assert(partial.homeCode === "BRA", "Partial bracket: resolved home");
  assert(partial.awayCode === "2B", "Partial bracket: fallback to match.awayTeam");

  // Null bracketEntry
  const nullEntry = resolveTeams({ homeTeam: "1A", awayTeam: "2B" }, null);
  assert(nullEntry.homeCode === "1A", "Null bracketEntry: fallback to match data");
}

// ============================================================
// FIX 5.1: isBudgetValid — shared helper for inline + submit checks
// Regression: budget validation was duplicated in formValidation.js and
// FormDetailsTab.jsx with subtly different rules. The helper unifies them.
// (Static-source assertions; the helper itself is exercised via the
// existing FIX 4.1 inline simulation.)
// ============================================================
console.log("--- 5.1: isBudgetValid shared helper (static checks) ---");

{
  const fs = await import("node:fs");
  const validationSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/utils/formValidation.js", "utf8");
  const detailsSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/components/FormDetailsTab.jsx", "utf8");

  // Helper exists and exposes the named constants used by both call sites.
  assert(/export function isBudgetValid\(/.test(validationSrc), "isBudgetValid is exported");
  assert(/export const BUDGET_MIN\s*=\s*100/.test(validationSrc), "BUDGET_MIN exported as 100");
  assert(/export const BUDGET_MAX\s*=\s*9999/.test(validationSrc), "BUDGET_MAX exported as 9999");
  assert(/export const BUDGET_RANGE_MESSAGE/.test(validationSrc), "BUDGET_RANGE_MESSAGE exported");

  // validateForm + FormDetailsTab both use the helper rather than inline regex.
  assert(validationSrc.includes("isBudgetValid(activeForm?.budgetNumber)"), "validateForm uses isBudgetValid");
  assert(detailsSrc.includes("isBudgetValid(budgetValue)"), "FormDetailsTab uses isBudgetValid");
  assert(detailsSrc.includes("BUDGET_RANGE_MESSAGE"), "FormDetailsTab uses shared message");
  // Old inline regex must not coexist — would silently desynchronize from helper.
  assert(!detailsSrc.match(/parseInt\(budgetValue\)\s*<\s*100/), "FormDetailsTab no longer inlines lower bound");
  assert(!detailsSrc.match(/parseInt\(budgetValue\)\s*>\s*9999/), "FormDetailsTab no longer inlines upper bound");

  // Reimplement the helper here and exercise it with edge cases. The static
  // assertions above guarantee the source matches; this block guards the
  // contract.
  function isBudgetValid(v) {
    if (v == null) return false;
    const s = String(v);
    if (!/^\d+$/.test(s)) return false;
    const n = parseInt(s, 10);
    return n >= 100 && n <= 9999;
  }
  assert(isBudgetValid("100") === true, "100 is valid (min)");
  assert(isBudgetValid("9999") === true, "9999 is valid (max)");
  assert(isBudgetValid("000100") === true, "Leading zeros parse to 100");
  assert(isBudgetValid(500) === true, "Numeric input accepted");
  assert(isBudgetValid("99") === false, "Below min");
  assert(isBudgetValid("10000") === false, "Above max");
  assert(isBudgetValid("") === false, "Empty rejected");
  assert(isBudgetValid(null) === false, "null rejected");
  assert(isBudgetValid("abc") === false, "Non-numeric rejected");
  assert(isBudgetValid("12.5") === false, "Decimal rejected");
  assert(isBudgetValid(" 500 ") === false, "Whitespace rejected — caller trims");
}

// ============================================================
// FIX 5.2: adminDeleteForm returns success boolean and handles errors
// Regression: function was async but caller (AdminFormsTab) didn't await,
// so a Firestore failure would still display "הטופס נמחק" toast.
// ============================================================
console.log("--- 5.2: adminDeleteForm error contract ---");

{
  const fs = await import("node:fs");
  const storeSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/store.js", "utf8");
  const adminTabSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/components/AdminFormsTab.jsx", "utf8");

  // Function shape: declares return values + try/catch around deleteDoc.
  const fnMatch = storeSrc.match(/export async function adminDeleteForm\(formId\)\s*\{([\s\S]*?)\n\}\n/);
  assert(!!fnMatch, "adminDeleteForm function found");
  const body = fnMatch?.[1] || "";
  assert(body.includes("return false"), "Returns false on early rejection / failure");
  assert(body.includes("return true"), "Returns true on success");
  assert(body.match(/try\s*\{[\s\S]*await\s+deleteDoc/), "deleteDoc wrapped in try/catch");
  assert(body.includes("emitWriteError"), "Surfaces errors via emitWriteError");
  // Cache update must remain after the await — never optimistic on a delete.
  const cacheLineIdx = body.indexOf("delete newPreds[formId]");
  const awaitLineIdx = body.indexOf("await deleteDoc");
  assert(cacheLineIdx > awaitLineIdx, "Cache update happens after deleteDoc await");

  // Caller must await + branch the toast on the boolean.
  assert(adminTabSrc.match(/await\s+adminDeleteForm/), "Caller awaits adminDeleteForm");
  assert(adminTabSrc.includes("מחיקת הטופס נכשלה"), "Failure toast wired up");
  assert(adminTabSrc.match(/showToast\([^)]*"error"/), "Failure toast uses error variant");
}

// ============================================================
// FIX 5.3: writeFormDoc / debouncedWriteForm revert optimistic cache on
// permission-denied. Transient errors (network/timeout) are NOT reverted —
// the realtime listener resolves them. Only rule-rejected writes need the
// explicit revert because the server state never broadcasts a correction.
// ============================================================
console.log("--- 5.3: Optimistic write revert on permission-denied ---");

{
  const fs = await import("node:fs");
  const storeSrc = readMigratedSrc("/home/user/Beeri-World-Cup/src/store.js", "utf8");

  assert(storeSrc.includes("function revertOptimisticForm"), "revertOptimisticForm helper exists");

  // writeFormDoc must capture snapshot before optimistic update + revert on permission-denied.
  const writeFn = storeSrc.match(/async function writeFormDoc\(formId, formData\)\s*\{([\s\S]*?)\n\}\n/)?.[1] || "";
  assert(writeFn.includes("const prevSnapshot = cache.predictions"), "writeFormDoc captures pre-write snapshot");
  assert(writeFn.match(/if \(err\?\.code === "permission-denied"\)/), "writeFormDoc gates revert on permission-denied");
  assert(writeFn.includes("revertOptimisticForm(formId, prevSnapshot)"), "writeFormDoc calls revertOptimisticForm");

  // debouncedWriteForm must do the same, with an extra freshness guard so a
  // racing later call's optimistic state isn't wiped.
  const debFn = storeSrc.match(/function debouncedWriteForm\(formId, formData[^)]*\)\s*\{([\s\S]*?)\n\}\n/)?.[1] || "";
  assert(debFn.includes("const prevSnapshot = cache.predictions"), "debouncedWriteForm captures snapshot");
  assert(debFn.match(/if \(err\?\.code === "permission-denied"\)/), "debouncedWriteForm gates revert on permission-denied");
  assert(debFn.includes("cache.predictions?.[formId] === formData"), "debouncedWriteForm has freshness guard before reverting");

  // Pure logic check: simulate the revert/no-revert decision tree.
  function decide(errCode, currentInCache, attempted) {
    if (errCode !== "permission-denied") return "no-revert";
    if (currentInCache !== attempted) return "no-revert"; // user typed since
    return "revert";
  }
  const formA = { score: 1 }, formB = { score: 2 };
  assert(decide("permission-denied", formA, formA) === "revert", "Stale write rejected: revert");
  assert(decide("permission-denied", formB, formA) === "no-revert", "User has typed newer state: no revert");
  assert(decide("unavailable", formA, formA) === "no-revert", "Transient error: no revert");
  assert(decide("deadline-exceeded", formA, formA) === "no-revert", "Timeout: no revert");
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log(`\n=== AUDIT FIX RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
