// Regression tests for "פתח לעריכה" (reopen submitted/pending forms).
//
// Rule of the feature: while the tournament isn't locked
// (predictionsLocked === false), the owner of a form may transition it back
// to `draft` from either `pending` (not yet admin-approved) or `submitted`
// (admin-approved). The transition must be forbidden once locked, must not
// be available for a form that is already `draft`, and must be gated by an
// explicit confirmation when the form is `submitted` (because reopening it
// pulls it out of the leaderboard until re-approval).
//
// Coverage:
//  1. FSM mirror: validUserStatusTransition — matches firestore.rules
//  2. reopenForm() store guard — mirrors src/store.js reopenForm
//  3. FormList UI gating (pending||submitted && !locked)
//  4. Confirmation required only for `submitted`
//  5. Static source audits — firestore.rules, store.js, FormList.jsx, Predict.jsx

import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== REOPEN FORM — REGRESSION SUITE ===\n");

// ============================================================
// 1. FSM mirror: validUserStatusTransition
// ============================================================
console.log("--- 1. FSM: validUserStatusTransition (mirrors firestore.rules) ---");

{
  // Mirrors the function in firestore.rules. Any divergence will be caught
  // by the static audit in section 5.
  function validUserStatusTransition(oldStatus, newStatus) {
    return (oldStatus === "draft" && (newStatus === "draft" || newStatus === "pending")) ||
           (oldStatus === "pending" && newStatus === "draft") ||
           (oldStatus === "submitted" && newStatus === "draft");
  }

  // Legal transitions
  assert(validUserStatusTransition("draft", "draft") === true, "draft→draft legal (idempotent edit)");
  assert(validUserStatusTransition("draft", "pending") === true, "draft→pending legal (submit)");
  assert(validUserStatusTransition("pending", "draft") === true, "pending→draft legal (reopen before approval)");
  assert(validUserStatusTransition("submitted", "draft") === true, "submitted→draft legal (reopen after approval)");

  // Illegal transitions (user may not skip to submitted; may not bypass draft)
  assert(validUserStatusTransition("draft", "submitted") === false, "draft→submitted illegal (admin only)");
  assert(validUserStatusTransition("pending", "submitted") === false, "pending→submitted illegal (admin only)");
  assert(validUserStatusTransition("submitted", "pending") === false, "submitted→pending illegal (must drop to draft first)");
  assert(validUserStatusTransition("submitted", "submitted") === false, "submitted→submitted illegal (no self-loop)");
  assert(validUserStatusTransition("pending", "pending") === false, "pending→pending illegal");
}

// ============================================================
// 2. reopenForm() store guard (mirrors src/store.js)
// ============================================================
console.log("--- 2. reopenForm guard behavior ---");

{
  function reopenFormGuard({ form, locked }) {
    if (locked) return { wrote: false, reason: "locked" };
    if (!form) return { wrote: false, reason: "no-form" };
    if (form.status !== "pending" && form.status !== "submitted") {
      return { wrote: false, reason: "bad-status" };
    }
    return { wrote: true, newStatus: "draft" };
  }

  // Happy paths
  assert(
    reopenFormGuard({ form: { status: "pending" }, locked: false }).wrote === true,
    "pending + unlocked → writes draft",
  );
  assert(
    reopenFormGuard({ form: { status: "submitted" }, locked: false }).wrote === true,
    "submitted + unlocked → writes draft",
  );

  // Locked blocks everything
  const lockedPending = reopenFormGuard({ form: { status: "pending" }, locked: true });
  assert(!lockedPending.wrote && lockedPending.reason === "locked", "locked short-circuits before form check");
  assert(!reopenFormGuard({ form: { status: "submitted" }, locked: true }).wrote, "submitted + locked blocked");
  assert(!reopenFormGuard({ form: { status: "draft" }, locked: true }).wrote, "draft + locked blocked");

  // Missing form
  assert(!reopenFormGuard({ form: null, locked: false }).wrote, "null form blocked");
  assert(!reopenFormGuard({ form: undefined, locked: false }).wrote, "undefined form blocked");

  // Wrong status
  assert(
    reopenFormGuard({ form: { status: "draft" }, locked: false }).reason === "bad-status",
    "draft cannot be reopened (it is already draft)",
  );
  assert(
    reopenFormGuard({ form: { status: "approved" }, locked: false }).reason === "bad-status",
    "unknown status rejected",
  );
}

