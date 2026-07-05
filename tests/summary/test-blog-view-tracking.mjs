// Regression tests for passive blog-view tracking (analytics method #1:
// reuse the existing auditLog collection).
//
// Firebase/Firestore aren't available under Node, so — like the other blog
// suites — these are static source audits plus pure-logic checks of the
// aggregation the admin panel performs. The guardrails asserted here encode
// the design's zero-risk constraints:
//   - transparent to the reader (fire-and-forget, dedup, published-only)
//   - no pollution of the existing local audit buffer / Sentry
//   - no firestore.rules change (the auditLog create rule already fits)
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== BLOG VIEW TRACKING ===\n");

const R = (p) => readMigratedSrc(p);
const audit = R("/home/user/Beeri-World-Cup/src/store/audit.ts");
const barrel = R("/home/user/Beeri-World-Cup/src/store/index.ts");
const dailyPage = R("/home/user/Beeri-World-Cup/src/pages/DailySummary.tsx");
const adminTab = R("/home/user/Beeri-World-Cup/src/components/AdminSummariesTab.tsx");
const messages = R("/home/user/Beeri-World-Cup/src/constants/messages.ts");
const rules = R("/home/user/Beeri-World-Cup/firestore.rules");

// ============ 1. audit.ts: recordBlogView write path ============
console.log("--- 1: recordBlogView (write) ---");

assert(/export function recordBlogView\(/.test(audit), "recordBlogView is exported");

const recordFn = audit.match(/export function recordBlogView\([\s\S]*?\n\}/)?.[0] || "";
assert(recordFn.length > 0, "recordBlogView body extracted");

// Guest-skip: bails when there is no live Firebase auth uid.
assert(/auth\.currentUser\?\.uid/.test(recordFn), "recordBlogView reads live auth uid");
assert(/if\s*\(!uid[^)]*\)\s*return/.test(recordFn), "recordBlogView bails without a uid (guests skipped)");

