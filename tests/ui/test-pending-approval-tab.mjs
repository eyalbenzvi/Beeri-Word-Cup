// Regression tests for the "ממתינים לאישור" (Pending Approval) tab in AdminFormsTab.
//
// The change splits the admin forms tab into four filters:
//   "all"       → every form regardless of status
//   "submitted" → status "submitted" | "approved" ONLY (pending removed)
//   "pending"   → status "pending" ONLY (new tab)
//   "draft"     → status "draft" ONLY
//
// Coverage:
//  1. Filter logic: correct status inclusion/exclusion per tab
//  2. Regression: "submitted" tab excludes "pending" (the key breakage guard)
//  3. Badge count: pendingCount correctly reflects pending-only forms
//  4. Sort: pending tab is FIFO (oldest submittedAt first)
//  5. Sort: other tabs are newest-first
//  6. Search query: filters within the active status filter
//  7. Action button visibility per status
//  8. Edge cases: empty set, all-pending, approved forms in "submitted" tab
//  9. Static source audits: conditions in AdminFormsTab.tsx match expectations

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== PENDING APPROVAL TAB — REGRESSION SUITE ===\n");

// ─────────────────────────────────────────────────────────────────
// Helpers that mirror the logic in AdminFormsTab.tsx
// These must stay in sync with the source; static audits below
// verify the source matches each pattern.
// ─────────────────────────────────────────────────────────────────
function buildRows(allPredictions, users, statusFilter, query) {
  const mapped = Object.entries(allPredictions).map(([formId, p]) => ({
    formId,
    ...p,
    userName: (users[p.userId]?.displayName) || p.userId,
  }));

  const filtered = mapped.filter((r) => {
    if (statusFilter === "draft" && r.status !== "draft") return false;
    if (statusFilter === "submitted" && r.status !== "submitted" && r.status !== "approved") return false;
    if (statusFilter === "pending" && r.status !== "pending") return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (r.formName || "").toLowerCase().includes(q) ||
      (r.userName || "").toLowerCase().includes(q) ||
      r.formId.toLowerCase().includes(q)
    );
  });

  if (statusFilter === "pending") {
    return filtered.sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || ""));
  }
  return filtered.sort((a, b) =>
    (b.submittedAt || b.updatedAt || "").localeCompare(a.submittedAt || a.updatedAt || ""),
  );
}

function calcPendingCount(allPredictions) {
  return Object.values(allPredictions).filter((p) => p.status === "pending").length;
}

// Test data fixture
const USERS = {
  u1: { displayName: "עדי ויונתן" },
  u2: { displayName: "עילאי פישמן" },
  u3: { displayName: "ליאל בטיטו" },
};
const ALL_PREDICTIONS = {
  "u1__1000": { userId: "u1", formName: "טופס א", status: "submitted", submittedAt: "2026-05-20T10:00:00Z" },
  "u1__2000": { userId: "u1", formName: "טופס ב", status: "approved",  submittedAt: "2026-05-21T10:00:00Z" },
  "u2__1000": { userId: "u2", formName: "טופס ג", status: "pending",   submittedAt: "2026-05-22T08:00:00Z" },
  "u2__2000": { userId: "u2", formName: "טופס ד", status: "pending",   submittedAt: "2026-05-22T09:00:00Z" },
  "u3__1000": { userId: "u3", formName: "טופס ה", status: "draft",     updatedAt: "2026-05-22T11:00:00Z" },
  "u3__2000": { userId: "u3", formName: "טופס ו", status: "draft",     updatedAt: "2026-05-22T12:00:00Z" },
};

// ─────────────────────────────────────────────────────────────────
// 1. Filter: "all" shows every status
// ─────────────────────────────────────────────────────────────────
console.log("--- 1. Filter 'all' shows every status ---");

{
  const rows = buildRows(ALL_PREDICTIONS, USERS, "all", "");
  assert(rows.length === 6, `all: shows all 6 forms (got ${rows.length})`);
  const statuses = rows.map((r) => r.status);
  assert(statuses.includes("submitted"), "all: includes submitted");
  assert(statuses.includes("approved"),  "all: includes approved");
  assert(statuses.includes("pending"),   "all: includes pending");
  assert(statuses.includes("draft"),     "all: includes draft");
}

