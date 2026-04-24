import { useRef, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { getPlayerDisplayName } from "../utils/playerSearch";
import { useSettings } from "../hooks/useStore";
import { resolvePlayerList } from "../utils/playerSearch";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { LABELS } from "../constants/messages";

export default function ReviewScreen({
  errors,
  activeForm,
  groupMatchesCount,
  knockoutMatchesCount,
  predictedGroupCount,
  predictedKnockoutCount,
  championName,
  onClose,
  onSubmit,
}) {
  const settings = useSettings();
  const playerList = resolvePlayerList(settings.topScorerPlayers);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const topScorerDisplay = activeForm.topScorer?.trim()
    ? getPlayerDisplayName(activeForm.topScorer.trim(), playerList)
    : "";
  const hasErrors = errors.length > 0;
  const totalMatches = groupMatchesCount + knockoutMatchesCount;
  const totalFilled = predictedGroupCount + predictedKnockoutCount;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="סקירת טופס" className="bg-white rounded-3xl max-w-md w-full border-2 border-border max-h-[85vh] flex flex-col animate-pop-in">
        <div className="p-5 pb-3 border-b-2 border-border">
          <div className="text-4xl text-center mb-2">
            {hasErrors ? "⚠️" : "📋"}
          </div>
          <h3 className="text-xl font-extrabold text-center text-ink">
            {hasErrors ? "סקירת הטופס" : "הטופס מוכן להגשה!"}
          </h3>
        </div>

        <div className="overflow-y-auto flex-1 p-5 pt-3">
          <div className="rounded-2xl p-4 mb-4 border-2 border-border" style={{ background: "var(--color-bg-soft)" }}>
            <div className="text-sm text-ink space-y-2">
              <div className="flex justify-between">
                <span className="text-ink-muted font-medium">טופס:</span>
                <span className="font-extrabold">
                  {activeForm.formName || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted font-medium">משחקים:</span>
                <span
                  className={`font-extrabold ${totalFilled === totalMatches ? "text-primary" : "text-accent-text"}`}
                >
                  {totalFilled} / {totalMatches}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted font-medium">{LABELS.topScorer}:</span>
                <span
                  className={`font-extrabold ${topScorerDisplay ? "text-ink" : "text-danger"}`}
                >
                  {topScorerDisplay || "חסר"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted font-medium">מספר תקציב:</span>
                <span
                  className={`font-extrabold ${activeForm.budgetNumber?.trim() ? "text-ink" : "text-danger"}`}
                >
                  {activeForm.budgetNumber?.trim() || "חסר"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted font-medium">{LABELS.champion}:</span>
                <span
                  className={`font-extrabold ${championName ? "text-accent-text" : "text-ink-muted"}`}
                >
                  {championName ? `🏆 ${championName}` : "טרם נקבע"}
                </span>
              </div>
            </div>
          </div>

          {/* Errors */}
          {hasErrors && (
            <div className="space-y-2 mb-4">
              <div className="text-sm font-extrabold text-danger">
                יש להשלים ({errors.length}):
              </div>
              {errors.map((err, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (err.action) err.action();
                    onClose();
                  }}
                  className="w-full text-right border-2 border-danger/40 rounded-2xl px-4 py-3 flex items-center justify-between gap-2 cursor-pointer hover:border-danger transition"
                  style={{ background: "var(--color-danger-soft)" }}
                >
                  <span className="text-sm text-danger font-bold">
                    {err.label}
                  </span>
                  <span className="text-danger text-xs font-extrabold inline-flex items-center gap-1">
                    תקן
                    <ArrowLeft size={14} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {!hasErrors && (
            <div className="text-center py-4">
              <div className="text-4xl mb-2 animate-pop-in">🎉</div>
              <p className="text-sm text-ink-muted font-medium">
                לאחר ההגשה הטופס יינעל. תוכל לפתוח אותו לעריכה בכל עת.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 pt-3 border-t-2 border-border flex gap-2">
          <button onClick={onClose} className="btn-duo btn-duo-ghost flex-1">
            {hasErrors ? "חזרה" : "ביטול"}
          </button>
          {!hasErrors && (
            <button onClick={onSubmit} className="btn-duo btn-duo-primary flex-1">
              הגש טופס
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
