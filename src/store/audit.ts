// Audit log glue between storeAudit (the local ring buffer) and Firestore
// (the forensic mirror).
//
// `logAdminAction` and `getAuditLog` are thin re-binds that supply the live
// Firebase auth uid (rather than letting storeAudit guess from a possibly-
// stale localStorage cache, which can be spoofed on a shared device).
//
// `writeAuditLog` does both: it appends to the local buffer AND fires a
// best-effort Firestore write. Failures are swallowed (the buffer is the
// primary source of truth).

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firestoreClient";
import { captureClientError } from "../sentry";
import {
  logAdminAction as logAdminActionToBuffer,
  getAuditLog as getAuditLogFromBuffer,
} from "../storeAudit";

export function logAdminAction(action: string, details: Record<string, any> = {}) {
  return logAdminActionToBuffer(action, details, auth.currentUser?.uid || null);
}

export function getAuditLog() {
  return getAuditLogFromBuffer();
}

export function writeAuditLog(action: string, details: Record<string, any> = {}) {
  const entry = logAdminAction(action, details);
  if (!entry) return;
  // Also persist to Firestore for forensic recovery beyond a single device.
  const auditRef = doc(
    db,
    "auditLog",
    `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  setDoc(auditRef, entry).catch((err) => {
    console.error("Audit log write failed:", err);
    captureClientError(err, { source: "auditLog.setDoc", action });
  });
}

// ---- Blog-view tracking (analytics #1: reuse the auditLog collection) ----
//
// Records a passive "who read the blog" signal. Design constraints:
//   - TRANSPARENT: fired from an effect after render, best-effort, never
//     blocks or awaits — the reader notices nothing.
//   - ZERO risk to existing audit features: unlike writeAuditLog, this does
//     NOT touch the local ring buffer (storeAudit) and does NOT report to
//     Sentry. blog-view is a high-frequency signal; polluting the 200-entry
//     forensic buffer or the Sentry stream with it would degrade both.
//   - NO firestore.rules change: the auditLog `create` rule already accepts
//     any authed user writing their own uid + a string action + timestamp,
//     and permits extra fields (summaryId/number) because it has no hasOnly.
//   - GUESTS are skipped: public-readonly blog viewers have no Firebase auth
//     uid, so the rule would reject the write. We bail before writing rather
//     than emit an expected permission-denied.
export function recordBlogView(summaryId: string, number: number) {
  const uid = auth.currentUser?.uid;
  if (!uid || !summaryId) return;
  const entry = {
    action: "blog-view",
    summaryId,
    // `number` is not read back by the admin panel (which keys off summaryId);
    // it's stored for forensic readability — a raw auditLog row tells you which
    // post was read without a join back into the summaries collection.
    number: typeof number === "number" ? number : null,
    userId: uid,
    timestamp: new Date().toISOString(),
  };
  const ref = doc(
    db,
    "auditLog",
    `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  setDoc(ref, entry).catch((err) => {
    // Best-effort telemetry — swallow quietly. Intentionally NOT sent to
    // Sentry (see note above): an offline reader or a transient failure on
    // this path is expected and must not create alert noise.
    console.debug?.("blog-view record failed:", err?.code || err);
  });
}

export interface BlogViewRow {
  userId: string;
  timestamp: string;
}

// Admin-only read: fetch every blog-view entry for one summary. The auditLog
// `read` rule is admin-gated, so only an admin can resolve this. We filter on
// `summaryId` (a single-field equality → served by the automatic index, no
// composite index needed) and then drop non-view entries client-side, because
// the admin summary CRUD actions (summary-create/update/delete) also carry a
// `summaryId` field.
//
// The query is intentionally UNORDERED to stay index-free (this repo does not
// manage Firestore composite indexes; adding `orderBy` would need one and would
// fail closed until it's built). limit(2000) is the ceiling: per-summary rows =
// unique viewers × their session revisits of that post, which stays well under
// 2000 at this app's scale (a friends' pool). If a post ever exceeds it, the
// admin sees an arbitrary 2000-row slice — add a `timestamp desc` composite
// index + orderBy at that point. Rows are sorted newest-first for display by
// the caller (aggregateViews).
export async function fetchBlogViews(summaryId: string): Promise<BlogViewRow[]> {
  if (!summaryId) return [];
  const snap = await getDocs(
    query(
      collection(db, "auditLog"),
      where("summaryId", "==", summaryId),
      limit(2000),
    ),
  );
  const rows: BlogViewRow[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;
    if (data?.action === "blog-view" && typeof data.userId === "string") {
      rows.push({ userId: data.userId, timestamp: data.timestamp || "" });
    }
  });
  return rows;
}
