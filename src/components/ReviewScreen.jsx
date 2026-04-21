import { getPlayerDisplayName } from "../utils/playerSearch";
import { useSettings } from "../hooks/useStore";
import { resolvePlayerList } from "../utils/playerSearch";

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
  const topScorerDisplay = activeForm.topScorer?.trim()
    ? getPlayerDisplayName(activeForm.topScorer.trim(), playerList)
    : "";
  const hasErrors = errors.length > 0;
  const totalMatches = groupMatchesCount + knockoutMatchesCount;
  const totalFilled = predictedGroupCount + predictedKnockoutCount;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="סקירת טופס" className="bg-white rounded-2xl max-w-md w-full shadow-2xl max-h-[85vh] flex flex-col">
        <div className="p-5 pb-3 border-b border-gray-100">
          <div className="text-3xl text-center mb-2">
            {hasErrors ? "⚠️" : "📋"}
          </div>
          <h3 className="text-lg font-bold text-center text-primary">
            {hasErrors ? "סקירת הטופס" : "הטופס מוכן להגשה!"}
          </h3>
        </div>

        <div className="overflow-y-auto flex-1 p-5 pt-3">
          <div className="bg-gray-50 rounded-xl p-3.5 mb-4">
            <div className="text-xs text-gray-600 space-y-1.5">
              <div className="flex justify-between">
                <span>טופס:</span>
                <span className="font-bold text-gray-800">
                  {activeForm.formName || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>משחקים:</span>
                <span
                  className={`font-bold ${totalFilled === totalMatches ? "text-green-600" : "text-amber-600"}`}
                >
                  {totalFilled} / {totalMatches}
                </span>
              </div>
              <div className="flex justify-between">
                <span>מלך שערים:</span>
                <span
                  className={`font-bold ${topScorerDisplay ? "text-gray-800" : "text-red-500"}`}
                >
                  {topScorerDisplay || "חסר"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>מספר תקציב:</span>
                <span
                  className={`font-bold ${activeForm.budgetNumber?.trim() ? "text-gray-800" : "text-red-500"}`}
                >
                  {activeForm.budgetNumber?.trim() || "חסר"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>אלופה:</span>
                <span
                  className={`font-bold ${championName ? "text-yellow-700" : "text-gray-400"}`}
                >
                  {championName ? `🏆 ${championName}` : "טרם נקבע"}
                </span>
              </div>
            </div>
          </div>

          {/* Errors */}
          {hasErrors && (
            <div className="space-y-2 mb-4">
              <div className="text-sm font-bold text-red-700">
                יש להשלים ({errors.length}):
              </div>
              {errors.map((err, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (err.action) err.action();
                    onClose();
                  }}
                  className="w-full text-right bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-red-100 transition border-none"
                >
                  <span className="text-xs text-red-600 font-medium">
                    {err.label}
                  </span>
                  <span className="text-red-400 text-xs">← תקן</span>
                </button>
              ))}
            </div>
          )}

          {!hasErrors && (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-sm text-gray-600">
                לאחר ההגשה הטופס יינעל. תוכל לפתוח אותו לעריכה בכל עת.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 pt-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition cursor-pointer"
          >
            {hasErrors ? "חזרה" : "ביטול"}
          </button>
          {!hasErrors && (
            <button
              onClick={onSubmit}
              className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition cursor-pointer border-none shadow-md"
            >
              הגש טופס
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
