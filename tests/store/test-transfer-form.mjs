// Regression suite for adminTransferForm — admin moves ONE form from user A
// to user B. Ownership is the `userId` field only; the transfer is a
// delete+recreate under a B-prefixed formId (Option A), atomic via writeBatch,
// commit-first-then-cache, MOVE semantics, all statuses, all fields preserved,
// NO firestore.rules change.
//
// The decision logic lives in the PURE module src/store/transferPlan.ts so it
// can be exercised behaviorally here (no Firestore in-process). The store fn
// wraps it with the side effects, audited via static-source ordering checks.
//
// Coverage:
//  1. Behavioral: planFormTransfer branches (errors / no-op / success)
//  2. Behavioral: field preservation + formId format (C1) + move-into-index
//  3. Static audit: predictionsRepo.ts adminTransferForm shape + ordering
//  4. Scope lockdown (no user-doc writes)
//  5. Barrel export
//  6. firestore.rules NOT weakened (userId still immutable on update)
//  7. UI audit: AdminFormsTab.tsx transfer modal + button
//  8. I2 regression: Predict handles a missing/reassigned active form

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { planFormTransfer } from "/home/user/Beeri-World-Cup/src/store/transferPlan.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== TRANSFER FORM — REGRESSION SUITE ===\n");

const A = "phone_0500000001";
const B = "phone_0500000002";
const usersMap = { [A]: { displayName: "א" }, [B]: { displayName: "ב" } };
const sampleForm = {
  userId: A, formName: "טופס של א", status: "submitted",
  submittedAt: "2026-06-01T10:00:00Z", approvedAt: "2026-06-01T11:00:00Z",
  matches: { "1": { homeScore: 2, awayScore: 1 } }, advancing: { A: ["BRA"] },
  champion: "BRA", topScorer: "p_messi", budgetNumber: "42",
  adminNote: "בדיקה", createdAt: "2026-05-01T00:00:00Z",
};

// ============================================================
// 1. planFormTransfer — decision branches (REAL code)
// ============================================================
console.log("--- 1. planFormTransfer branches ---");
{
  const p = planFormTransfer(null, B, usersMap);
  assert("error" in p && p.error === "form-not-found", "null form → form-not-found");
}
{
  const p = planFormTransfer({ userId: A }, "ghost_uid", usersMap);
  assert("error" in p && p.error === "target-not-found", "unknown target → target-not-found");
  const p2 = planFormTransfer({ userId: A }, B, {});
  assert("error" in p2 && p2.error === "target-not-found", "empty users map → target-not-found");
}
{
  const p = planFormTransfer({ userId: A }, A, usersMap);
  assert("noop" in p && p.noop === true && p.fromUid === A, "target===owner → no-op");
}

// ============================================================
// 2. planFormTransfer — success: fields, formId (C1), move-into-index
// ============================================================
console.log("--- 2. planFormTransfer success ---");
{
  // Deterministic now/rand so the formId is predictable.
  const plan = planFormTransfer(sampleForm, B, usersMap, 1700000000000, 0.123);
  assert(!("error" in plan) && !("noop" in plan), "valid transfer is a success plan");
  assert(plan.fromUid === A, "fromUid is the original owner");
  assert(plan.newData.userId === B, "newData.userId == target (B)");
  assert(plan.newFormId === `${B}__1700000000000123`, "newFormId = target__epoch+suffix");

  // Every field besides userId preserved verbatim (status/matches/champion/
  // topScorer/adminNote/approvedAt/createdAt/budgetNumber/advancing...).
  const { userId: _a, ...origBody } = sampleForm;
  const { userId: _b, ...newBody } = plan.newData;
  assert(JSON.stringify(origBody) === JSON.stringify(newBody),
    "ALL fields besides userId preserved verbatim");

  // formId digit ceiling (C1): exactly 16 digits, within ^uid__\d{10,16}$.
  const digits = plan.newFormId.split("__")[1];
  assert(/^\d{16}$/.test(digits), `digit run is 16 digits (got ${digits.length})`);
  assert(new RegExp(`^${B}__\\d{10,16}$`).test(plan.newFormId),
    "newFormId matches the create-rule ^uid__\\d{10,16}$ bound");

  // rand=0 → "000" suffix, still 16 digits (no shrink below the bound).
  const p0 = planFormTransfer(sampleForm, B, usersMap, 1700000000000, 0);
  assert(/^\d{16}$/.test(p0.newFormId.split("__")[1]), "rand 0 → 000 suffix, still 16 digits");

  // Move-into-index: apply the same cache mutation adminTransferForm does and
  // assert the form LEAVES A and JOINS B (ownership = userId field).
  const oldId = `${A}__1700000000000`;
  const predictions = {
    [oldId]: sampleForm,
    [`${A}__1700000000999`]: { userId: A, formName: "טופס נוסף של א" },
    [`${B}__1600000000000`]: { userId: B, formName: "טופס קיים של ב" },
  };
  const next = { ...predictions };
  delete next[oldId];
  next[plan.newFormId] = plan.newData;
  const indexFor = (preds, uid) =>
    Object.entries(preds).filter(([, p]) => p.userId === uid).map(([fid]) => fid);
  assert(!next[oldId], "old formId key removed (no ghost)");
  assert(!indexFor(next, A).includes(oldId), "form left getFormsForUser(A)");
  assert(indexFor(next, B).includes(plan.newFormId), "form joined getFormsForUser(B)");
  assert(indexFor(next, A).length === 1, "A keeps their OTHER form (specific-form move)");
  assert(indexFor(next, B).length === 2, "B has existing + transferred form");
}

