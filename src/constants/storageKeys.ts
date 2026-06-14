// Single source of truth for the client-side localStorage keys that encode
// the signed-in identity. These were previously redeclared as inline string
// literals in 5+ modules (store/index, usersRepo, backupRestore,
// predictionsRepo) and hardcoded again in useStore/App logout cleanup. A
// rename in one place silently desynced the others, so the logout/guest
// teardown could clear one key and orphan the other. Centralised here so the
// teardown paths cannot drift.
//
// Note: other `wc2026_*` keys (`wc2026_audit_log`, `wc2026_chunkReloaded`)
// are single-use and live with their owning module — only the *duplicated*
// identity keys are centralised here.

export const CURRENT_USER_KEY = "wc2026_currentUser";
export const ACTIVE_FORM_KEY = "wc2026_activeForm";
