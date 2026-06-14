// Blog/summary repo.
//
// Owns:
//   - Read accessors: getSummaries, isSummariesReady, getSummary,
//     getPublishedSummariesSorted, getLatestPublishedSummary,
//     getSummaryByNumber, getCoveredMatchIds.
//   - Reservation: reserveNextSummaryNumber (read-then-allocate; rare-
//     contention path, see comment on the function).
//   - Validation: SUMMARY_LIMITS + validateSummaryPayload (mirrors
//     firestore.rules `validSummaryShape` so we fail fast client-side
//     before the server rejects an oversized payload).
//   - CRUD: createSummary, updateSummary, publishSummary,
//     unpublishSummary, deleteSummary. All admin-gated via
//     requireAdmin (Firestore rules are the real security layer).

import {
  addDoc,
  deleteDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { captureClientError } from "../sentry";
import {
  summariesCollectionRef,
  summaryDocRef,
  withTimeout,
} from "./firestoreClient";
import { cache, notifyAndEmit } from "./cache";
import { writeAuditLog } from "./audit";
import { getCurrentUser, requireAdmin } from "./usersRepo";

const EMPTY_SUMMARIES: Record<string, any> = {};

export function getSummaries() {
  return cache.summaries || EMPTY_SUMMARIES;
}

// Whether the summaries listener has fired at least once (success OR
// permission-denied — both flip the flag). Distinguishes "we haven't asked
// the server yet" from "we asked and the result is empty", which matters
// for the public blog page so a guest viewer doesn't briefly see "אין עדיין
// סיכומים" while the listener is mid-flight.
export function isSummariesReady() {
  return !!cache._ready.summaries;
}

export function getSummary(summaryId: string) {
  return getSummaries()[summaryId] || null;
}

// Returns published summaries ordered by `number` ascending.
export function getPublishedSummariesSorted() {
  return (Object.values(getSummaries()) as any[])
    .filter((s) => s.status === "published")
    .sort((a, b) => (a.number || 0) - (b.number || 0));
}

// Returns the latest published summary (highest `number`), or null.
export function getLatestPublishedSummary() {
  const sorted = getPublishedSummariesSorted();
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

// Finds a summary by its sequential number (string or number).
export function getSummaryByNumber(n: any) {
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  return (Object.values(getSummaries()) as any[]).find((s) => s.number === num) || null;
}

// Compute the union of matchIds already referenced in any summary (drafts + published).
export function getCoveredMatchIds() {
  const covered = new Set<string>();
  for (const sAny of Object.values(getSummaries())) {
    const s = sAny as any;
    for (const mid of s.coveredMatchIds || []) covered.add(mid);
  }
  return covered;
}

// Reserve the next summary number by reading the current max from the
// server. The Firestore client SDK's Transaction.get() only accepts a
// DocumentReference (queries are Admin-SDK only), so a transactional
// read-by-query isn't possible here. Concurrent admin writes are rare;
// if collisions become a real concern, switch to a counter document.
async function reserveNextSummaryNumber() {
  const snap = await getDocs(
    query(summariesCollectionRef, orderBy("number", "desc"), limit(1)),
  );
  const maxNumber = snap.empty ? 0 : Number((snap.docs[0].data() as any)?.number || 0);
  return Math.max(0, Number.isFinite(maxNumber) ? maxNumber : 0) + 1;
}

const DEFAULT_SUMMARY = {
  title: "",
  subtitle: "",
  intro: "",
  conclusion: "",
  coveredMatchIds: [] as string[],
  matchNotes: {} as Record<string, string>,
  status: "draft",
};

// Mirror of firestore.rules validSummaryShape sizes. A client-side check
// fails fast with a user-friendly error before the Firestore rule rejects.
export const SUMMARY_LIMITS = {
  title: 300,
  subtitle: 500,
  intro: 20000,
  conclusion: 20000,
  coveredMatchIds: 40,
  matchNotes: 40,
  matchNoteText: 5000,
};

function validateSummaryPayload(p: any) {
  if (typeof p.title === "string" && p.title.length > SUMMARY_LIMITS.title)
    return `הכותרת ארוכה מדי (מקסימום ${SUMMARY_LIMITS.title} תווים)`;
  if (typeof p.subtitle === "string" && p.subtitle.length > SUMMARY_LIMITS.subtitle)
    return `תת-הכותרת ארוכה מדי (מקסימום ${SUMMARY_LIMITS.subtitle} תווים)`;
  if (typeof p.intro === "string" && p.intro.length > SUMMARY_LIMITS.intro)
    return `ההקדמה ארוכה מדי (מקסימום ${SUMMARY_LIMITS.intro} תווים)`;
  if (typeof p.conclusion === "string" && p.conclusion.length > SUMMARY_LIMITS.conclusion)
    return `הסיכום ארוך מדי (מקסימום ${SUMMARY_LIMITS.conclusion} תווים)`;
  if (Array.isArray(p.coveredMatchIds) && p.coveredMatchIds.length > SUMMARY_LIMITS.coveredMatchIds)
    return `יותר מדי משחקים (מקסימום ${SUMMARY_LIMITS.coveredMatchIds})`;
  if (p.matchNotes && Object.keys(p.matchNotes).length > SUMMARY_LIMITS.matchNotes)
    return `יותר מדי הערות למשחקים (מקסימום ${SUMMARY_LIMITS.matchNotes})`;
  if (p.matchNotes) {
    for (const [mid, note] of Object.entries(p.matchNotes)) {
      if (typeof note === "string" && note.length > SUMMARY_LIMITS.matchNoteText)
        return `הערה למשחק ${mid} ארוכה מדי (מקסימום ${SUMMARY_LIMITS.matchNoteText} תווים)`;
    }
  }
  return null;
}

/**
 * Create a new summary (draft). Returns the new document id.
 * Auto-assigns the next sequential `number`.
 */
export async function createSummary(fields: Record<string, any> = {}) {
  if (!requireAdmin()) return null;
  const sizeErr = validateSummaryPayload(fields);
  if (sizeErr) {
    console.warn("createSummary size validation:", sizeErr);
    throw new Error(sizeErr);
  }
  try {
    const nextNumber = await withTimeout(reserveNextSummaryNumber(), 10000);
    const now = new Date().toISOString();
    const payload = {
      ...DEFAULT_SUMMARY,
      ...fields,
      number: nextNumber,
      status: "draft",
      authorUid: getCurrentUser()?.id || null,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await withTimeout(addDoc(summariesCollectionRef, payload), 10000);
    cache.summaries = { ...cache.summaries, [ref.id]: { id: ref.id, ...payload } };
    notifyAndEmit("summaries");
    writeAuditLog("summary-create", { summaryId: ref.id, number: payload.number });
    return ref.id;
  } catch (err: any) {
    console.error("Failed to create summary:", err);
    captureClientError(err, { source: "createSummary", code: err?.code });
    return null;
  }
}

/**
 * Update an existing summary's fields. `fields.status` can be omitted;
 * pass "published" / "draft" to change visibility.
 */
export async function updateSummary(summaryId: string, fields: Record<string, any> = {}) {
  if (!requireAdmin()) return false;
  const existing = getSummary(summaryId) as any;
  if (!existing) return false;
  const now = new Date().toISOString();
  // `id`, `number`, `authorUid`, and `createdAt` are never mutated after creation.
  const {
    id: _dropId,
    number: _dropNumber,
    authorUid: _dropAuthor,
    createdAt: _dropCreated,
    ...safeFields
  }: Record<string, any> = fields;
  // Sanity: status must stay on the allowed set if provided.
  const SUMMARY_STATUSES: readonly SummaryStatus[] = ["draft", "published"];
  if (
    safeFields.status != null &&
    !SUMMARY_STATUSES.includes(safeFields.status)
  ) {
    console.warn(`Invalid summary status: ${safeFields.status}`);
    return false;
  }
  const sizeErr = validateSummaryPayload(safeFields);
  if (sizeErr) {
    console.warn("updateSummary size validation:", sizeErr);
    throw new Error(sizeErr);
  }
  const patch: Record<string, any> = { ...safeFields, updatedAt: now };
  if (fields.status === "published" && existing.status !== "published") {
    patch.publishedAt = now;
  }
  try {
    await withTimeout(updateDoc(summaryDocRef(summaryId), patch), 10000);
    cache.summaries = {
      ...cache.summaries,
      [summaryId]: { ...existing, ...patch },
    };
    notifyAndEmit("summaries");
    writeAuditLog("summary-update", {
      summaryId,
      number: existing.number,
      status: patch.status || existing.status,
    });
    return true;
  } catch (err: any) {
    console.error("Failed to update summary:", err);
    captureClientError(err, { source: "updateSummary", summaryId, code: err?.code });
    // Surface permission-denied / timeout with a user-friendly Hebrew
    // message rather than the generic "שמירה נכשלה".
    if (err?.code === "permission-denied") {
      throw new Error("אין הרשאה לשמור — ייתכן שההרשאות שלך עודכנו. רענן את הדף.");
    }
    if (err?.message === "timeout") {
      throw new Error("השמירה לא הושלמה בזמן — בדוק את החיבור ונסה שוב.");
    }
    return false;
  }
}

export async function publishSummary(summaryId: string) {
  return updateSummary(summaryId, { status: "published" });
}

export async function unpublishSummary(summaryId: string) {
  return updateSummary(summaryId, { status: "draft" });
}

export async function deleteSummary(summaryId: string) {
  if (!requireAdmin()) return false;
  const existing = getSummary(summaryId) as any;
  if (!existing) return false;
  try {
    await withTimeout(deleteDoc(summaryDocRef(summaryId)), 10000);
    const next = { ...cache.summaries };
    delete next[summaryId];
    cache.summaries = next;
    notifyAndEmit("summaries");
    writeAuditLog("summary-delete", {
      summaryId,
      number: existing.number,
    });
    return true;
  } catch (err: any) {
    console.error("Failed to delete summary:", err);
    captureClientError(err, { source: "deleteSummary", summaryId, code: err?.code });
    return false;
  }
}
