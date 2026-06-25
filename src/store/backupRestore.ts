// Admin backup / restore.
//
// Owns:
//   - BACKUP_SCHEMA_VERSION + exportAllData (snapshot the live cache).
//   - validateBackupShape (preview check used by the restore UI before
//     committing — surfaces missing/malformed fields with Hebrew copy).
//   - clearAllData (admin nuke — predictions + userPrivate collection +
//     all single docs).
//   - importAllData (replace-all: predictions + userPrivate get
//     deleted, then re-written from backup; legacy users blob is the
//     source of truth, with userDirectory + userPrivate re-derived per
//     uid via DIRECTORY_FIELDS / USER_PRIVATE_FIELDS).
//
// Admin-rights preservation: every user marked `isAdmin: true` in the
// LIVE cache stays admin after restore even if the backup omits them —
// safety net so a restore can never accidentally lock the board out.

import { getDocs } from "firebase/firestore";
import { captureClientError } from "../sentry";
import {
  commitInBatches,
  formDocRef,
  gameDocRef,
  predictionsCollectionRef,
  userPrivateCollectionRef,
  userPrivateDocRef,
} from "./firestoreClient";
import { cache, notifyAndEmit } from "./cache";
import { writeAuditLog } from "./audit";
import {
  DIRECTORY_FIELDS,
  USER_PRIVATE_FIELDS,
  pickKnown,
  getUsers,
  getCurrentUser,
  requireAdmin,
} from "./usersRepo";
import {
  getAllPredictions,
  rebuildUserFormIndex,
} from "./predictionsRepo";
import {
  getMatchResults,
  getActualBonuses,
  getSettings,
} from "./resultsRepo";

import { CURRENT_USER_KEY, ACTIVE_FORM_KEY } from "../constants/storageKeys";

export const BACKUP_SCHEMA_VERSION = 1;

export function exportAllData() {
  const users = getUsers();
  const predictions = getAllPredictions();
  const matchResults = getMatchResults();
  return {
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: getCurrentUser()?.id || null,
    counts: {
      users: Object.keys(users).length,
      predictions: Object.keys(predictions).length,
      matchResults: Object.keys(matchResults).length,
    },
    users,
    predictions,
    matchResults,
    actualAdvancing: cache.actualAdvancing || {},
    actualBonuses: getActualBonuses(),
    settings: getSettings(),
  };
}

// Shape check for a backup file — used by the restore UI for preview/validation.
// Returns { ok, errors, counts } where errors is a list of human-readable strings.
export function validateBackupShape(data: any) {
  const errors: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["הקובץ אינו אובייקט JSON תקין"], counts: null };
  }
  const requiredObjectKeys = ["users", "predictions", "matchResults"];
  for (const k of requiredObjectKeys) {
    if (data[k] == null) {
      errors.push(`חסר השדה "${k}"`);
    } else if (typeof data[k] !== "object" || Array.isArray(data[k])) {
      errors.push(`מבנה לא תקין לשדה "${k}"`);
    }
  }
  const optionalObjectKeys = ["actualAdvancing", "actualBonuses", "settings"];
  for (const k of optionalObjectKeys) {
    if (data[k] != null && (typeof data[k] !== "object" || Array.isArray(data[k]))) {
      errors.push(`מבנה לא תקין לשדה "${k}"`);
    }
  }

  // Validate formIds & userId consistency
  if (data.predictions && typeof data.predictions === "object") {
    const formIdPattern = /^.+__\d+$/;
    let badFormIds = 0;
    let orphanForms = 0;
    const users = data.users && typeof data.users === "object" ? data.users : {};
    for (const [formId, form] of Object.entries(data.predictions)) {
      if (!formIdPattern.test(formId)) badFormIds++;
      if (!form || typeof form !== "object") {
        orphanForms++;
        continue;
      }
      if ((form as any).userId && !users[(form as any).userId]) orphanForms++;
    }
    if (badFormIds > 0) errors.push(`${badFormIds} מזהי טפסים בפורמט לא תקין`);
    if (orphanForms > 0) errors.push(`${orphanForms} טפסים ללא משתמש תואם בקובץ`);
  }

  const counts = {
    users: data.users ? Object.keys(data.users).length : 0,
    predictions: data.predictions ? Object.keys(data.predictions).length : 0,
    matchResults: data.matchResults ? Object.keys(data.matchResults).length : 0,
    actualBonuses: data.actualBonuses ? 1 : 0,
    settings: data.settings ? 1 : 0,
  };

  return { ok: errors.length === 0, errors, counts };
}