// ─────────────────────────────────────────────────────────────────
// 2. Filter: "submitted" shows ONLY submitted and approved
// ─────────────────────────────────────────────────────────────────
console.log("--- 2. Filter 'submitted' includes submitted and approved ---");

{
  const rows = buildRows(ALL_PREDICTIONS, USERS, "submitted", "");
  assert(rows.length === 2, `submitted: shows exactly 2 forms (got ${rows.length})`);
  assert(rows.every((r) => r.status === "submitted" || r.status === "approved"),
    "submitted: all rows have status submitted or approved");
}

// ─────────────────────────────────────────────────────────────────
// 3. REGRESSION: "submitted" tab MUST NOT include "pending" forms
// This is the primary guard for the change: previously "pending" was
// included in "הוגשו" — this test catches any regression that reverts it.
// ─────────────────────────────────────────────────────────────────
console.log("--- 3. REGRESSION: 'submitted' tab excludes pending ---");

{
  const rows = buildRows(ALL_PREDICTIONS, USERS, "submitted", "");
  assert(rows.every((r) => r.status !== "pending"),
    "REGRESSION: submitted filter must not contain any pending form");

  // Targeted: a pending-only fixture
  const pendingOnly = { "u1__9": { userId: "u1", formName: "pending form", status: "pending", submittedAt: "2026-05-22T10:00:00Z" } };
  const rows2 = buildRows(pendingOnly, USERS, "submitted", "");
  assert(rows2.length === 0, "REGRESSION: single pending form does not appear under submitted filter");
}

// ─────────────────────────────────────────────────────────────────
// 4. Filter: "pending" shows ONLY pending forms
// ─────────────────────────────────────────────────────────────────
console.log("--- 4. Filter 'pending' shows only pending forms ---");

{
  const rows = buildRows(ALL_PREDICTIONS, USERS, "pending", "");
  assert(rows.length === 2, `pending: shows exactly 2 pending forms (got ${rows.length})`);
  assert(rows.every((r) => r.status === "pending"),
    "pending: every row has status 'pending'");
  assert(rows.every((r) => r.status !== "submitted"), "pending: no submitted forms included");
  assert(rows.every((r) => r.status !== "approved"),  "pending: no approved forms included");
  assert(rows.every((r) => r.status !== "draft"),     "pending: no draft forms included");
}

// ─────────────────────────────────────────────────────────────────
// 5. Filter: "draft" shows ONLY draft forms
// ─────────────────────────────────────────────────────────────────
console.log("--- 5. Filter 'draft' shows only draft forms ---");

{
  const rows = buildRows(ALL_PREDICTIONS, USERS, "draft", "");
  assert(rows.length === 2, `draft: shows exactly 2 draft forms (got ${rows.length})`);
  assert(rows.every((r) => r.status === "draft"), "draft: every row has status 'draft'");
}

// ─────────────────────────────────────────────────────────────────
// 6. Badge count: counts only "pending" forms
// ─────────────────────────────────────────────────────────────────
console.log("--- 6. pendingCount badge: counts pending-only ---");

{
  assert(calcPendingCount(ALL_PREDICTIONS) === 2, "badge count: 2 pending forms");

  const noPending = {
    "u1__1": { userId: "u1", status: "submitted" },
    "u2__1": { userId: "u2", status: "draft" },
    "u3__1": { userId: "u3", status: "approved" },
  };
  assert(calcPendingCount(noPending) === 0, "badge count: 0 when no pending forms");

  const allPending = {
    "u1__1": { userId: "u1", status: "pending" },
    "u2__1": { userId: "u2", status: "pending" },
    "u3__1": { userId: "u3", status: "pending" },
  };
  assert(calcPendingCount(allPending) === 3, "badge count: all-pending fixture counts correctly");

  // Badge should not include draft or submitted
  const mixed = {
    "f1": { userId: "u1", status: "submitted" },
    "f2": { userId: "u1", status: "pending" },
    "f3": { userId: "u1", status: "draft" },
    "f4": { userId: "u1", status: "approved" },
  };
  assert(calcPendingCount(mixed) === 1, "badge count: only pending forms counted (not submitted/draft/approved)");
}

