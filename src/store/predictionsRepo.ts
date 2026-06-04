// Per-form predictions repo.
//
// Owns:
//   - userFormIndex: O(1) `userId -> Set<formId>` lookup. Rebuilt by the
//     predictions listener after every snapshot.
//   - writeFormDoc / debouncedWriteForm / flushPendingWrites: optimistic
//     write paths with permission-denied revert + token-refresh + a
//     visibilitychange-driven flush.
//   - getAllPredictions / getFormsForUser / getForm: read accessors.
//   - createForm / deleteForm / updateFormDetails / savePrediction /
//     savePredictionsBatch / saveBonusPrediction / submitPredictions /
//     reopenForm: user-facing CRUD.
//   - admin* mutators: admin-only paths that write through writeFormDoc.

import {
  deleteDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { captureClientError } from "../sentry";
import { generateDefaultFormName } from "../utils/formNameGenerator";
import { MAX_FORMS_PER_USER as FORMS_LIMIT } from "../utils/constants";
import {
  db,
  formDocRef,
  withTimeout,
  safeClone,
  maybeRefreshToken,
} from "./firestoreClient";
import {
  cache,
  notifyAndEmit,
  emitSaving,
  emitSaved,
  emitWriteError,
} from "./cache";
import { writeAuditLog } from "./audit";
import { getUser, getUsers, requireAdmin } from "./usersRepo";
import { planFormTransfer } from "./transferPlan";

// ============ FORM INDEX ============
//
// userId -> Set<formId> for O(1) per-user lookup. Rebuilt by the
// predictions listener after every snapshot.

const userFormIndex: Record<string, Set<string>> = {};

export function rebuildUserFormIndex() {
  for (const key of Object.keys(userFormIndex)) delete userFormIndex[key];
  for (const [formId, dataAny] of Object.entries(cache.predictions || {})) {
    const data = dataAny as any;
    const uid = data?.userId;
    if (uid) {
      if (!userFormIndex[uid]) userFormIndex[uid] = new Set();
      userFormIndex[uid].add(formId);
    }
  }
}

export function indexAddForm(formId: string, userId: string) {
  if (!userId) return;
  if (!userFormIndex[userId]) userFormIndex[userId] = new Set();
  userFormIndex[userId].add(formId);
}

export function indexRemoveForm(formId: string, userId: string) {
  if (!userId || !userFormIndex[userId]) return;
  userFormIndex[userId].delete(formId);
  if (userFormIndex[userId].size === 0) delete userFormIndex[userId];
}

// ============ READ ACCESSORS ============

const EMPTY_OBJ: Record<string, any> = {};

export function getAllPredictions() {
  return cache.predictions || EMPTY_OBJ;
}

const DEFAULT_FORM = {
  matches: {} as Record<string, any>,
  advancing: {} as Record<string, any>,
  champion: null as string | null,
  topScorer: "",
  status: "draft",
};

export function getFormsForUser(userId: string) {
  const all = getAllPredictions();
  const formIds = userFormIndex[userId];
  if (!formIds || formIds.size === 0) return [];
  const forms: any[] = [];
  for (const formId of formIds) {
    const data = all[formId];
    if (data) forms.push({ formId, ...data });
  }
  forms.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return forms;
}

export function getForm(formId: string) {
  const all = getAllPredictions();
  return all[formId] || null;
}

const ACTIVE_FORM_KEY = "wc2026_activeForm";
function getActiveFormId() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_FORM_KEY) || "null") || null; } catch { return null; }
}

// settings.predictionsLocked guard — accessed via cache directly so we
// don't add a circular dep on a settingsRepo.
function predictionsLocked() {
  return !!cache.settings?.predictionsLocked;
}

// ============ OPTIMISTIC WRITE INTERNALS ============

// Reverts cache.predictions[formId] back to a pre-write snapshot. Only used
// for terminal errors (`permission-denied`) where the listener will never
// auto-correct, since the server rejected the change and nothing changed
// upstream to broadcast back. Transient errors (network/timeout) are left
// alone so the listener's eventual snapshot can resolve them.
function revertOptimisticForm(formId: string, snapshot: any) {
  const next = { ...cache.predictions };
  if (snapshot === undefined) {
    delete next[formId];
  } else {
    next[formId] = snapshot;
  }
  cache.predictions = next;
  notifyAndEmit("predictions");
}

