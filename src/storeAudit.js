// Audit log module — single source of truth for the local audit ring buffer.
// store.js previously kept a parallel copy of this state which races on the
// same localStorage key (last writer wins). Always import from here.

const AUDIT_LOG_KEY = "wc2026_audit_log";

// Cap on the local audit log ring buffer. Beyond this, the oldest entries are
// dropped — keeps localStorage usage bounded.
export const MAX_AUDIT_LOG_SIZE = 200;

let auditLog;
try {
  auditLog = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || "[]");
} catch {
  auditLog = [];
}

// Caller passes the live Firebase auth uid. We don't read it from
// localStorage here: the cache string can be stale or attacker-set in a
// shared device, while auth.currentUser.uid is whatever Firebase has
// actually signed in right now.
export function logAdminAction(action, details = {}, userId) {
  const entry = {
    action,
    ...details,
    userId: userId || "unknown",
    timestamp: new Date().toISOString(),
  };
  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) auditLog.length = MAX_AUDIT_LOG_SIZE;
  try {
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(auditLog));
  } catch {
    /* noop — quota exceeded / private mode */
  }
  return entry;
}

export function getAuditLog() {
  return auditLog;
}