// ─────────────────────────────────────────────────────────────────
// 7. Sort: pending tab is FIFO (oldest submittedAt first)
// ─────────────────────────────────────────────────────────────────
console.log("--- 7. Sort: pending tab is FIFO (oldest first) ---");

{
  const rows = buildRows(ALL_PREDICTIONS, USERS, "pending", "");
  assert(rows.length === 2, "pending sort: 2 rows");
  // u2__1000 submitted at 08:00, u2__2000 at 09:00 → oldest first
  assert(rows[0].formId === "u2__1000",
    `pending sort: oldest submittedAt first (got formId ${rows[0].formId})`);
  assert(rows[1].formId === "u2__2000",
    `pending sort: newer submittedAt second (got formId ${rows[1].formId})`);

  // Reverse order in fixture to confirm sort is not order-dependent on object keys
  const reversed = {
    "u2__2000": { userId: "u2", formName: "newer",  status: "pending", submittedAt: "2026-05-22T09:00:00Z" },
    "u2__1000": { userId: "u2", formName: "oldest", status: "pending", submittedAt: "2026-05-22T08:00:00Z" },
  };
  const revRows = buildRows(reversed, USERS, "pending", "");
  assert(revRows[0].formName === "oldest", "pending sort: object key order does not affect sort");
  assert(revRows[1].formName === "newer",  "pending sort: newer appears second regardless of key order");
}

// ─────────────────────────────────────────────────────────────────
// 8. Sort: non-pending tabs are newest-first
// ─────────────────────────────────────────────────────────────────
console.log("--- 8. Sort: submitted/draft/all tabs are newest-first ---");

{
  const submitted = buildRows(ALL_PREDICTIONS, USERS, "submitted", "");
  assert(submitted.length >= 2, "submitted sort: at least 2 rows");
  // submitted 2026-05-20, approved 2026-05-21 → newest (approved) first
  assert(submitted[0].formId === "u1__2000",
    `submitted sort: newest submittedAt first (got ${submitted[0].formId})`);
  assert(submitted[1].formId === "u1__1000",
    `submitted sort: older submittedAt second (got ${submitted[1].formId})`);

  const draft = buildRows(ALL_PREDICTIONS, USERS, "draft", "");
  assert(draft.length >= 2, "draft sort: at least 2 rows");
  // u3__2000 updatedAt 12:00, u3__1000 updatedAt 11:00 → 12:00 first
  assert(draft[0].formId === "u3__2000",
    `draft sort: newest updatedAt first (got ${draft[0].formId})`);
}

// ─────────────────────────────────────────────────────────────────
// 9. Sort: pending forms without submittedAt sort to front (not crash)
// ─────────────────────────────────────────────────────────────────
console.log("--- 9. Sort: pending forms without submittedAt do not crash ---");

{
  const noDate = {
    "f1": { userId: "u1", formName: "no date",  status: "pending" },
    "f2": { userId: "u1", formName: "has date",  status: "pending", submittedAt: "2026-05-22T10:00:00Z" },
  };
  let crashed = false;
  let sortedRows;
  try {
    sortedRows = buildRows(noDate, USERS, "pending", "");
  } catch (e) {
    crashed = true;
  }
  assert(!crashed, "pending sort: no crash when submittedAt is missing");
  assert(sortedRows && sortedRows.length === 2, "pending sort: both rows returned even without date");
  // Missing date → empty string → sorts before any real date string
  assert(sortedRows[0].formName === "no date", "pending sort: missing submittedAt sorts before dated forms");
}

// ─────────────────────────────────────────────────────────────────
// 10. Search query: filters within the active status tab
// ─────────────────────────────────────────────────────────────────
console.log("--- 10. Search query filters within status tab ---");