async function writeFormDoc(formId: string, formData: any) {
  const prevSnapshot = cache.predictions?.[formId];
  cache.predictions = { ...cache.predictions, [formId]: formData };
  notifyAndEmit("predictions");
  emitSaving("predictions");
  try {
    await withTimeout(
      setDoc(formDocRef(formId), safeClone(formData)),
      10000,
    );
    emitSaved("predictions");
    return true;
  } catch (err: any) {
    console.error(`Failed to write form ${formId}:`, err);
    if (err?.code === "permission-denied") {
      revertOptimisticForm(formId, prevSnapshot);
    }
    emitWriteError("predictions", err);
    captureClientError(err, { source: "writeFormDoc", formId, code: err?.code });
    await maybeRefreshToken(err);
    return false;
  }
}

const pendingWrites: Record<string, ReturnType<typeof setTimeout>> = {};

function debouncedWriteForm(formId: string, formData: any, delay = 500) {
  // Block writes immediately if predictions are locked
  if (predictionsLocked()) return;
  const prevSnapshot = cache.predictions?.[formId];
  cache.predictions = { ...cache.predictions, [formId]: formData };
  notifyAndEmit("predictions");
  emitSaving("predictions");
  const key = `form:${formId}`;
  clearTimeout(pendingWrites[key]);
  pendingWrites[key] = setTimeout(() => {
    delete pendingWrites[key];
    if (predictionsLocked()) return; // double-check at write time
    setDoc(formDocRef(formId), safeClone(formData))
      .then(() => emitSaved("predictions"))
      .catch((err: any) => {
        console.error(`Failed to write form ${formId}:`, err);
        if (err?.code === "permission-denied") {
          // Only revert if the cache still matches what we tried to write —
          // otherwise the user has typed since, and we'd discard their
          // latest edits. The listener will eventually reconcile any
          // transient errors that fall through this guard.
          if (cache.predictions?.[formId] === formData) {
            revertOptimisticForm(formId, prevSnapshot);
          }
        }
        emitWriteError("predictions", err);
        captureClientError(err, {
          source: "debouncedWriteForm",
          formId,
          code: err?.code,
        });
        maybeRefreshToken(err);
      });
  }, delay);
}

export function clearPendingWritesForForm(formId: string) {
  const key = `form:${formId}`;
  if (pendingWrites[key]) {
    clearTimeout(pendingWrites[key]);
    delete pendingWrites[key];
  }
}

export function flushPendingWrites() {
  for (const key of Object.keys(pendingWrites)) {
    clearTimeout(pendingWrites[key]);
    delete pendingWrites[key];
    try {
      if (key.startsWith("form:")) {
        const formId = key.slice(5);
        const data = safeClone(cache.predictions[formId]);
        if (data) {
          setDoc(formDocRef(formId), data).catch((err) =>
            console.error(`Failed to flush ${key}:`, err),
          );
        }
      }
    } catch (err) {
      console.error(`Failed to clone for flush ${key}:`, err);
    }
  }
}

export function hasPendingWrites() {
  return Object.keys(pendingWrites).length > 0;
}

// ============ ACTIVE FORM (local per-browser) ============

import { broadcastActiveFormChange } from "./cache";

export function setActiveFormId(formId: string | null) {
  localStorage.setItem(ACTIVE_FORM_KEY, JSON.stringify(formId));
  notifyAndEmit("activeForm");
  broadcastActiveFormChange();
}
export { getActiveFormId };

// ============ USER-FACING FORM CRUD ============

const MAX_FORMS_PER_USER = FORMS_LIMIT;

export function createForm(userId: string, formName?: string) {
  if (predictionsLocked()) {
    throw new Error("ההגשה נסגרה — לא ניתן ליצור טפסים חדשים");
  }
  const userForms = getFormsForUser(userId);
  if (userForms.length >= MAX_FORMS_PER_USER) {
    throw new Error(`מקסימום ${MAX_FORMS_PER_USER} טפסים למשתמש`);
  }
  const formId = `${userId}__${Date.now()}`;
  const user = getUser(userId) as any;
  const defaultName = generateDefaultFormName({
    nickname: user?.displayName,
    userForms,
    allPredictions: cache.predictions,
  });

  const formData = {
    userId,
    formName: typeof formName === "string" && formName.trim() ? formName : defaultName,
    budgetNumber: "",
    ...DEFAULT_FORM,
    createdAt: new Date().toISOString(),
  };
  indexAddForm(formId, userId);
  writeFormDoc(formId, formData);
  setActiveFormId(formId);
  return formId;
}

