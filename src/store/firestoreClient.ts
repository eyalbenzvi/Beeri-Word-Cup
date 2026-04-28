// Pure Firestore-facing helpers used by every repo.
//
// What lives here:
//   * `db` / `auth` re-exports so repos don't need to know about
//     ../firebase directly.
//   * Doc + collection refs for every Firestore path the app touches.
//   * `commitInBatches` (chunks operations across Firestore's 500-op
//     batch limit) and `withTimeout` (race-against-deadline wrapper).
//   * `safeClone` (JSON-clone fallback).
//   * `maybeRefreshToken` (force-refresh ID token on permission-denied,
//     bounded by TOKEN_REFRESH_TTL_MS so we don't hammer Firebase).
//
// Has zero dependencies on any other store module — safe to import
// anywhere without creating cycles.

import { db, auth } from "../firebase";
import { collection, doc, writeBatch } from "firebase/firestore";
import { captureClientError, captureClientMessage } from "../sentry";
import { FIRESTORE_BATCH_LIMIT as BATCH_LIMIT } from "../utils/constants";

export { db, auth };

// ============ DOCUMENT STRUCTURE ============
// gameData/{users, userDirectory, matchResults, actualAdvancing, actualBonuses, settings}
// predictions/{formId}
// summaries/{summaryId}
// userPrivate/{uid}

export const DOCS = {
  users: "users",
  // PII migration Phase A: directory holds {uid: {displayName, firstName?, lastName?}}
  // and is auth-readable. The leaderboard / AllForms / etc. read from here
  // instead of the legacy users doc once migrated.
  userDirectory: "userDirectory",
  matchResults: "matchResults",
  actualAdvancing: "actualAdvancing",
  actualBonuses: "actualBonuses",
  settings: "settings",
};

export function gameDocRef(docName: string) {
  return doc(db, "gameData", docName);
}

export function formDocRef(formId: string) {
  return doc(db, "predictions", formId);
}

export const predictionsCollectionRef = collection(db, "predictions");

export function summaryDocRef(summaryId: string) {
  return doc(db, "summaries", summaryId);
}

export const summariesCollectionRef = collection(db, "summaries");

// PII migration Phase A: per-user private record lives at userPrivate/{uid}.
export function userPrivateDocRef(uid: string) {
  return doc(db, "userPrivate", uid);
}

export const userPrivateCollectionRef = collection(db, "userPrivate");

export const userDirectoryDocRef = () => gameDocRef("userDirectory");

// ============ BATCH + TIMEOUT HELPERS ============

// Splits operations across multiple batches when exceeding Firestore's 500 op limit
export async function commitInBatches(operations: any[]) {
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const chunk = operations.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === "set") batch.set(op.ref, op.data);
      else if (op.type === "update") batch.update(op.ref, op.data);
      else if (op.type === "delete") batch.delete(op.ref);
    }
    await batch.commit();
  }
}

export function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

// Lightweight clone using JSON parse/stringify — faster than structuredClone for plain data
export function safeClone(obj: any) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return structuredClone(obj);
  }
}

// ============ TOKEN REFRESH HELPER (A2) ============
// Force at most one ID-token refresh per uid per TOKEN_REFRESH_TTL_MS window
// when Firestore returns permission-denied. The TTL avoids rate-limit abuse
// (refreshing on every retry would hammer Firebase) while still allowing a
// later, genuinely-different denial hours into the session to trigger one
// fresh attempt. Without the TTL, a single early refresh disabled the
// recovery path forever.
const TOKEN_REFRESH_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const tokenRefreshedAt = new Map<string, number>(); // uid -> last-refresh timestamp

export async function maybeRefreshToken(err: any) {
  if (err?.code !== "permission-denied") return false;
  const u = auth.currentUser;
  if (!u) return false;
  const last = tokenRefreshedAt.get(u.uid);
  if (last && Date.now() - last < TOKEN_REFRESH_TTL_MS) return false;
  tokenRefreshedAt.set(u.uid, Date.now());
  try {
    await u.getIdToken(true);
    captureClientMessage("token-refreshed-after-denied", { uid: u.uid });
    return true;
  } catch (refreshErr) {
    captureClientError(refreshErr, {
      source: "maybeRefreshToken",
      originalCode: err?.code,
    });
    return false;
  }
}
