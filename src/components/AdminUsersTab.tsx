import { useMemo, useState } from "react";
import { deleteUser, setAdminClaim } from "../store";
import { useCurrentUser } from "../hooks/useStore";
import { useConfirm } from "./ConfirmModal";
import { useToast } from "./Toast";

export default function AdminUsersTab({ users, allPredictions }) {
  const { user: currentUser } = useCurrentUser();
  const confirm = useConfirm();
  const showToast = useToast();
  const [pendingClaim, setPendingClaim] = useState(null);

  async function handleAdminToggle(uid, displayName, action) {
    const title = action === "promote" ? "קידום למנהל" : "הסרת הרשאות מנהל";
    const message =
      action === "promote"
        ? `להפוך את ${displayName} למנהל`
        : `להסיר הרשאות מנהל מ־${displayName}`;
    const ok = await confirm({
      title,
      message,
      confirmLabel: action === "promote" ? "קדם" : "הסר",
      variant: action === "demote" ? "danger" : "primary",
    });
    if (!ok) return;
    setPendingClaim(uid);
    const result = await setAdminClaim(uid, action);
    setPendingClaim(null);
    if (result.error) {
      showToast(`שגיאה: ${result.error}`, "error");
    }
  }

  // Precompute userId → forms[] map once (O(N) instead of O(N×M))
  const userFormsMap = useMemo<Record<string, any[]>>(() => {
    const map: Record<string, any[]> = {};
    for (const [formId, pAny] of Object.entries(allPredictions)) {
      const p = pAny as any;
      const uid = p.userId;
      if (!uid) continue;
      if (!map[uid]) map[uid] = [];
      map[uid].push([formId, p]);
    }
    return map;
  }, [allPredictions]);

  return (
    <div className="space-y-2">
      {Object.entries(users).map(([uid, uAny]) => {
        const u = uAny as any;
        const userForms = userFormsMap[uid] || [];
        const submittedCount = userForms.filter(([, p]) =>
          ["submitted", "approved", "pending"].includes(p.status),
        ).length;
        const draftCount = userForms.filter(
          ([, p]) => p.status === "draft" || !p.status,
        ).length;
        const lastFormEdit = userForms
          .map(([, p]) => p.updatedAt || p.submittedAt || p.createdAt || "")
          .filter(Boolean)
          .sort()
          .pop();
        return (
          <div
            key={uid}
            className="card-duo-tight flex items-center gap-3 flex-wrap"
          >
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
              {(u.displayName || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium break-words">
                {u.displayName}
              </div>
              {(() => {
                if (u.email) return <div className="text-xs text-ink-muted break-all">{u.email}</div>;
                if (uid.startsWith("phone_")) {
                  const phone = uid.replace("phone_", "");
                  if (/^\d+$/.test(phone)) return <div className="text-xs text-ink-muted">{phone}</div>;
                }
                return null;
              })()}
              <div className="text-xs text-ink-muted">
                {userForms.length} טפסים
                {submittedCount > 0 && ` • ${submittedCount} הוגשו`}
                {draftCount > 0 && ` • ${draftCount} טיוטות`}
              </div>
              <div className="text-[10px] text-ink-muted mt-0.5 space-x-2 space-x-reverse">
                {u.lastLoginAt && (
                  <span>
                    התחברות אחרונה:{" "}
                    {new Date(u.lastLoginAt).toLocaleString("he-IL")}
                  </span>
                )}
                {lastFormEdit && (
                  <span>
                    • עדכון טופס:{" "}
                    {new Date(lastFormEdit).toLocaleString("he-IL")}
                  </span>
                )}
              </div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-primary">
                {userForms.length}
              </div>
              <div className="text-xs text-ink-muted">טפסים</div>
            </div>
            {u.isAdmin ? (
              <div className="flex flex-col gap-1 items-end">
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  מנהל
                </span>
                {uid !== currentUser?.id && (
                  <button
                    type="button"
                    disabled={pendingClaim === uid}
                    onClick={() => handleAdminToggle(uid, u.displayName, "demote")}
                    className="text-[10px] text-ink-muted underline disabled:opacity-50"
                  >
                    {pendingClaim === uid ? "..." : "הסר מנהל"}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={pendingClaim === uid}
                onClick={() => handleAdminToggle(uid, u.displayName, "promote")}
                className="text-xs bg-bg-soft text-ink-muted px-2.5 py-1 rounded-full hover:bg-primary/10 hover:text-primary transition border-none cursor-pointer disabled:opacity-50"
              >
                {pendingClaim === uid ? "..." : "הפוך למנהל"}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (uid === currentUser?.id) {
                  showToast("לא ניתן למחוק את המשתמש הנוכחי", "error");
                  return;
                }
                const ok = await confirm({
                  title: "מחיקת משתמש",
                  message: `למחוק את ${u.displayName} ואת כל הטפסים שלו\nפעולה בלתי הפיכה`,
                  confirmLabel: "מחק",
                  variant: "danger",
                });
                if (ok) deleteUser(uid);
              }}
              className="text-xs text-danger px-2 py-1 font-bold"
            >
              מחק משתמש
            </button>
          </div>
        );
      })}
    </div>
  );
}