export async function deleteForm(formId: string) {
  const form = getForm(formId) as any;
  if (!form || (form.status !== "draft" && form.status !== "pending")) return;

  clearPendingWritesForForm(formId);
  indexRemoveForm(formId, form.userId);
  const newPreds = { ...cache.predictions };
  delete newPreds[formId];
  cache.predictions = newPreds;
  notifyAndEmit("predictions");

  await deleteDoc(formDocRef(formId));

  if (getActiveFormId() === formId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    notifyAndEmit("activeForm");
  }
}

export function updateFormDetails(formId: string, fields: Record<string, any>) {
  if (predictionsLocked()) return;
  const form = getForm(formId) as any;
  if (!form || form.status !== "draft") return;
  const updated = { ...form, ...fields };
  debouncedWriteForm(formId, updated);
}

export function savePrediction(formId: string, matchId: string, prediction: any) {
  if (predictionsLocked()) return;
  const form = getForm(formId) as any;
  if (!form || form.status !== "draft") return;
  const updated = {
    ...form,
    matches: { ...form.matches, [matchId]: prediction },
    updatedAt: new Date().toISOString(),
  };
  debouncedWriteForm(formId, updated);
}

export function savePredictionsBatch(formId: string, matchPredictions: Record<string, any>) {
  if (predictionsLocked()) return;
  const form = getForm(formId) as any;
  if (!form || form.status !== "draft") return;
  const updated = {
    ...form,
    matches: { ...form.matches, ...matchPredictions },
    updatedAt: new Date().toISOString(),
  };
  // Use writeFormDoc (not debounced) for immediate batch write
  writeFormDoc(formId, updated);
}

export function saveBonusPrediction(formId: string, field: string, value: any) {
  if (predictionsLocked()) return;
  const form = getForm(formId) as any;
  if (!form || form.status !== "draft") return;
  const updated = {
    ...form,
    [field]: value,
    updatedAt: new Date().toISOString(),
  };
  debouncedWriteForm(formId, updated);
}

export function submitPredictions(formId: string) {
  if (predictionsLocked()) return;
  flushPendingWrites();
  const form = getForm(formId) as any;
  if (!form) return;
  const updated = {
    ...form,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };
  writeFormDoc(formId, updated);
}

export function reopenForm(formId: string) {
  if (predictionsLocked()) return;
  const form = getForm(formId) as any;
  if (!form) return;
  // Users may reopen their own pending or submitted forms back to draft as
  // long as the tournament isn't locked. Firestore rules enforce the same.
  if (form.status !== "pending" && form.status !== "submitted") return;
  const updated = {
    ...form,
    status: "draft",
    reopenedAt: new Date().toISOString(),
  };
  writeFormDoc(formId, updated);
}

// ============ ADMIN MUTATORS ============

export function adminApprovePrediction(formId: string) {
  if (!requireAdmin()) return;
  writeAuditLog("approve-form", { formId });
  const form = getForm(formId) as any;
  if (!form || form.status !== "pending") return;
  writeFormDoc(formId, {
    ...form,
    status: "submitted",
    approvedAt: new Date().toISOString(),
  });
}

export function adminForceSubmitForm(formId: string) {
  if (!requireAdmin()) return;
  writeAuditLog("force-submit", { formId });
  flushPendingWrites();
  const form = getForm(formId) as any;
  if (!form) return;
  const now = new Date().toISOString();
  writeFormDoc(formId, {
    ...form,
    status: "submitted",
    submittedAt: now,
    adminSubmittedAt: now,
  });
}

export function adminReopenForm(formId: string) {
  if (!requireAdmin()) return;
  writeAuditLog("reopen-form", { formId });
  flushPendingWrites();
  const form = getForm(formId) as any;
  if (!form) return;
  const now = new Date().toISOString();
  writeFormDoc(formId, {
    ...form,
    status: "draft",
    reopenedAt: now,
    adminReopenedAt: now,
  });
}

export async function adminDeleteForm(formId: string) {
  if (!requireAdmin()) return false;
  writeAuditLog("delete-form", { formId });
  flushPendingWrites();
  emitSaving("predictions");
  try {
    await deleteDoc(formDocRef(formId));
  } catch (err: any) {
    console.error(`adminDeleteForm failed for ${formId}:`, err);
    emitWriteError("predictions", err);
    captureClientError(err, { source: "adminDeleteForm", formId, code: err?.code });
    return false;
  }
  // Only update cache after successful delete
  const newPreds = { ...cache.predictions };
  delete newPreds[formId];
  cache.predictions = newPreds;
  emitSaved("predictions");
  notifyAndEmit("predictions");
  if (getActiveFormId() === formId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    notifyAndEmit("activeForm");
  }
  return true;
}

