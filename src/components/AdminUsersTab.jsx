import { useMemo, useState } from "react";
import { updateUser, demoteAdmin, deleteUser, setAdminClaim } from "../store";
import { useCurrentUser } from "../hooks/useStore";

export default function AdminUsersTab({ users, allPredictions }) {
  const { user: currentUser } = useCurrentUser();
  const [pendingClaim, setPendingClaim] = useState(null);

  async function handleAdminToggle(uid, displayName, action) {
    const label = action === "promote" ? "להפוך למנהל" : "להסיר הרשאות מנהל מ";
    if (!window.confirm(`${label}${action === "demote" ? "־" : " את "}${displayName}?`)) return;
    setPendingClaim(uid);
    const result = await setAdminClaim(uid, action);
    setPendingClaim(null);
    if (result.error) {
      alert(`שגיאה: ${result.error}`);
    }
  }

  // Precompute userId → forms[] map once (O(N) instead of O(N×M))
  const userFormsMap = useMemo(() => {
    const map = {};
    for (const [formId, p] of Object.entries(allPredictions)) {
      const uid = p.userId;
      if (!uid) continue;
      if (!map[uid]) map[uid] = [];
      map[uid].push([formId, p]);
    }
    return map;
  }, [allPredictions]);

  return (
    <div className="space-y-2">
      {Object.entries(users).map(([uid, u]) => {
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
            className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3 flex-wrap"
          >
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
              {(u.displayName || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {u.displayName}
              </div>
              <div className="text-xs text-gray-400">
                {userForms.length} טפסים
                {submittedCount > 0 && ` • ${submittedCount} הוגשו`}
                {draftCount > 0 && ` • ${draftCount} טיוטות`}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5 space-x-2 space-x-reverse">
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
              <div className="text-xs text-gray-400">טפסים</div>
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
                    className="text-[10px] text-gray-500 underline disabled:opacity-50"
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
                className="text-[11px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full hover:bg-primary/10 hover:text-primary transition border-none cursor-pointer disabled:opacity-50"
              >
                {pendingClaim === uid ? "..." : "הפוך למנהל"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (uid === currentUser?.id) {
                  alert("לא ניתן למחוק את המשתמש הנוכחי");
                  return;
                }
                if (
                  window.confirm(
                    `למחוק את ${u.displayName} ואת כל הטפסים שלו? פעולה בלתי הפיכה.`,
                  )
                ) {
                  deleteUser(uid);
                }
              }}
              className="text-[11px] text-red-500 px-2 py-1"
            >
              מחק משתמש
            </button>
          </div>
        );
      })}
    </div>
  );
}