// ============================================================
// 3. FormList UI: button visibility gating
// ============================================================
console.log("--- 3. FormList reopen button visibility ---");

{
  // Mirrors the JSX condition in FormList.jsx:
  // {(form.status === "pending" || formStatus === "submitted") && !settings.predictionsLocked && (...)}
  // `formStatus` is normalizeStatus(form.status) — legacy statuses like
  // "approved" get mapped to "submitted" in normalizeStatus, so using the
  // normalized version for the submitted leg is the right call.
  function shouldShowReopen({ rawStatus, normalizedStatus, locked }) {
    return (rawStatus === "pending" || normalizedStatus === "submitted") && !locked;
  }

  assert(shouldShowReopen({ rawStatus: "pending", normalizedStatus: "pending", locked: false }) === true, "pending + unlocked");
  assert(shouldShowReopen({ rawStatus: "submitted", normalizedStatus: "submitted", locked: false }) === true, "submitted + unlocked");
  assert(shouldShowReopen({ rawStatus: "approved", normalizedStatus: "submitted", locked: false }) === true, "legacy approved → submitted: show");
  assert(shouldShowReopen({ rawStatus: "draft", normalizedStatus: "draft", locked: false }) === false, "draft: hide");

  // Locked hides in every case
  assert(shouldShowReopen({ rawStatus: "pending", normalizedStatus: "pending", locked: true }) === false, "pending + locked: hide");
  assert(shouldShowReopen({ rawStatus: "submitted", normalizedStatus: "submitted", locked: true }) === false, "submitted + locked: hide");
  assert(shouldShowReopen({ rawStatus: "draft", normalizedStatus: "draft", locked: true }) === false, "draft + locked: hide");
}

// ============================================================
// 4. Confirmation gating — only submitted requires confirm
// ============================================================
console.log("--- 4. Confirmation dialog required only for submitted ---");

{
  // Mirrors handleReopenForm in FormList.jsx
  async function handleReopen(form, { confirmResult }) {
    let confirmed = null;
    if (form.normalizedStatus === "submitted") {
      confirmed = confirmResult; // would be await confirm({...}) in real code
      if (!confirmed) return { reopened: false, confirmed };
    }
    return { reopened: true, confirmed };
  }

  // Pending: no confirm, reopens directly
  const pendingResult = await handleReopen({ normalizedStatus: "pending" }, { confirmResult: null });
  assert(pendingResult.reopened === true, "pending: reopens without confirm");
  assert(pendingResult.confirmed === null, "pending: confirm never invoked (null)");

  // Submitted + confirm=true: reopens
  const submittedYes = await handleReopen({ normalizedStatus: "submitted" }, { confirmResult: true });
  assert(submittedYes.reopened === true, "submitted + confirm yes: reopens");

  // Submitted + confirm=false: aborts
  const submittedNo = await handleReopen({ normalizedStatus: "submitted" }, { confirmResult: false });
  assert(submittedNo.reopened === false, "submitted + confirm no: does NOT reopen");
}

// ============================================================
// 5. Static source audits — catch drift between the feature's pieces
// ============================================================
console.log("--- 5. Static source audits ---");

{
  // 5a. firestore.rules must contain the three user-allowed transitions
  const rules = readMigratedSrc("firestore.rules", "utf8");
  assert(
    /oldStatus\s*==\s*'draft'\s*&&\s*\(\s*newStatus\s*==\s*'draft'\s*\|\|\s*newStatus\s*==\s*'pending'\s*\)/.test(rules),
    "firestore.rules: allows draft → draft|pending",
  );
  assert(
    /oldStatus\s*==\s*'pending'\s*&&\s*newStatus\s*==\s*'draft'/.test(rules),
    "firestore.rules: allows pending → draft",
  );
  assert(
    /oldStatus\s*==\s*'submitted'\s*&&\s*newStatus\s*==\s*'draft'/.test(rules),
    "firestore.rules: allows submitted → draft (the feature under test)",
  );
  // Regression: rules must not let users leapfrog to submitted
  assert(
    !/newStatus\s*==\s*'submitted'/.test(rules.replace(/\/\/.*$/gm, "")),
    "firestore.rules: users cannot transition TO 'submitted' (admin-only)",
  );
  // !isLocked() still gates the update envelope
  assert(/!isLocked\(\)/.test(rules), "firestore.rules: !isLocked() guard still present on update");
}

