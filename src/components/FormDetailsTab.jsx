import { saveBonusPrediction, updateFormDetails } from "../store";
import FormIconPicker from "./FormIconPicker";

export default function FormDetailsTab({ activeForm, activeFormId, canEdit }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <h3 className="font-bold text-sm text-primary mb-1">📝 פרטי הטופס</h3>
        <p className="text-xs text-gray-400 mb-3">
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
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3 ${!canEdit ? "opacity-60 bg-gray-50" : ""}`}
        />
        <div className="mb-3">
          <label className="block text-xs font-semibold text-ink-muted mb-2">אייקון הטופס</label>
          <FormIconPicker
            value={activeForm.formIcon || "📋"}
            onChange={(icon) => canEdit && updateFormDetails(activeFormId, { formIcon: icon })}
          />
        </div>
        {(() => {
          const budgetValue = activeForm.budgetNumber || "";
          const budgetError = budgetValue && (!/^\d+$/.test(budgetValue) || parseInt(budgetValue) < 100 || parseInt(budgetValue) > 9999);
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
                className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? "opacity-60 bg-gray-50" : ""}`}
              />
              {budgetError && <p className="text-xs text-red-500 mt-1">מספר תקציב חייב להיות מספר שלם בין 100 ל-9999</p>}
            </>
          );
        })()}
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <h3 className="font-bold text-sm text-primary mb-1">
          ⚽ מלך השערים (8 נק׳)
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          מי יהיה מלך השערים? שערים מבעיטות הכרעה לא נספרים.
        </p>
        <input
          type="text"
          value={activeForm.topScorer || ""}
          disabled={!canEdit}
          onChange={(e) =>
            saveBonusPrediction(activeFormId, "topScorer", e.target.value)
          }
          placeholder="הכנס שם שחקן..."
          title="ניחוש מלך השערים — 8 נקודות בונוס"
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? "opacity-60 bg-gray-50" : ""}`}
        />
      </div>
    </div>
  );
}
