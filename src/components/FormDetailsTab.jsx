import { saveBonusPrediction, updateFormDetails } from "../store";
import PlayerAutocomplete from "./PlayerAutocomplete";
import { LABELS } from "../constants/messages";
import { isBudgetValid, BUDGET_RANGE_MESSAGE } from "../utils/formValidation";

export default function FormDetailsTab({ activeForm, activeFormId, canEdit, championName }) {
  return (
    <div className="space-y-4">
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-1">📝 פרטי הטופס</h3>
        <p className="text-xs text-ink-muted mb-3">
          שם הטופס הוא מה שיוצג בטבלת התוצאות
        </p>
        <input
          type="text"
          value={activeForm.formName || ""}
          disabled={!canEdit}
          onChange={(e) =>
            updateFormDetails(activeFormId, { formName: e.target.value })
          }
          placeholder="שם הטופס..."
          className={`input-duo mb-3 ${!canEdit ? "opacity-60" : ""}`}
        />
        {(() => {
          const budgetValue = activeForm.budgetNumber || "";
          const budgetError = budgetValue && !isBudgetValid(budgetValue);
          return (
            <>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={budgetValue}
                disabled={!canEdit}
                maxLength={20}
                onChange={(e) =>
                  updateFormDetails(activeFormId, { budgetNumber: e.target.value })
                }
                placeholder="מספר תקציב (100-9999)"
                className={`input-duo ${!canEdit ? "opacity-60" : ""}`}
              />
              {budgetError && <p className="text-xs text-danger font-bold mt-1">{BUDGET_RANGE_MESSAGE}</p>}
            </>
          );
        })()}
      </div>

      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-1">
          ⚽ {LABELS.topScorer} (8 {LABELS.pointsShort})
        </h3>
        <p className="text-xs text-ink-muted mb-3">
          מי יהיה {LABELS.topScorer}? שערים מבעיטות הכרעה לא נספרים.
        </p>
        <PlayerAutocomplete
          value={activeForm.topScorer || ""}
          disabled={!canEdit}
          onChange={(val) =>
            saveBonusPrediction(activeFormId, "topScorer", val)
          }
        />
      </div>

      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-1">
          🏆 {LABELS.champion} (10 {LABELS.pointsShort})
        </h3>
        <p className="text-xs text-ink-muted mb-3">
          נגזר מתוצאות הגמר שמילאת בטופס.
        </p>
        <div className={`w-full px-4 py-3 border-2 border-border rounded-2xl text-base ${championName ? "text-accent-text font-extrabold" : "text-ink-muted"}`} style={{ background: "var(--color-bg-soft)" }}>
          {championName ? `🏆 ${championName}` : "טרם נקבע"}
        </div>
      </div>
    </div>
  );
}
