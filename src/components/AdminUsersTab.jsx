import { updateUser } from "../store";

export default function AdminUsersTab({ users, allPredictions }) {
  return (
    <div className="space-y-2">
      {Object.entries(users).map(([uid, u]) => {
        const userForms = Object.entries(allPredictions).filter(
          ([, p]) => p.userId === uid,
        );
        const submittedCount = userForms.filter(([, p]) =>
          ["submitted", "approved", "pending"].includes(p.status),
        ).length;
        const draftCount = userForms.filter(
          ([, p]) => p.status === "draft" || !p.status,
        ).length;
        return (
          <div
            key={uid}
            className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3"
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
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-primary">
                {userForms.length}
              </div>
              <div className="text-xs text-gray-400">טפסים</div>
            </div>
            {u.isAdmin ? (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                מנהל
              </span>
            ) : (
              <button
                onClick={() => {
                  if (window.confirm(`להפוך את ${u.displayName} למנהל?`)) {
                    updateUser(uid, { isAdmin: true });
                  }
                }}
                className="text-[11px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full hover:bg-primary/10 hover:text-primary transition border-none cursor-pointer"
              >
                הפוך למנהל
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
