import { useState } from "react";
import { useCurrentUser, useUserForms, useAllPredictions, useMatchResults, useActualBonuses, useUsers } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { updateUserProfile } from "../store";
import { getTeamByCode } from "../data/teams";

export default function Profile() {
  const { user, logout } = useCurrentUser();
  const { navigate } = useNavigation();
  const forms = useUserForms(user?.id);
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [nickname, setNickname] = useState(user?.displayName || "");

  const { scoredForms, leaderboard } = useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  if (!user) return null;

  const displayName = user.displayName || "משתמש";
  const initials = (user.firstName || displayName || "?").charAt(0).toUpperCase();
  const email = user.email || "";
  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" })
    : "";

  // Stats
  let totalExact = 0;
  let totalOutcome = 0;
  const userFormIds = forms.map((f) => f.formId);
  for (const sf of scoredForms) {
    if (userFormIds.includes(sf.formId)) {
      totalExact += sf.exactScoreCount || 0;
      totalOutcome += sf.outcomeCount || 0;
    }
  }

  const handleSave = () => {
    updateUserProfile(user.id, {
      firstName,
      lastName,
      displayName: nickname || firstName || displayName,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setFirstName(user.firstName || "");
    setLastName(user.lastName || "");
    setNickname(user.displayName || "");
    setEditing(false);
  };

  return (
    <div className="max-w-md mx-auto">
      <button
        onClick={() => navigate("home")}
        className="text-sm text-primary mb-4 flex items-center gap-1 bg-transparent border-none cursor-pointer font-medium p-0"
      >
        → חזרה לבית
      </button>

      <div className="bg-white rounded-2xl p-6 border border-border shadow-sm text-center mb-4">
        <div className="flex justify-center mb-3">
          <div className="w-20 h-20 rounded-full bg-primary/20 text-primary flex items-center justify-center text-3xl font-bold">
            {initials}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3 text-right">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">שם פרטי</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">שם משפחה</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">כינוי</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            {email && (
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">אימייל</label>
                <input
                  type="text"
                  value={email}
                  disabled
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base bg-gray-50 opacity-60"
                />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary-light transition border-none cursor-pointer"
              >
                שמור
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-500 font-semibold hover:bg-gray-50 transition cursor-pointer"
              >
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-extrabold text-primary">{displayName}</h2>
            {user.firstName && (
              <p className="text-sm text-ink-muted">{user.firstName} {user.lastName || ""}</p>
            )}
            {email && <p className="text-xs text-ink-muted/60 mt-1">{email}</p>}
            {joinDate && <p className="text-xs text-ink-muted/50 mt-1">הצטרף {joinDate}</p>}
            <button
              onClick={() => setEditing(true)}
              className="mt-3 text-sm text-primary font-semibold bg-transparent border-none cursor-pointer underline"
            >
              עריכת פרופיל
            </button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl p-4 border border-border shadow-sm mb-4">
        <h3 className="font-bold text-sm text-primary mb-3">📊 סטטיסטיקות</h3>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xl font-extrabold text-primary tabular-nums">{forms.length}</div>
            <div className="text-ink-muted">טפסים</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xl font-extrabold text-green-600 tabular-nums">{totalExact}</div>
            <div className="text-ink-muted">מדויקים</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xl font-extrabold text-blue-600 tabular-nums">{totalOutcome}</div>
            <div className="text-ink-muted">הכרעות</div>
          </div>
        </div>
      </div>

      {/* Forms */}
      {forms.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-border shadow-sm mb-4">
          <h3 className="font-bold text-sm text-primary mb-3">📋 הטפסים שלי</h3>
          <div className="space-y-2">
            {forms.map((form) => {
              const icon = "📋";
              const champion = form.champion
                ? getTeamByCode(form.champion)?.name || form.champion
                : null;
              const lbEntry = leaderboard.find((e) => e.formId === form.formId);
              const position = lbEntry
                ? leaderboard.indexOf(lbEntry) + 1
                : null;

              return (
                <div key={form.formId} className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{form.formName || "טופס ללא שם"}</div>
                    <div className="text-[11px] text-ink-muted/70">
                      {champion && <span>🏆 אלופה: {champion} </span>}
                      {form.topScorer && <span>⚽ מלך: {form.topScorer}</span>}
                    </div>
                  </div>
                  {position && (
                    <div className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
                      #{position}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={logout}
        className="w-full bg-red-50 text-red-600 font-bold py-3.5 rounded-2xl hover:bg-red-100 transition text-sm border-none cursor-pointer"
      >
        התנתק
      </button>
    </div>
  );
}
