import { useState, useEffect, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useCurrentUser, useUserForms, useAllPredictions, useMatchResults, useActualBonuses, useUsers, useSettings } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { updateUserProfile } from "../store";
import { getTeamByCode } from "../data/teams";
import { getCachedChampion } from "../utils/bracketCache";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";
import { useToast } from "../components/Toast";
import EmptyState from "../components/EmptyState";
import FormAvatar from "../components/FormAvatar";
import FormSummaryLines from "../components/FormSummaryLines";
import { LABELS } from "../constants/messages";

export default function Profile() {
  const { user, logout } = useCurrentUser();
  const { navigate } = useNavigation();
  const showToast = useToast();
  const forms = useUserForms(user?.id);
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const settings = useSettings();
  const playerList = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [nickname, setNickname] = useState(user?.displayName || "");

  // The form is always editable; "שמור"/"ביטול" appear only when the user
  // has actually changed something. This removes the explicit edit-mode
  // toggle which was a hidden affordance — most users didn't realise the
  // disabled fields became editable after clicking "עריכת פרופיל".
  const isDirty =
    firstName !== (user?.firstName || "") ||
    lastName !== (user?.lastName || "") ||
    nickname !== (user?.displayName || "");

  // Sync local state from the source-of-truth user record whenever the
  // upstream value changes AND the user hasn't started typing. We don't
  // want to clobber an in-flight edit if a Firestore listener fires.
  useEffect(() => {
    if (!isDirty) {
      setFirstName(user?.firstName || "");
      setLastName(user?.lastName || "");
      setNickname(user?.displayName || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.firstName, user?.lastName, user?.displayName]);

  const { scoredForms, rankedLeaderboard } = useLeaderboardComputed(results, allPredictions, users, actualBonuses);

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
    showToast("עדכנתי. יאללה.");
  };

  const handleCancel = () => {
    setFirstName(user.firstName || "");
    setLastName(user.lastName || "");
    setNickname(user.displayName || "");
  };

  return (
    <div className="max-w-md mx-auto xl:max-w-none xl:grid xl:grid-cols-[360px_1fr] xl:gap-6 xl:items-start">
      <button
        onClick={() => navigate("home")}
        className="text-sm text-secondary mb-4 flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0 hover:text-secondary-dark xl:col-span-2"
      >
        <ArrowRight size={16} aria-hidden="true" />
        חזרה לבית
      </button>

      <div className="card-duo-lg text-center mb-4">
        <div className="flex justify-center mb-3">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary text-white flex items-center justify-center text-3xl md:text-4xl font-extrabold border-4 border-primary-dark">
            {initials}
          </div>
        </div>

        <h2 className="text-2xl font-extrabold text-ink mb-3">{displayName}</h2>

        <div className="space-y-3 text-right">
          <div>
            <label htmlFor="profile-firstName" className="block text-xs font-extrabold text-ink mb-1">שם פרטי</label>
            <input id="profile-firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input-duo" maxLength={30} />
          </div>
          <div>
            <label htmlFor="profile-lastName" className="block text-xs font-extrabold text-ink mb-1">שם משפחה</label>
            <input id="profile-lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-duo" maxLength={30} />
          </div>
          <div>
            <label htmlFor="profile-nickname" className="block text-xs font-extrabold text-ink mb-1">כינוי</label>
            <input id="profile-nickname" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="input-duo" maxLength={20} />
          </div>
          {email && (
            <div>
              <label htmlFor="profile-email" className="block text-xs font-extrabold text-ink mb-1">אימייל</label>
              <input id="profile-email" type="text" value={email} disabled className="input-duo opacity-60" />
            </div>
          )}
          {isDirty && (
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} className="btn-duo btn-duo-primary flex-1">
                שמור
              </button>
              <button onClick={handleCancel} className="btn-duo btn-duo-ghost flex-1">
                ביטול
              </button>
            </div>
          )}
          {!isDirty && joinDate && (
            <p className="text-xs text-ink-muted mt-2 font-medium text-center">הצטרף {joinDate}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="card-duo mb-4">
        <h3 className="font-extrabold text-base text-ink mb-3">📊 סטטיסטיקות</h3>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl p-3 border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
            <div className="text-2xl font-extrabold text-primary-dark tabular-nums">{forms.length}</div>
            <div className="text-ink-muted font-bold">{LABELS.forms}</div>
          </div>
          <div className="rounded-xl p-3 border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
            <div className="text-2xl font-extrabold text-primary-dark tabular-nums">{totalExact}</div>
            <div className="text-ink-muted font-bold">{LABELS.exactCount}</div>
          </div>
          <div className="rounded-xl p-3 border-2 border-secondary/30" style={{ background: "#F0F9FF" }}>
            <div className="text-2xl font-extrabold text-secondary-dark tabular-nums">{totalOutcome}</div>
            <div className="text-ink-muted font-bold">{LABELS.outcomeCount}</div>
          </div>
        </div>
      </div>

      {/* Forms */}
      {forms.length === 0 && (
        <div className="card-duo mb-4">
          <h3 className="font-extrabold text-base text-ink mb-3">📋 הטפסים שלי</h3>
          <EmptyState
            icon="📋"
            title="עדיין אין טפסים"
            description="צור טופס ניחושים כדי להתחיל"
          />
        </div>
      )}

      {forms.length > 0 && (
        <div className="card-duo mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-base text-ink">📋 הטפסים שלי</h3>
            <button
              onClick={() => navigate("predict", { view: "all" })}
              className="text-xs text-secondary font-extrabold bg-transparent border-none cursor-pointer p-0 hover:text-secondary-dark"
            >
              כל הטפסים ←
            </button>
          </div>
          <div className="space-y-2">
            {forms.map((form) => {
              const championCode = getCachedChampion(form.matches || {});
              const champion = championCode
                ? getTeamByCode(championCode)?.name || championCode
                : null;
              const topScorerName = form.topScorer
                ? getPlayerDisplayName(form.topScorer, playerList)
                : null;
              const lbEntry = rankedLeaderboard.find((e) => e.formId === form.formId);
              const position = lbEntry ? lbEntry.rank : null;

              return (
                <button
                  key={form.formId}
                  onClick={() => navigate("predict", { form: form.formId })}
                  className="w-full bg-bg-soft rounded-xl p-3 flex items-center gap-3 border-2 border-border text-right cursor-pointer hover:border-border-strong transition-colors"
                  aria-label={`פתח את הטופס ${form.formName || "ללא שם"}`}
                >
                  <FormAvatar form={form} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm truncate text-ink">{form.formName || "טופס ללא שם"}</div>
                    <FormSummaryLines championName={champion} topScorerName={topScorerName} />
                  </div>
                  {position && (
                    <div className="text-xs font-extrabold text-white bg-primary px-2.5 py-1 rounded-full">
                      #{position}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={logout} className="btn-duo btn-duo-danger btn-duo-cta xl:col-span-2">
        התנתק
      </button>
    </div>
  );
}