{
  // Query matches formName within "pending" tab
  const rows = buildRows(ALL_PREDICTIONS, USERS, "pending", "טופס ג");
  assert(rows.length === 1, `search in pending: 1 match for 'טופס ג' (got ${rows.length})`);
  assert(rows[0].formName === "טופס ג", "search in pending: correct form returned");

  // Query matches userName within "pending" tab
  const rowsUser = buildRows(ALL_PREDICTIONS, USERS, "pending", "עילאי");
  assert(rowsUser.length === 2, `search by userName in pending: 2 matches (got ${rowsUser.length})`);

  // Query with no match returns empty
  const rowsNone = buildRows(ALL_PREDICTIONS, USERS, "pending", "nobody");
  assert(rowsNone.length === 0, "search: no match returns empty array");

  // Query in "submitted" tab cannot surface pending forms
  const rowsSubmitted = buildRows(ALL_PREDICTIONS, USERS, "submitted", "עילאי");
  assert(rowsSubmitted.length === 0,
    "search: query matching pending user does not surface pending forms in submitted tab");

  // Query in "all" tab can surface pending forms
  const rowsAll = buildRows(ALL_PREDICTIONS, USERS, "all", "עילאי");
  assert(rowsAll.length === 2, `search: all tab + query surfaces pending forms (got ${rowsAll.length})`);
  assert(rowsAll.every((r) => r.status === "pending"), "search all: both of עילאי's forms are pending");
}

// ─────────────────────────────────────────────────────────────────
// 11. Action button visibility logic (mirrors JSX conditions)
// ─────────────────────────────────────────────────────────────────
console.log("--- 11. Action button visibility per status ---");

{
  // Mirrors the conditions in AdminFormsTab JSX action buttons
  function buttons(status) {
    return {
      approve:      status === "pending",
      forceSubmit:  status === "draft",
      reopen:       status === "submitted" || status === "approved",
      delete:       true, // always visible
    };
  }

  // Pending: only "אשר" (approve) — not reopen, not force-submit
  const pending = buttons("pending");
  assert(pending.approve     === true,  "pending: approve button visible");
  assert(pending.forceSubmit === false, "pending: force-submit NOT visible");
  assert(pending.reopen      === false, "pending: reopen NOT visible (admin-only approve flow)");
  assert(pending.delete      === true,  "pending: delete always visible");

  // Submitted: only "פתח מחדש" — not approve, not force-submit
  const submitted = buttons("submitted");
  assert(submitted.approve     === false, "submitted: approve NOT visible");
  assert(submitted.forceSubmit === false, "submitted: force-submit NOT visible");
  assert(submitted.reopen      === true,  "submitted: reopen visible");
  assert(submitted.delete      === true,  "submitted: delete always visible");

  // Approved: same as submitted (legacy status alias)
  const approved = buttons("approved");
  assert(approved.reopen  === true,  "approved: reopen visible (legacy alias of submitted)");
  assert(approved.approve === false, "approved: approve NOT visible (already approved)");

  // Draft: only "הגשה כפויה"
  const draft = buttons("draft");
  assert(draft.forceSubmit === true,  "draft: force-submit visible");
  assert(draft.approve     === false, "draft: approve NOT visible");
  assert(draft.reopen      === false, "draft: reopen NOT visible");
}

// ─────────────────────────────────────────────────────────────────
// 12. Edge case: empty allPredictions
// ─────────────────────────────────────────────────────────────────
console.log("--- 12. Edge case: empty allPredictions ---");

{
  const empty = {};
  assert(buildRows(empty, USERS, "all",       "").length === 0, "empty: all tab → 0 rows");
  assert(buildRows(empty, USERS, "submitted", "").length === 0, "empty: submitted tab → 0 rows");
  assert(buildRows(empty, USERS, "pending",   "").length === 0, "empty: pending tab → 0 rows");
  assert(buildRows(empty, USERS, "draft",     "").length === 0, "empty: draft tab → 0 rows");
  assert(calcPendingCount(empty) === 0,                         "empty: badge count is 0");
}

// ─────────────────────────────────────────────────────────────────
// 13. Edge case: all forms are pending
// ─────────────────────────────────────────────────────────────────
console.log("--- 13. Edge case: all forms pending ---");

{
  const allPending = {
    "u1__1": { userId: "u1", formName: "a", status: "pending", submittedAt: "2026-05-22T08:00:00Z" },
    "u2__1": { userId: "u2", formName: "b", status: "pending", submittedAt: "2026-05-22T09:00:00Z" },
  };
  assert(calcPendingCount(allPending) === 2, "all-pending: badge count = 2");
  assert(buildRows(allPending, USERS, "pending",   "").length === 2, "all-pending: pending tab shows all");
  assert(buildRows(allPending, USERS, "submitted", "").length === 0, "all-pending: submitted tab empty");
  assert(buildRows(allPending, USERS, "draft",     "").length === 0, "all-pending: draft tab empty");
}

