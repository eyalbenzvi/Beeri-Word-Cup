// Regression suite for adminTransferForm — admin moves ONE form from user A
// to user B. Ownership is the `userId` field only; the transfer is a
// delete+recreate under a B-prefixed formId (Option A), atomic via writeBatch,
// commit-first-then-cache, MOVE semantics, all statuses, all fields preserved,
// NO firestore.rules change.
//
// Coverage:
//  1. Pure model: move semantics (leave A / join B / no ghost / fields kept)
//  2. formId format (C1): generated id stays within ^uid__\d{10,16}$
//  3. Static audit: predictionsRepo.ts adminTransferForm shape + ordering
//  4. Scope lockdown (no user-doc writes)
//  5. Barrel export
//  6. firestore.rules NOT weakened (userId still immutable on update)
//  7. UI audit: AdminFormsTab.tsx transfer modal + button
//  8. I2 regression: Predict.tsx already handles a missing/reassigned form

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== TRANSFER FORM — REGRESSION SUITE ===\n");

// ============================================================
// 1. Pure model — mirrors the store fn's effect on the predictions map
// ============================================================
console.log("--- 1. Move semantics (pure model) ---");
{
  // Mirror of the transfer effect (delete old key, add new key, override
  // userId, preserve everything else). Divergence is caught by section 3.
  function applyTransfer(predictions, oldFormId, targetUid, newFormId) {
    const form = predictions[oldFormId];
    const next = { ...predictions };
    delete next[oldFormId];
    next[newFormId] = { ...form, userId: targetUid };
    return next;
  }
  // userFormIndex rebuild mirror (predictionsRepo.rebuildUserFormIndex).
  function indexFor(predictions, uid) {
    return Object.entries(predictions)
      .filter(([, p]) => p.userId === uid)
      .map(([fid]) => fid);
  }

  const A = "phone_0500000001";
  const B = "phone_0500000002";
  const oldId = `${A}__1700000000000`;
  const newId = `${B}__1700000000123`;
  const before = {
    [oldId]: {
      userId: A, formName: "טופס של א", status: "submitted",
      submittedAt: "2026-06-01T10:00:00Z", approvedAt: "2026-06-01T11:00:00Z",
      matches: { "1": { homeScore: 2, awayScore: 1 } },
      advancing: { A: ["BRA"] }, champion: "BRA", topScorer: "p_messi",
      budgetNumber: "42", adminNote: "בדיקה", createdAt: "2026-05-01T00:00:00Z",
    },
    [`${A}__1700000000999`]: { userId: A, formName: "טופס נוסף של א", status: "draft" },
    [`${B}__1600000000000`]: { userId: B, formName: "טופס קיים של ב", status: "draft" },
  };

  const after = applyTransfer(before, oldId, B, newId);

  assert(!after[oldId], "old formId key is gone (no ghost)");
  assert(!!after[newId], "new B-prefixed formId exists");
  assert(after[newId].userId === B, "transferred form userId == B");
  // Every other field preserved verbatim.
  const { userId: _u1, ...oldBody } = before[oldId];
  const { userId: _u2, ...newBody } = after[newId];
  assert(JSON.stringify(oldBody) === JSON.stringify(newBody),
    "all fields besides userId preserved verbatim (status/matches/champion/topScorer/adminNote/createdAt...)");

  const aForms = indexFor(after, A);
  const bForms = indexFor(after, B);
  assert(!aForms.includes(oldId) && !aForms.includes(newId),
    "form left getFormsForUser(A)");
  assert(bForms.includes(newId), "form joined getFormsForUser(B)");
  assert(aForms.length === 1, "A keeps their OTHER form (specific-form move, not all forms)");
  assert(bForms.length === 2, "B now has their existing form + the transferred one");
}

// ============================================================
// 2. formId format (C1) — digit ceiling
// ============================================================
console.log("--- 2. newFormId format ---");
{
  const targetUid = "phone_0500000002";
  // Mirror of the generator: Date.now() (13 digits) + 3 random padded digits.
  const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const newFormId = `${targetUid}__${Date.now()}${suffix}`;
  const digits = newFormId.split("__")[1];
  assert(/^\d{16}$/.test(digits), `digit run is exactly 16 digits (got ${digits.length})`);
  // Must satisfy the create-rule bound ^uid__\d{10,16}$.
  assert(new RegExp(`^${targetUid}__\\d{10,16}$`).test(newFormId),
    "newFormId matches the create-rule ^uid__\\d{10,16}$ bound");
}

// ============================================================
// 3. Static audit — predictionsRepo.ts adminTransferForm
// ============================================================
console.log("--- 3. adminTransferForm source audit ---");
const repo = readMigratedSrc("src/store/predictionsRepo.js");
assert(/export async function adminTransferForm\s*\(/.test(repo),
  "adminTransferForm exported as async");

const fn = repo.match(/export async function adminTransferForm[\s\S]*?\n\}/)?.[0] || "";
assert(fn.length > 0, "adminTransferForm body isolated");

assert(fn.includes("requireAdmin()"), "guards with requireAdmin()");
assert(fn.includes("getForm(oldFormId)"), "re-reads the form from live cache (double-click safe)");
assert(/getUsers\(\)\[targetUid\]/.test(fn),
  "validates target against the users map (not directory-only getUser)");