export function adminUpdateForm(formId: string, fields: Record<string, any>) {
  if (!requireAdmin()) return;
  flushPendingWrites();
  const form = getForm(formId) as any;
  if (!form) return;
  // userId is immutable — never allow reassignment even by admin
  const { userId: _drop, ...safeFields } = fields;
  const updated: Record<string, any> = {
    ...form,
    ...safeFields,
    updatedAt: new Date().toISOString(),
  };
  if (fields.adminNote != null) {
    updated.adminEditedAt = new Date().toISOString();
  }
  writeFormDoc(formId, updated);
}

export function adminSaveMatchPrediction(formId: string, matchId: string, prediction: any) {
  if (!requireAdmin()) return;
  flushPendingWrites();
  const form = getForm(formId) as any;
  if (!form) return;
  writeFormDoc(formId, {
    ...form,
    matches: { ...form.matches, [matchId]: prediction },
    updatedAt: new Date().toISOString(),
  });
}

// Transfer ownership of ONE form from its current owner to `targetUid`.
//
// Ownership is determined SOLELY by the `userId` field (userFormIndex,
// leaderboard, "my forms" all key off it — nothing parses the formId
// prefix). But changing `userId` in place is blocked by both firestore.rules
// (update requires userId stay equal) and adminUpdateForm. So we DELETE the
// old doc and CREATE a fresh one under a B-prefixed formId with userId=B —
// the admin branch of `allow create`/`allow delete` permits this with no
// rules change, even while the tournament is locked.
//
// The whole form body travels verbatim (status / submittedAt / approvedAt /
// matches / topScorer / adminNote / …) so scoring + lifecycle continuity is
// preserved; only `userId` is overridden. This is a MOVE — A loses the form.
//
// Returns { ok, newFormId? , error? }.
export async function adminTransferForm(oldFormId: string, targetUid: string) {
  if (!requireAdmin()) return { ok: false, error: "not-admin" };
  // Re-read the form from the live cache (the caller passes only an id, so a
  // double-click after the first transfer safely no-ops here on null). The
  // pure planner owns validation + formId generation + the field-preserving
  // copy (see transferPlan.ts) so that logic is unit-tested directly.
  const form = getForm(oldFormId) as any;
  const plan = planFormTransfer(form, targetUid, getUsers());
  if ("error" in plan) return { ok: false, error: plan.error };
  if ("noop" in plan) return { ok: true, newFormId: oldFormId };
  const { fromUid, newFormId, newData } = plan;

  // Kill any pending debounced write for the old form so a late timer can't
  // resurrect the doc after we delete it. (Debounced writes already mirror
  // into cache.predictions, so `form` above holds the latest edits.)
  clearPendingWritesForForm(oldFormId);

  emitSaving("predictions");
  const batch = writeBatch(db);
  batch.set(formDocRef(newFormId), safeClone(newData));
  batch.delete(formDocRef(oldFormId));
  try {
    await withTimeout(batch.commit(), 10000);
  } catch (err: any) {
    console.error(`adminTransferForm failed (${oldFormId} -> ${targetUid}):`, err);
    emitWriteError("predictions", err);
    captureClientError(err, {
      source: "adminTransferForm",
      oldFormId,
      newFormId,
      code: err?.code,
    });
    await maybeRefreshToken(err);
    return { ok: false, error: err?.code || "commit-failed" };
  }

  // Commit succeeded — mutate off the LIVE cache reference (a showAll
  // listener snapshot may have fired during the await; don't clobber it with
  // a pre-commit copy). Mirror adminDeleteForm's post-await pattern.
  const next = { ...cache.predictions };
  delete next[oldFormId];
  next[newFormId] = newData;
  cache.predictions = next;
  rebuildUserFormIndex();
  emitSaved("predictions");
  notifyAndEmit("predictions");

  writeAuditLog("transfer-form", {
    fromUid,
    toUid: targetUid,
    oldFormId,
    newFormId,
  });

  // Clear a stale active-form pointer on THIS device (the owner's other
  // devices self-heal: the filtered listener drops the old doc and Predict
  // clears the pointer when it no longer maps to an owned form).
  if (getActiveFormId() === oldFormId) {
    localStorage.removeItem(ACTIVE_FORM_KEY);
    notifyAndEmit("activeForm");
  }

  return { ok: true, newFormId };
}