// ─────────────────────────────────────────────────────────────────
// 14. "approved" forms appear in "submitted" tab (legacy compat)
// ─────────────────────────────────────────────────────────────────
console.log("--- 14. Legacy 'approved' status appears in submitted tab ---");

{
  const approvedOnly = {
    "u1__1": { userId: "u1", formName: "approved form", status: "approved", submittedAt: "2026-05-20T10:00:00Z" },
  };
  const rows = buildRows(approvedOnly, USERS, "submitted", "");
  assert(rows.length === 1, "approved form appears in submitted tab");
  assert(rows[0].status === "approved", "approved status preserved in row");
  assert(calcPendingCount(approvedOnly) === 0, "approved form does not count toward badge");
}

// ─────────────────────────────────────────────────────────────────
// 15. Badge count is global (not affected by active query)
// This is the documented design: badge shows total pending, query filters rows.
// ─────────────────────────────────────────────────────────────────
console.log("--- 15. Badge count is independent of search query ---");

{
  // 2 pending forms, but query matches only 1
  const count = calcPendingCount(ALL_PREDICTIONS);
  assert(count === 2, "badge count independent of query: always shows global pending");
  // The filtered rows (when query is set) can differ — badge shows the global count
  const filteredRows = buildRows(ALL_PREDICTIONS, USERS, "pending", "טופס ג");
  assert(filteredRows.length === 1, "filtered rows respect query");
  assert(count === 2, "badge count unchanged even when query narrows visible rows");
}

// ─────────────────────────────────────────────────────────────────
// 16. Badge visibility threshold: shows only when count > 0
// ─────────────────────────────────────────────────────────────────
console.log("--- 16. Badge renders only when pendingCount > 0 ---");

{
  function shouldShowBadge(count) {
    return count != null && count > 0;
  }
  assert(shouldShowBadge(0)    === false, "badge: hidden when count is 0");
  assert(shouldShowBadge(1)    === true,  "badge: shown when count is 1");
  assert(shouldShowBadge(10)   === true,  "badge: shown for double-digit count");
  assert(shouldShowBadge(null) === false, "badge: hidden when count is null (other tabs)");
  assert(shouldShowBadge(undefined) === false, "badge: hidden when count is undefined");
}

// ─────────────────────────────────────────────────────────────────
// 16b. Badge display: capped at "9+" to prevent overflow
// Bug: fixed-size w-4 h-4 (16px) cannot display 2-digit numbers
// ─────────────────────────────────────────────────────────────────
console.log("--- 16b. Badge display capped at '9+' for counts ≥ 10 ---");

{
  function badgeLabel(count) {
    return count > 9 ? "9+" : count;
  }
  assert(badgeLabel(1)  === 1,    "badge label: 1 shows as 1");
  assert(badgeLabel(9)  === 9,    "badge label: 9 shows as 9");
  assert(badgeLabel(10) === "9+", "badge label: 10 caps at '9+'");
  assert(badgeLabel(43) === "9+", "badge label: 43 caps at '9+'");
  assert(badgeLabel(99) === "9+", "badge label: 99 caps at '9+'");
}

// ─────────────────────────────────────────────────────────────────
// 16c. Approve button: requires confirm dialog before firing
// Bug: all other destructive actions (force-submit, reopen, delete)
// use confirm(), but approve previously fired immediately on click.
// ─────────────────────────────────────────────────────────────────
console.log("--- 16c. Approve button requires confirm dialog ---");

{
  let approveCallCount = 0;
  function mockAdminApprovePrediction() { approveCallCount++; }

  async function handleApprove(confirmed, formId) {
    // Mirrors the fixed onClick handler in AdminFormsTab
    if (await Promise.resolve(confirmed)) {
      mockAdminApprovePrediction(formId);
      return true;
    }
    return false;
  }

  // Confirm = true: approve fires
  approveCallCount = 0;
  const approvedYes = await handleApprove(true, "f1");
  assert(approvedYes === true, "approve: confirmed → action fires");
  assert(approveCallCount === 1, "approve: adminApprovePrediction called once on confirm");

  // Confirm = false: approve does NOT fire (regression guard)
  approveCallCount = 0;
  const approvedNo = await handleApprove(false, "f1");
  assert(approvedNo === false, "approve: cancelled → action does NOT fire");
  assert(approveCallCount === 0, "approve: adminApprovePrediction NOT called when confirm cancelled (REGRESSION guard)");
}

