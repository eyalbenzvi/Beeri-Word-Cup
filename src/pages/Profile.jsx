import { useState, useEffect } from "react";
import { useCurrentUser, useUserForms, useAllPredictions, useMatchResults, useActualBonuses, useUsers, useSettings } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { updateUserProfile } from "../store";
import { getTeamByCode } from "../data/teams";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";

export default function Profile() {
  const { user, logout } = useCurrentUser();
  const { navigate } = useNavigation();
  const forms = useUserForms(user?.id);
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const settings = useSettings();
  const playerList = resolvePlayerList(settings.topScorerPlayers);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [nickname, setNickname] = useState(user?.displayName || "");

  useEffect(() => {
    if (!editing) {
      setFirstName(user?.firstName || "");
      setLastName(user?.lastName || "");
      setNickname(user?.displayName || "");
    }
  }, [user?.firstName, user?.lastName, user?.displayName, editing]);

  const { scoredForms, leaderboard } = useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  if (!user) return null;

  const displayName = user.displayName || "משתמש";
  const initials = (user.firstName || displayName || "?").charAt(0).toUpperCase();
  const email = user.email || "";
  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" })
    : "";

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
        className="text-sm text-secondary mb-4 flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0 hover:text-secondary-dark"
      >
        → חזרה לבית
      </button>

      <div className="card-duo-lg text-center mb-4">
        <div className="flex justify-center mb-3">
          <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center text-4xl font-extrabold border-4 border-primary-dark" style={{ marginBottom: 4 }}>
            {initials}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3 text-right">
            <div>
              <label className="block text-xs font-extrabold text-ink mb-1">שם פרטי</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input-duo" />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-ink mb-1">שם משפחה</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-duo" />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-ink mb-1">כינוי</label>
              <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="input-duo" />
            </div>
            {email && (
              <div>
                <label className="block text-xs font-extrabold text-ink mb-1">אימייל</label>
                <input type="text" value={email} disabled className="input-duo opacity-60" />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} className="btn-duo btn-duo-primary flex-1">
                שמור
              </button>
              <button onClick={handleCancel} className="btn-duo btn-duo-ghost flex-1">
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-extrabold text-ink">{displayName}</h2>
            {user.firstName && (
              <p className="text-sm text-ink-muted font-medium">{user.firstName} {user.lastName || ""}</p>
            )}
            {email && <p className="text-xs text-ink-muted mt-1 font-medium">{email}</p>}
            {joinDate && <p className="text-xs text-ink-muted mt-1 font-medium">הצטרף {joinDate}</p>}
            <button
              onClick={() => setEditing(true)}
              className="mt-4 text-sm text-secondary font-extrabold bg-transparent border-none cursor-pointer underline hover:text-secondary-dark"
            >
              עריכת פרופיל
            </button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="card-duo mb-4">
        <h3 className="font-extrabold text-base text-ink mb-3">📊 סטטיסטיקות</h3>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl p-3 border-2 border-primary/30" style={{ background: "#F0FFE4" }}>
            <div className="text-2xl font-extrabold text-primary-dark tabular-nums">{forms.length}</div>
            <div className="text-ink-muted font-bold">טפסים</div>
          </div>
          <div className="rounded-xl p-3 border-2 border-primary/30" style={{ background: "#F0FFE4" }}>
            <div className="text-2xl font-extrabold text-primary-dark tabular-nums">{totalExact}</div>
            <div className="text-ink-muted font-bold">מדויקים</div>
          </div>
          <div className="rounded-xl p-3 border-2 border-secondary/30" style={{ background: "#F0F9FF" }}>
            <div className="text-2xl font-extrabold text-secondary-dark tabular-nums">{totalOutcome}</div>
            <div className="text-ink-muted font-bold">הכרעות</div>
          </div>
        </div>
      </div>

      {/* Forms */}
      {forms.length > 0 && (
        <div className="card-duo mb-4">
          <h3 className="font-extrabold text-base text-ink mb-3">📋 הטפסים שלי</h3>
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
                <div key={form.formId} className="bg-bg-soft rounded-xl p-3 flex items-center gap-3 border-2 border-border">
                  <span className="text-2xl">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm truncate text-ink">{form.formName || "טופס ללא שם"}</div>
                    <div className="text-[11px] text-ink-muted font-medium">
                      {champion && <span>🏆 אלופה: {champion} </span>}
                      {form.topScorer && <span>⚽ מלך: {getPlayerDisplayName(form.topScorer, playerList)}</span>}
                    </div>
                  </div>
                  {position && (
                    <div className="text-xs font-extrabold text-white bg-primary px-2.5 py-1 rounded-full">
                      #{position}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={logout} className="btn-duo btn-duo-danger w-full">
        התנתק
      </button>
    </div>
  );
}
