// Audit log module — extracted from store.js for better separation of concerns
// Used by store.js internally and exported for admin pages

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

export function logAdminAction(action, details = {}, getCurrentUser) {
  const entry = {
    action,
    ...details,
    userId: getCurrentUser?.()?.id || "unknown",
    timestamp: new Date().toISOString(),
  };
  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) auditLog.length = MAX_AUDIT_LOG_SIZE;
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(auditLog));
}

export function getAuditLog() {
  return auditLog;
}