// ─────────────────────────────────────────────────────────────────
// 17. Static source audit: AdminFormsTab.tsx filter conditions
// ─────────────────────────────────────────────────────────────────
console.log("--- 17. Static audit: AdminFormsTab.tsx filter conditions ---");

{
  const src = readMigratedSrc("src/components/AdminFormsTab.tsx");

  // "pending" filter case exists
  assert(
    /statusFilter === "pending" && r\.status !== "pending"/.test(src),
    "static: 'pending' statusFilter case present in rows filter",
  );

  // "submitted" filter MUST NOT include "pending"
  // The old code had: r.status !== "pending" as the LAST condition (inclusion).
  // The new code must not have pending in the submitted filter block.
  // We extract the submitted filter line and confirm it only mentions submitted and approved.
  const submittedFilterLine = src.match(/statusFilter === "submitted"[^\n]*/)?.[0] || "";
  assert(
    !submittedFilterLine.includes('"pending"'),
    "static: submitted filter line does not include pending (REGRESSION guard)",
  );
  assert(
    submittedFilterLine.includes('"submitted"') && submittedFilterLine.includes('"approved"'),
    "static: submitted filter includes submitted and approved",
  );

  // FIFO sort for pending
  assert(
    /statusFilter === "pending"[\s\S]{0,200}a\.submittedAt/.test(src),
    "static: FIFO sort (a before b) applied when statusFilter is pending",
  );

  // Badge count computed from allPredictions
  assert(
    /const pendingCount/.test(src) && /p\.status === "pending"/.test(src),
    "static: pendingCount derives from pending status filter",
  );

  // Badge renders with min-w (not fixed w-4) to handle 2-digit caps
  assert(
    /min-w-4.*rounded-full/.test(src) || /rounded-full[\s\S]{0,60}min-w-4/.test(src),
    "static: badge uses min-w-4 (not fixed w-4) to prevent overflow",
  );

  // Badge display is capped at "9+" for large counts
  assert(
    /9\+/.test(src) && /count > 9/.test(src),
    "static: badge caps display at '9+' for counts over 9",
  );

  // Count shown only when > 0
  assert(
    /f\.count != null && f\.count > 0/.test(src),
    "static: badge visibility guard uses != null && > 0",
  );

  // Tab IDs include "pending"
  assert(
    /id: "pending"/.test(src) && /label:.*"ממתינים לאישור"/.test(src),
    "static: pending tab entry with correct Hebrew label present",
  );

  // approve button: renders when status === "pending" AND uses confirm()
  assert(
    /r\.status === "pending"[\s\S]{0,400}אשר/.test(src),
    "static: approve button gated on status === pending",
  );
  assert(
    /r\.status === "pending"[\s\S]{0,500}confirm\(/.test(src),
    "static: approve button uses confirm() before firing (REGRESSION guard)",
  );

  // reopen button: does NOT include pending in its condition
  const reopenLine = src.match(/r\.status === "submitted" \|\| r\.status === "approved"/)?.[0] || "";
  assert(
    reopenLine.length > 0 && !reopenLine.includes('"pending"'),
    "static: reopen button condition excludes pending (intentional: approve-only flow)",
  );
}

// ─────────────────────────────────────────────────────────────────
// 18. Static audit: AdminUsersTab.tsx submittedCount definition
//     (cross-component consistency check — this intentionally includes
//     "pending" in user stats, unlike the new "הוגשו" filter tab)
// ─────────────────────────────────────────────────────────────────
console.log("--- 18. Static audit: AdminUsersTab submittedCount includes pending ---");

{
  const src = readMigratedSrc("src/components/AdminUsersTab.tsx");
  assert(
    /submittedCount/.test(src),
    "AdminUsersTab: submittedCount defined",
  );
  assert(
    /pending/.test(src),
    "AdminUsersTab: still accounts for pending status in user stats",
  );
}

// ─────────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ─────────────────────────────────────────────────────────────────
console.log(`\n=== PENDING APPROVAL TAB: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(failed > 0 ? 1 : 0);
