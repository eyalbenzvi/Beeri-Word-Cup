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

import { doc, setDoc } from "firebase/firestore";
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
