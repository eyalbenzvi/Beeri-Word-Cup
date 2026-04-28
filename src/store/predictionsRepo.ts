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
} from "firebase/firestore";
import { captureClientError } from "../sentry";
import { generateDefaultFormName } from "../utils/formNameGenerator";
import { MAX_FORMS_PER_USER as FORMS_LIMIT } from "../utils/constants";
import {
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
import { getUser, requireAdmin } from "./usersRepo";

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