{
  // 5b. src/store.js reopenForm must accept pending OR submitted, and must
  //     short-circuit when locked.
  const store = readMigratedSrc("src/store.js", "utf8");
  // Loose param match — TS migration adds `: string` annotations.
  const reopenMatch = store.match(/export function reopenForm\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert(reopenMatch, "store.js: reopenForm export found");
  const body = reopenMatch ? reopenMatch[0] : "";
  assert(/predictionsLocked/.test(body), "store.js reopenForm: checks predictionsLocked");
  assert(
    /form\.status\s*!==\s*"pending"\s*&&\s*form\.status\s*!==\s*"submitted"/.test(body) ||
      /form\.status\s*!==\s*"submitted"\s*&&\s*form\.status\s*!==\s*"pending"/.test(body),
    "store.js reopenForm: guard accepts both pending and submitted",
  );
  assert(/status:\s*"draft"/.test(body), "store.js reopenForm: writes status=draft");
  assert(/reopenedAt/.test(body), "store.js reopenForm: records reopenedAt timestamp");
}

{
  // 5c. FormList: button renders for pending or normalized submitted, not draft
  const src = readMigratedSrc("src/components/FormList.jsx", "utf8");
  assert(/פתח לעריכה/.test(src), "FormList: button label 'פתח לעריכה' present");
  assert(
    /form\.status\s*===\s*"pending"\s*\|\|\s*formStatus\s*===\s*"submitted"/.test(src),
    "FormList: gating expression covers pending OR submitted",
  );
  assert(
    /!settings\.predictionsLocked/.test(src),
    "FormList: gating includes !settings.predictionsLocked",
  );
  assert(
    /handleReopenForm/.test(src) && /useConfirm|confirm\(/.test(src),
    "FormList: reopen uses confirm flow",
  );
}

{
  // 5d. Predict.jsx: submitted block must render a reopen button gated by
  //     !settings.predictionsLocked and wrapped in a confirm() dialog.
  const src = readMigratedSrc("src/pages/Predict.jsx", "utf8");
  // Find the block where status === "submitted" && activeForm?.status !== "pending"
  const blockMatch = src.match(
    /\{status === "submitted" && activeForm\?\.status !== "pending" && \(([\s\S]*?)\n\s{6}\)\}/,
  );
  assert(blockMatch, "Predict.jsx: submitted block located");
  if (blockMatch) {
    const block = blockMatch[1];
    assert(/!settings\.predictionsLocked/.test(block), "Predict.jsx submitted: lock-gated reopen");
    assert(/פתח לעריכה/.test(block), "Predict.jsx submitted: button labeled 'פתח לעריכה'");
    assert(/reopenForm\(activeFormId\)/.test(block), "Predict.jsx submitted: calls reopenForm(activeFormId)");
    assert(/confirm\(/.test(block), "Predict.jsx submitted: confirm() dialog precedes reopen");
  }
  // Also: the pre-existing pending block keeps its button (regression from #105)
  const pendingBlock = src.match(
    /\{activeForm\?\.status === "pending" && \(([\s\S]*?)\n\s{6}\)\}/,
  );
  assert(pendingBlock, "Predict.jsx: pending block located");
  if (pendingBlock) {
    assert(/פתח לעריכה/.test(pendingBlock[1]), "Predict.jsx pending: keeps 'פתח לעריכה' button");
    assert(/reopenForm/.test(pendingBlock[1]), "Predict.jsx pending: still calls reopenForm");
  }
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log(`\n=== REOPEN FORM RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