export async function clearAllData() {
  if (!requireAdmin()) return;
  writeAuditLog("clear-all-data");

  // Delete all form documents and all userPrivate docs using batched operations.
  // PII migration Phase A: also clears userDirectory + userPrivate so a
  // subsequent restore (or a fresh tournament) starts from a clean slate.
  const [predsSnap, privateSnap] = await Promise.all([
    getDocs(predictionsCollectionRef),
    getDocs(userPrivateCollectionRef),
  ]);
  const ops: any[] = [];
  predsSnap.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  privateSnap.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  ops.push({ type: "set", ref: gameDocRef("users"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("userDirectory"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("matchResults"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("actualAdvancing"), data: { data: {} } });
  ops.push({ type: "set", ref: gameDocRef("actualBonuses"), data: { data: { champion: null, topScorers: [] } } });
  ops.push({ type: "set", ref: gameDocRef("settings"), data: { data: { predictionsLocked: false, bestCaseEnabled: false } } });
  await commitInBatches(ops);

  cache.users = {};
  cache.userDirectory = {};
  cache.userPrivate = {};
  cache.predictions = {};
  cache.matchResults = {};
  cache.actualAdvancing = {};
  cache.actualBonuses = { champion: null, topScorers: [] };
  cache.settings = { predictionsLocked: false, bestCaseEnabled: false };
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(ACTIVE_FORM_KEY);
  notifyAndEmit("all");
}

export async function importAllData(data: any) {
  if (!requireAdmin()) {
    throw new Error("נדרשת הרשאת מנהל");
  }

  const shape = validateBackupShape(data);
  if (!shape.ok) {
    throw new Error(`קובץ גיבוי לא תקין: ${shape.errors.join(", ")}`);
  }

  writeAuditLog("import-data-start", {
    keys: Object.keys(data),
    counts: shape.counts,
  });

  // Preserve admin rights: every user marked `isAdmin: true` in the current
  // live cache stays admin after restore, even if the backup lists them as
  // non-admin (or omits them). Safety net — a restore should never
  // accidentally demote existing admins and lock the board out of the system.
  const liveUsers = getUsers();
  const currentAdminIds = Object.keys(liveUsers).filter(
    (uid) => liveUsers[uid]?.isAdmin === true,
  );
  const importedUsers: Record<string, any> = { ...(data.users || {}) };
  for (const uid of currentAdminIds) {
    if (importedUsers[uid]) {
      importedUsers[uid] = { ...importedUsers[uid], isAdmin: true };
    } else {
      // Admin was not in the backup at all — re-inject their live record.
      importedUsers[uid] = { ...liveUsers[uid], isAdmin: true };
    }
  }

  // Also make sure the current user (the one running the restore) keeps admin.
  const current = getCurrentUser() as any;
  if (current?.id && current?.isAdmin) {
    importedUsers[current.id] = {
      ...(importedUsers[current.id] || liveUsers[current.id] || {
        id: current.id,
        displayName: current.displayName || "מנהל",
      }),
      isAdmin: true,
    };
  }

  // PII migration Phase A: derive userDirectory + userPrivate from the
  // imported (admin-preserved) users blob. Backups predate the split so
  // they only carry the legacy users doc; we re-derive the new shapes on
  // every import. This means a v1 backup round-trips correctly and admins
  // never have to think about the split structure when restoring.
  const importedDirectory: Record<string, any> = {};
  const importedUserPrivate: Record<string, any> = {};
  for (const [uid, u] of Object.entries(importedUsers)) {
    if (!u || typeof u !== "object") continue;
    importedDirectory[uid] = pickKnown(u, DIRECTORY_FIELDS);
    importedUserPrivate[uid] = pickKnown(u, USER_PRIVATE_FIELDS);
  }

  const ops: any[] = [];

  // gameData single-doc writes (legacy + directory)
  const gameDocMap: Record<string, any> = {
    users: importedUsers,
    userDirectory: importedDirectory,
    matchResults: data.matchResults,
    actualAdvancing: data.actualAdvancing,
    actualBonuses: data.actualBonuses,
    settings: data.settings,
  };
  for (const [key, value] of Object.entries(gameDocMap)) {
    if (value != null && typeof value === "object") {
      ops.push({
        type: "set",
        ref: gameDocRef(key),
        data: { data: structuredClone(value) },
      });
    }
  }

  // Predictions: delete existing, then write from backup
  const existing = await getDocs(predictionsCollectionRef);
  existing.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  if (data.predictions) {
    for (const [formId, formData] of Object.entries(data.predictions)) {
      if (!formData || typeof formData !== "object") continue;
      ops.push({
        type: "set",
        ref: formDocRef(formId),
        data: structuredClone(formData),
      });
    }
  }

  // userPrivate: delete existing collection, then write derived per-uid docs
  const existingPrivate = await getDocs(userPrivateCollectionRef);
  existingPrivate.forEach((docSnap) => ops.push({ type: "delete", ref: docSnap.ref }));
  for (const [uid, record] of Object.entries(importedUserPrivate)) {
    ops.push({
      type: "set",
      ref: userPrivateDocRef(uid),
      data: structuredClone(record),
    });
  }

  try {
    await commitInBatches(ops);
  } catch (err: any) {
    console.error("Import commit failed:", err);
    captureClientError(err, {
      source: "importAllData.commit",
      code: err?.code,
      counts: shape.counts,
    });
    writeAuditLog("import-data-failed", {
      code: err?.code || null,
      message: err?.message || String(err),
    });
    throw err;
  }

  // Only update cache after Firestore commit succeeds. The realtime listeners
  // will also refresh the cache from the server snapshots — this just makes
  // the UI reflect the new state immediately.
  cache.users = importedUsers;
  cache.userDirectory = importedDirectory;
  cache.userPrivate = importedUserPrivate;
  if (data.matchResults) cache.matchResults = data.matchResults;
  if (data.actualAdvancing) cache.actualAdvancing = data.actualAdvancing;
  if (data.actualBonuses) cache.actualBonuses = data.actualBonuses;
  if (data.settings) cache.settings = data.settings;
  if (data.predictions) cache.predictions = data.predictions;
  rebuildUserFormIndex();
  notifyAndEmit("users");
  notifyAndEmit("userDirectory");
  notifyAndEmit("userPrivate");
  notifyAndEmit("predictions");
  notifyAndEmit("matchResults");
  notifyAndEmit("settings");
  notifyAndEmit("actualBonuses");

  writeAuditLog("import-data-success", { counts: shape.counts });

  return { success: true, counts: shape.counts };
}