assert(/targetUid === fromUid|targetUid === form\.userId/.test(fn),
  "no-ops when target equals current owner");
assert(fn.includes("clearPendingWritesForForm(oldFormId)"),
  "clears pending debounced write on old form (anti-resurrection)");
assert(fn.includes("writeBatch(db)"), "uses an atomic writeBatch");
assert(/batch\.set\(formDocRef\(newFormId\)/.test(fn), "batch.set on new formId");
assert(/batch\.delete\(formDocRef\(oldFormId\)\)/.test(fn), "batch.delete on old formId");
assert(/\$\{targetUid\}__\$\{Date\.now\(\)\}/.test(fn), "newFormId derives from targetUid + epoch");
assert(/padStart\(3,\s*["']0["']\)/.test(fn), "3-digit collision-safe suffix");
assert(/\{\s*\.\.\.form,\s*userId:\s*targetUid\s*\}/.test(fn),
  "spreads ...form and overrides ONLY userId");
assert(fn.includes('writeAuditLog("transfer-form"'), "writes an audit log entry");
assert(fn.includes("rebuildUserFormIndex()"), "rebuilds the user-form index");
assert(/getActiveFormId\(\) === oldFormId/.test(fn), "clears stale active-form pointer");

// Ordering invariants.
const iClear = fn.indexOf("clearPendingWritesForForm");
const iBatch = fn.indexOf("writeBatch(db)");
const iCommit = fn.indexOf("batch.commit()");
const iCacheMutate = fn.indexOf("cache.predictions = next");
const iAudit = fn.indexOf('writeAuditLog("transfer-form"');
assert(iClear > -1 && iClear < iBatch, "clears pending BEFORE building the batch");
assert(iCommit > -1 && iCacheMutate > iCommit,
  "commit-first: cache mutated only AFTER batch.commit() (no optimistic half-move)");
assert(iAudit > iCommit, "audit log written only AFTER a successful commit");
// Failure path returns {ok:false}; success returns {ok:true,newFormId}.
assert(/return \{ ok: false/.test(fn), "failure paths return { ok: false }");
assert(/return \{ ok: true, newFormId \}/.test(fn), "success returns { ok: true, newFormId }");

// ============================================================
// 4. Scope lockdown — never touches user docs
// ============================================================
console.log("--- 4. Scope lockdown ---");
for (const forbidden of ["updateUserProfile", "setAdminClaim", "updateUserField", "createUserField", "removeUserField"]) {
  assert(!fn.includes(forbidden), `adminTransferForm does NOT call '${forbidden}'`);
}

// ============================================================
// 5. Barrel export
// ============================================================
console.log("--- 5. Barrel export ---");
const barrel = readMigratedSrc("src/store/index.js");
assert(/adminTransferForm/.test(barrel), "adminTransferForm re-exported from store barrel");

// ============================================================
// 6. firestore.rules NOT weakened
// ============================================================
console.log("--- 6. firestore.rules unchanged invariant ---");
const rules = readMigratedSrc("firestore.rules");
assert(rules.includes("request.resource.data.userId == resource.data.userId"),
  "update rule still enforces userId immutability (we did NOT relax it)");

// ============================================================
// 7. UI audit — AdminFormsTab.tsx
// ============================================================
console.log("--- 7. AdminFormsTab UI ---");
const ui = readMigratedSrc("src/components/AdminFormsTab.jsx");
assert(/import\s*\{[\s\S]*adminTransferForm[\s\S]*\}\s*from\s*["']\.\.\/store["']/.test(ui),
  "imports adminTransferForm");
assert(ui.includes("TransferOwnerModal"), "defines a TransferOwnerModal");
assert(ui.includes("העבר בעלות"), "per-row 'העבר בעלות' action exists");
assert(/adminTransferForm\(formId,\s*selected\)/.test(ui),
  "modal calls adminTransferForm(formId, selectedTargetUid)");
assert(ui.includes("uid !== currentOwnerId"), "picker excludes the current owner");
assert(/displayName[\s\S]{0,40}firstName[\s\S]{0,40}lastName/.test(ui),
  "picker searches by displayName/firstName/lastName");
assert(ui.includes("email"), "picker also searches by email");
assert(ui.includes("disabled={saving}"), "transfer action disabled while saving (re-entrancy)");
assert(/setTransferId\(r\.formId\)/.test(ui), "button passes only the formId (re-read in store)");
// Confirmation step text names both users.
assert(ui.includes("להעביר את הטופס") && ui.includes("יירשם על שם"),
  "inline confirmation explains the move (from → to)");

// ============================================================
// 8. I2 regression — Predict handles a missing/reassigned active form
// ============================================================
console.log("--- 8. Predict stale-active-form protection ---");
const predict = readMigratedSrc("src/pages/Predict.jsx");
assert(/forms\.some\(\(f\)\s*=>\s*f\.formId === activeFormId\)/.test(predict),
  "Predict clears the active-form pointer when it no longer maps to an owned form");
assert(/formData\?\.userId === user\?\.id/.test(predict),
  "Predict gates activeForm on current-user ownership (reassigned form falls away cleanly)");

console.log(`\n=== TRANSFER FORM RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