// ============================================================
// 3. Static audit — predictionsRepo.ts adminTransferForm
// ============================================================
console.log("--- 3. adminTransferForm source audit ---");
const repo = readMigratedSrc("src/store/predictionsRepo.js");
assert(/export async function adminTransferForm\s*\(/.test(repo), "adminTransferForm exported as async");
const fn = repo.match(/export async function adminTransferForm[\s\S]*?\n\}/)?.[0] || "";
assert(fn.length > 0, "adminTransferForm body isolated");

assert(fn.includes("requireAdmin()"), "guards with requireAdmin()");
assert(fn.includes("getForm(oldFormId)"), "re-reads the form from live cache (double-click safe)");
assert(/planFormTransfer\(form,\s*targetUid,\s*getUsers\(\)\)/.test(fn),
  "delegates validation/formId/copy to the pure planner");
assert(fn.includes('"error" in plan'), "handles planner error branch");
assert(fn.includes('"noop" in plan'), "handles planner no-op branch");
assert(fn.includes("clearPendingWritesForForm(oldFormId)"), "clears pending write on old form");
assert(fn.includes("writeBatch(db)"), "uses an atomic writeBatch");
assert(/batch\.set\(formDocRef\(newFormId\)/.test(fn), "batch.set on new formId");
assert(/batch\.delete\(formDocRef\(oldFormId\)\)/.test(fn), "batch.delete on old formId");
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
assert(/return \{ ok: false/.test(fn), "failure paths return { ok: false }");
assert(/return \{ ok: true, newFormId \}/.test(fn), "success returns { ok: true, newFormId }");

// planner source: collision-safe suffix + field-preserving copy.
const planSrc = readMigratedSrc("src/store/transferPlan.js");
assert(/padStart\(3,\s*["']0["']\)/.test(planSrc), "planner uses a 3-digit collision-safe suffix");
assert(/\{\s*\.\.\.form,\s*userId:\s*targetUid\s*\}/.test(planSrc), "planner spreads ...form, overrides ONLY userId");

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
assert(/adminTransferForm\(formId,\s*selected\)/.test(ui), "modal calls adminTransferForm(formId, selectedTargetUid)");
assert(ui.includes("uid !== currentOwnerId"), "picker excludes the current owner");
assert(/displayName[\s\S]{0,40}firstName[\s\S]{0,40}lastName/.test(ui), "picker searches by displayName/firstName/lastName");
assert(ui.includes("email"), "picker also searches by email");
assert(ui.includes("disabled={saving}"), "transfer action disabled while saving (re-entrancy)");
assert(/setTransferId\(r\.formId\)/.test(ui), "button passes only the formId (re-read in store)");
assert(ui.includes("להעביר את הטופס") && ui.includes("יירשם על שם"),
  "inline confirmation explains the move (from → to)");

// ============================================================
// 8. I2 regression — Predict handles a missing/reassigned active form
// ============================================================
console.log("--- 8. Predict stale-active-form protection ---");
const predict = readMigratedSrc("src/pages/Predict.jsx");
assert(/forms\.some\(\(f\)\s*=>\s*f\.formId === activeFormId\)/.test(predict),
  "mount guard clears the pointer when the form is gone");
assert(/formData\?\.userId === user\?\.id/.test(predict),
  "activeForm gated on current-user ownership (reassigned form falls away)");
// Live-session guard: a form we were viewing that vanishes mid-session drops
// the URL param so the page falls back to the hub (not a blank dead-end).
assert(predict.includes("seenActiveFormRef"),
  "tracks a previously-rendered active form to detect mid-session disappearance");
assert(/if \(!activeForm\) \{\s*return <FormsHub/.test(predict),
  "null active form falls back to FormsHub (the forms list), never a blank view");

console.log(`\n=== TRANSFER FORM RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
