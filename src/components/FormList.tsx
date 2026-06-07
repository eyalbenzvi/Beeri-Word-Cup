import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { normalizeStatus } from "../utils/helpers";
import { reopenForm, createForm, deleteForm } from "../store";
import { getCachedChampion } from "../utils/bracketCache";
import { getTeamByCode } from "../data/teams";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";
import { generateDefaultFormName } from "../utils/formNameGenerator";
import { useAllPredictions } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";
import ExportFormButtons from "./ExportFormButtons";
import FormAvatar from "./FormAvatar";
import FormSummaryLines from "./FormSummaryLines";
import EmptyState from "./EmptyState";
import StatusOnboarding from "./StatusOnboarding";
import { LOCK_MESSAGES } from "../constants/messages";

// `onShowAllForms` is legacy: pre-FormsHub, FormList rendered a bottom CTA
// that deep-linked into AllForms via `?view=all`. FormsHub now exposes that
// view via a top-of-page tab pair, so the bottom CTA is gone. We keep the
// prop for backward-compat (unused if not provided).
export default function FormList({ forms, user, settings, onShowAllForms }: {
  forms: any[];
  user: any;
  settings: any;
  onShowAllForms?: () => void;
}) {
  const showToast = useToast();
  const confirm = useConfirm();
  const { navigate } = useNavigation();
  const allPredictions = useAllPredictions();
  const locked = !!settings?.predictionsLocked;
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const playerList = useMemo(
    () => resolvePlayerList(settings?.topScorerPlayers),
    [settings?.topScorerPlayers],
  );

  const defaultFormName = useMemo(
    () =>
      generateDefaultFormName({
        nickname: user?.displayName,
        userForms: forms,
        allPredictions,
      }),
    [user?.displayName, forms, allPredictions],
  );

  const handleCreateForm = useCallback(() => {
    if (!user || locked) return;
    const name = newFormName.trim() || defaultFormName;
    try {
      const formId = createForm(user.id, name);
      setNewFormName("");
      setShowNewForm(false);
      showToast(`"${name}" נוצר בהצלחה`);
      // Open the freshly created form in the URL so Back returns here.
      if (formId) navigate("predict", { form: formId });
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [user, locked, newFormName, defaultFormName, showToast, navigate]);

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

  const newFormBtnRef = useRef<HTMLButtonElement | null>(null);
  // After deleting a form (or returning here from a submit), the previously
  // focused element is gone. Without explicit focus restore, focus falls to
  // <body> and screen readers go silent. Re-focus the "+ טופס חדש" button —
  // a stable, always-visible target — whenever the forms list shrinks.
  const prevFormCountRef = useRef(forms.length);
  useEffect(() => {
    if (forms.length < prevFormCountRef.current) {
      newFormBtnRef.current?.focus({ preventScroll: true });
    }
    prevFormCountRef.current = forms.length;
  }, [forms.length]);

  return (
    <div>
      <div className="sticky top-16 z-10 bg-bg pb-3 pt-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">הטפסים שלך</h1>
          <button
            ref={newFormBtnRef}
            onClick={() => setShowNewForm(true)}
            className="btn-duo btn-duo-primary btn-duo-sm"
            disabled={locked}
            title={locked ? LOCK_MESSAGES.tournamentStarted : "צור טופס חדש"}
          >
            + טופס חדש
          </button>
        </div>
      </div>

      {forms.length === 0 && !showNewForm && !locked && (
        <div className="card-duo-lg">
          <EmptyState
            icon="📋"
            title="ברוך הבא!"
            description="צור טופס ניחושים ראשון כדי להתחיל לנחש תוצאות משחקים"
          />
        </div>
      )}

      {forms.length === 0 && locked && (
        <div className="card-duo-lg">
          <EmptyState
            icon="🔒"
            title="ההגשה נסגרה"
            description={LOCK_MESSAGES.formsUnavailable}
          />
        </div>
      )}

      {forms.length > 0 && <StatusOnboarding />}

      <div className="space-y-3 mb-4">
        {forms.map((form) => {
          const formStatus = normalizeStatus(form.status);
          const championCode = getCachedChampion(form.matches || {});
          const championName = championCode ? getTeamByCode(championCode)?.name : null;
          const topScorerName = form.topScorer
            ? getPlayerDisplayName(form.topScorer, playerList)
            : null;
          return (
            <div
              key={form.formId}
              className={`bg-white rounded-2xl p-4 border-2 transition-colors duration-150 focus-within:ring-2 focus-within:ring-secondary focus-within:ring-offset-2 ${
                formStatus === "submitted"
                  ? "border-primary/50 hover:border-primary"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <div className="flex items-center gap-3">
                <FormAvatar form={form} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-base truncate text-ink">
                    {form.formName || "טופס ללא שם"}
                  </div>
                  <FormSummaryLines championName={championName} topScorerName={topScorerName} />
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
              <div className="flex gap-2 mt-3 justify-end flex-wrap">
                <button onClick={() => navigate("predict", { form: form.formId })} className="btn-duo btn-duo-primary btn-duo-sm min-w-[120px]">
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
                {formStatus === "submitted" && (
                  <ExportFormButtons form={form} compact={true} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onShowAllForms && (
        <button onClick={onShowAllForms} className="btn-duo btn-duo-ghost btn-duo-cta">
          צפייה בטפסים של כולם
        </button>
      )}

      {showNewForm && !locked && (
        <div className="card-duo-lg mt-3 md:max-w-md md:mx-auto" style={{ borderColor: "var(--color-primary)" }}>
          <h3 className="font-extrabold text-base text-ink mb-3">טופס חדש</h3>
          <input
            type="text"
            value={newFormName}
            onChange={(e) => setNewFormName(e.target.value)}
            placeholder={defaultFormName}
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
