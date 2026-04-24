import { useState, useCallback } from "react";
import { normalizeStatus } from "../utils/helpers";
import { groupMatches, knockoutMatches } from "../data/matches";
import { reopenForm, createForm, deleteForm, setActiveFormId } from "../store";
import { getCachedChampion } from "../utils/bracketCache";
import { getTeamByCode } from "../data/teams";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";

const totalMatches = groupMatches.length + knockoutMatches.length;

export default function FormList({ forms, user, settings, onShowAllForms }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const locked = !!settings?.predictionsLocked;
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormName, setNewFormName] = useState("");

  const handleCreateForm = useCallback(() => {
    if (!user || locked) return;
    const name = newFormName.trim() || `טופס ${forms.length + 1}`;
    try {
      createForm(user.id, name);
      setNewFormName("");
      setShowNewForm(false);
      showToast(`"${name}" נוצר בהצלחה`);
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [user, locked, newFormName, forms.length, showToast]);

  const handleDeleteForm = useCallback(
    (formId) => {
      deleteForm(formId);
      showToast("הטופס נמחק");
    },
    [showToast],
  );

  const handleReopenForm = useCallback(
    async (form) => {
      // Submitted forms were admin-approved, so reopening them removes the
      // form from the leaderboard until re-submission + re-approval.
      // Pending forms aren't counted yet, so no confirmation is needed.
      if (normalizeStatus(form.status) === "submitted") {
        const ok = await confirm({
          title: "פתיחת טופס שהוגש",
          message:
            "הטופס כבר אושר ונכלל בדירוג. פתיחה מחדש תחזיר אותו לטיוטה — תצטרך להגיש שוב, והמנהל יצטרך לאשר מחדש.",
          confirmLabel: "פתח לעריכה",
        });
        if (!ok) return;
      }
      reopenForm(form.formId);
      showToast("הטופס נפתח לעריכה");
    },
    [confirm, showToast],
  );

  return (
    <div>
      <div className="sticky top-16 z-10 bg-bg pb-3 pt-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">הטפסים שלך</h1>
          {!locked && (
            <button onClick={() => setShowNewForm(true)} className="btn-duo btn-duo-primary btn-duo-sm">
              + טופס חדש
            </button>
          )}
        </div>
      </div>

      {forms.length === 0 && !showNewForm && !locked && (
        <div className="text-center py-12 card-duo-lg">
          <div className="text-6xl mb-3">📋</div>
          <p className="font-extrabold text-ink text-lg mb-1">ברוך הבא!</p>
          <p className="text-ink-muted text-sm">צור טופס ניחושים ראשון כדי להתחיל לנחש תוצאות משחקים</p>
        </div>
      )}

      {forms.length === 0 && locked && (
        <div className="text-center py-12 card-duo-lg">
          <div className="text-6xl mb-3">🔒</div>
          <p className="font-extrabold text-ink text-lg mb-1">ההגשה נסגרה</p>
          <p className="text-ink-muted text-sm">לא ניתן ליצור טפסים חדשים לאחר תחילת המשחקים</p>
        </div>
      )}

      <div className="space-y-3 mb-4">
        {forms.map((form) => {
          const formStatus = normalizeStatus(form.status);
          const championCode = getCachedChampion(form.matches || {});
          const championName = championCode ? getTeamByCode(championCode)?.name : null;
          return (
            <div
              key={form.formId}
              className={`bg-white rounded-2xl p-4 border-2 card-duo-hover ${
                formStatus === "submitted"
                  ? "border-primary/50"
                  : "border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-xl flex-shrink-0 ${
                    formStatus === "submitted"
                      ? "bg-primary text-white"
                      : "bg-bg-soft text-ink-muted"
                  }`}
                >
                  {formStatus === "submitted" ? "✓" : "📋"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-base truncate text-ink">
                    {form.formName || "טופס ללא שם"}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5 font-medium">
                    {Object.keys(form.matches || {}).length}/{totalMatches}{" "}
                    משחקים
                    {form.budgetNumber ? ` • תקציב: ${form.budgetNumber}` : ""}
                    {championName ? ` • 🏆 ${championName}` : ""}
                  </div>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-extrabold ${
                    formStatus === "submitted"
                      ? "bg-primary text-white"
                      : form.status === "pending"
                        ? "bg-accent text-white"
                        : "bg-bg-soft text-ink-muted"
                  }`}
                  title={formStatus === "submitted" ? "הטופס הוגש ואושר" : form.status === "pending" ? "הטופס ממתין לאישור מנהל" : "הטופס עדיין בעריכה ולא הוגש"}
                >
                  {formStatus === "submitted" ? "✅ הוגש" : form.status === "pending" ? "⏳ ממתין" : "טיוטה"}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setActiveFormId(form.formId)} className="btn-duo btn-duo-primary btn-duo-sm flex-1">
                  {formStatus === "draft" ? "עריכה" : "צפייה"}
                </button>
                {(form.status === "pending" || formStatus === "submitted") && !settings.predictionsLocked && (
                  <button onClick={() => handleReopenForm(form)} className="btn-duo btn-duo-orange btn-duo-sm">
                    פתח לעריכה
                  </button>
                )}
                {(formStatus === "draft" || form.status === "pending") && (
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: "מחיקת טופס",
                        message: `למחוק את "${form.formName}"`,
                        confirmLabel: "מחק",
                        variant: "danger",
                      });
                      if (ok) handleDeleteForm(form.formId);
                    }}
                    className="btn-duo-flat"
                    style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
                  >
                    מחק
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onShowAllForms} className="btn-duo btn-duo-ghost w-full">
        👀 צפייה בטפסים של כולם
      </button>

      {showNewForm && !locked && (
        <div className="card-duo-lg mt-3" style={{ borderColor: "var(--color-primary)" }}>
          <h3 className="font-extrabold text-base text-ink mb-3">טופס חדש</h3>
          <input
            type="text"
            value={newFormName}
            onChange={(e) => setNewFormName(e.target.value)}
            placeholder={`טופס ${forms.length + 1}`}
            className="input-duo mb-3"
            maxLength={50}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={handleCreateForm} className="btn-duo btn-duo-primary flex-1">
              צור טופס
            </button>
            <button
              onClick={() => {
                setShowNewForm(false);
                setNewFormName("");
              }}
              className="btn-duo btn-duo-ghost flex-1"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