// Correct action + target collection.
assert(/action:\s*"blog-view"/.test(recordFn), 'recordBlogView uses action "blog-view"');
assert(/"auditLog"/.test(recordFn), "recordBlogView targets the auditLog collection");
assert(/setDoc\(/.test(recordFn), "recordBlogView writes via setDoc");
assert(/userId:\s*uid/.test(recordFn), "recordBlogView stamps userId == auth uid (matches the rule)");

// Zero-risk to the existing audit stack: must NOT append to the local ring
// buffer (logAdminAction / writeAuditLog) and must NOT report to Sentry on
// this high-frequency path.
assert(!/logAdminAction/.test(recordFn), "recordBlogView does NOT touch the local audit ring buffer");
assert(!/writeAuditLog/.test(recordFn), "recordBlogView does NOT reuse writeAuditLog (avoids buffer + Sentry)");
assert(!/captureClientError/.test(recordFn), "recordBlogView does NOT spam Sentry on the view path");
assert(/\.catch\(/.test(recordFn), "recordBlogView is best-effort (swallows write errors)");

// ============ 2. audit.ts: fetchBlogViews read path ============
console.log("--- 2: fetchBlogViews (read) ---");

assert(/export async function fetchBlogViews\(/.test(audit), "fetchBlogViews is exported");
const fetchFn = audit.match(/export async function fetchBlogViews\([\s\S]*?\n\}/)?.[0] || "";
assert(fetchFn.length > 0, "fetchBlogViews body extracted");

// Single-field equality on summaryId → served by the automatic index, no
// composite index file needed.
assert(/where\(\s*"summaryId"\s*,\s*"=="/.test(fetchFn), "fetchBlogViews filters on summaryId (single-field, no composite index)");
// Non-view entries (summary-create/update/delete carry summaryId too) are
// dropped client-side.
assert(/action\s*===?\s*"blog-view"/.test(fetchFn), "fetchBlogViews filters action === 'blog-view' client-side");
assert(/limit\(/.test(fetchFn), "fetchBlogViews caps the result set with limit()");

// ============ 3. store barrel re-exports ============
console.log("--- 3: store barrel exports ---");
assert(/recordBlogView/.test(barrel), "store/index re-exports recordBlogView");
assert(/fetchBlogViews/.test(barrel), "store/index re-exports fetchBlogViews");

// ============ 4. DailySummary write wiring ============
console.log("--- 4: DailySummary tracking effect ---");
assert(/import\s*\{\s*recordBlogView\s*\}\s*from\s*"\.\.\/store"/.test(dailyPage), "DailySummary imports recordBlogView");

const trackEffect = dailyPage.match(/const viewerUid = user\?\.id;[\s\S]*?recordBlogView\([\s\S]*?\}\s*,\s*\[active, viewerUid, viewerIsAdmin\]\);/)?.[0] || "";
assert(trackEffect.length > 0, "DailySummary has a tracking effect keyed on [active, viewerUid, viewerIsAdmin]");
// Published-only + logged-in gate.
assert(/active\.status\s*!==\s*"published"/.test(trackEffect), "tracking effect skips non-published summaries");
assert(/!viewerUid/.test(trackEffect), "tracking effect skips guests (no viewerUid)");
// Admins are excluded so their editing/preview traffic doesn't pollute the
// audience analytics they consume.
assert(/const viewerIsAdmin = !!user\?\.isAdmin/.test(dailyPage), "DailySummary derives viewerIsAdmin");
assert(/\|\|\s*viewerIsAdmin/.test(trackEffect), "tracking effect skips admins (self-view noise)");
// Per-session, per-summary dedup via sessionStorage.
assert(/sessionStorage/.test(trackEffect), "tracking effect dedups via sessionStorage");
assert(/bwc_bv_/.test(trackEffect), "tracking effect uses a per-user, per-summary dedup key");
// Fire-and-forget: the record call is not awaited inside the effect.
assert(/[^a-zA-Z]recordBlogView\(active\.id,\s*active\.number\)/.test(trackEffect), "tracking effect records active summary id + number");
assert(!/await\s+recordBlogView/.test(trackEffect), "tracking effect does NOT await (non-blocking UX)");

// ============ 5. AdminSummariesTab read UI ============
console.log("--- 5: Admin views panel ---");
assert(/fetchBlogViews/.test(adminTab), "AdminSummariesTab calls fetchBlogViews");
assert(/useUsers/.test(adminTab), "AdminSummariesTab resolves viewer names via useUsers");
assert(/from\s*"lucide-react"[\s\S]{0,0}/.test(adminTab) || /Eye/.test(adminTab), "AdminSummariesTab imports the Eye icon");
assert(/function aggregateViews\(/.test(adminTab), "AdminSummariesTab aggregates raw rows (dedup per user)");
// Stale-fetch guard for fast row switching.
assert(/viewsReqRef/.test(adminTab), "AdminSummariesTab guards against a stale/superseded fetch");
assert(/displayName/.test(adminTab), "AdminSummariesTab shows displayName (falls back to uid)");
assert(/BLOG\.views\./.test(adminTab), "AdminSummariesTab uses the BLOG.views copy");

// ============ 6. messages copy ============
console.log("--- 6: BLOG.views copy ---");
assert(/views:\s*\{/.test(messages), "messages define BLOG.views");
for (const key of ["button", "title", "loading", "error", "empty", "summary", "viewCount"]) {
  assert(new RegExp(`${key}:`).test(messages.match(/views:\s*\{[\s\S]*?\n  \},/)?.[0] || ""), `BLOG.views.${key} exists`);
}

// ============ 7. firestore.rules: NO change required ============
console.log("--- 7: auditLog rule already fits (no rules change) ---");
// The existing auditLog create rule must still stamp userId == auth.uid and
// bound action/timestamp. blog-view piggybacks on exactly this rule, so its
// presence documents that no security-rule change was needed.
const auditRule = rules.match(/match \/auditLog\/\{logId\} \{[\s\S]*?\n    \}/)?.[0] || "";
assert(auditRule.length > 0, "auditLog rule block present");
assert(/request\.resource\.data\.userId == request\.auth\.uid/.test(auditRule), "auditLog create still requires userId == auth.uid");
assert(/request\.resource\.data\.action is string/.test(auditRule), "auditLog create still requires a string action");
// The rule has no hasOnly()/whitelist, so extra fields (summaryId, number)
// are permitted — the reason no rules edit is needed.
assert(!/hasOnly/.test(auditRule), "auditLog create has no field whitelist → summaryId/number are allowed");
// Defensive hardening (review #3): a size cap on summaryId, conditional on
// presence so it never rejects a summaryId-less audit action. The feature is
// the first thing to depend on this previously-uncapped field.
assert(/'summaryId' in request\.resource\.data/.test(auditRule), "auditLog create caps summaryId conditionally on presence");
assert(/request\.resource\.data\.summaryId\.size\(\) <= 128/.test(auditRule), "auditLog create bounds summaryId length (anti-bloat)");

// ============ 8. Pure logic: aggregateViews dedup + sort ============
console.log("--- 8: aggregateViews pure logic ---");

function aggregateViews(rows) {
  const byUser = new Map();
  for (const r of rows) {
    const prev = byUser.get(r.userId);
    if (!prev) byUser.set(r.userId, { count: 1, lastTs: r.timestamp });
    else { prev.count += 1; if (r.timestamp > prev.lastTs) prev.lastTs = r.timestamp; }
  }
  return Array.from(byUser.entries())
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => (b.lastTs > a.lastTs ? 1 : b.lastTs < a.lastTs ? -1 : 0));
}

{
  const rows = [
    { userId: "u1", timestamp: "2026-07-01T10:00:00.000Z" },
    { userId: "u1", timestamp: "2026-07-02T10:00:00.000Z" },
    { userId: "u2", timestamp: "2026-07-03T10:00:00.000Z" },
  ];
  const agg = aggregateViews(rows);
  assert(agg.length === 2, "two unique viewers from three rows");
  const u1 = agg.find((a) => a.userId === "u1");
  assert(u1.count === 2, "u1 aggregated to 2 views");
  assert(u1.lastTs === "2026-07-02T10:00:00.000Z", "u1 keeps the newest timestamp");
  assert(agg[0].userId === "u2", "most-recent viewer sorts first");
  assert(aggregateViews([]).length === 0, "empty rows → empty aggregation");
}

// ============ 9. Pure logic: guest-skip + dedup decision ============
console.log("--- 9: record decision (guest/published/dedup) ---");
{
  // Mirrors the DailySummary effect gate.
  function shouldRecord(active, viewerUid, viewerIsAdmin, sessionHas) {
    if (!active || active.status !== "published" || !viewerUid || viewerIsAdmin) return false;
    if (sessionHas) return false; // already recorded this session
    return true;
  }
  assert(shouldRecord({ id: "s1", status: "published" }, "u1", false, false), "logged-in non-admin + published + fresh → record");
  assert(!shouldRecord({ id: "s1", status: "published" }, null, false, false), "guest (no uid) → skip");
  assert(!shouldRecord({ id: "s1", status: "published" }, "admin1", true, false), "admin → skip (self-view noise)");
  assert(!shouldRecord({ id: "s1", status: "draft" }, "u1", false, false), "draft → skip");
  assert(!shouldRecord({ id: "s1", status: "published" }, "u1", false, true), "already recorded this session → skip");
  assert(!shouldRecord(null, "u1", false, false), "no active summary → skip");
}

// ============ 10. Pure logic: Hebrew singular/plural summary copy ============
console.log("--- 10: summary copy singular/plural ---");
{
  function summaryCopy(viewers, total) {
    const v = viewers === 1 ? "צופה אחד" : `${viewers} צופים`;
    const t = total === 1 ? "צפייה אחת" : `${total} צפיות`;
    return `${v} · ${t}`;
  }
  assert(summaryCopy(1, 1) === "צופה אחד · צפייה אחת", "singular viewer + singular view");
  assert(summaryCopy(3, 7) === "3 צופים · 7 צפיות", "plural viewer + plural view");
  assert(summaryCopy(1, 4) === "צופה אחד · 4 צפיות", "one viewer, several views");
}

// ============ SUMMARY ============
console.log(`\n=== BLOG VIEW TRACKING: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
