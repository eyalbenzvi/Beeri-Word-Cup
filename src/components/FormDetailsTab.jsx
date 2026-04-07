import { saveBonusPrediction, updateFormDetails } from "../store";

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
        <input
          type="text"
          value={activeForm.budgetNumber || ""}
          disabled={!canEdit}
          maxLength={20}
          onChange={(e) =>
            updateFormDetails(activeFormId, { budgetNumber: e.target.value })
          }
          placeholder="מספר תקציב לחיוב (אופציונלי)"
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? "opacity-60 bg-gray-50" : ""}`}
        />
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
