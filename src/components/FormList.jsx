import { useState, useCallback } from "react";
import { normalizeStatus } from "../utils/helpers";
import { groupMatches, knockoutMatches } from "../data/matches";
import { reopenForm, createForm, deleteForm, setActiveFormId } from "../store";
import { useToast } from "./Toast";

const totalMatches = groupMatches.length + knockoutMatches.length;

export default function FormList({ forms, user, settings, onShowAllForms }) {
  const showToast = useToast();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormName, setNewFormName] = useState("");

  const handleCreateForm = useCallback(() => {
    if (!user) return;
    const name = newFormName.trim() || `טופס ${forms.length + 1}`;
    try {
      createForm(user.id, name);
      setNewFormName("");
      setShowNewForm(false);
      showToast(`"${name}" נוצר בהצלחה`);
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [user, newFormName, forms.length, showToast]);

  const handleDeleteForm = useCallback(
    (formId) => {
      deleteForm(formId);
      showToast("הטופס נמחק");
    },
    [showToast],
  );

  return (
    <div>
      <h1 className="text-xl font-extrabold text-primary mb-4 tracking-tight">
        הניחושים שלך
      </h1>

      {forms.length === 0 && !showNewForm && (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">📋</div>
          <p className="font-bold text-gray-700 text-base mb-1">ברוך הבא! צור טופס ניחושים ראשון</p>
          <p className="text-gray-400 text-sm">לחץ על &quot;+ טופס חדש&quot; למטה כדי להתחיל לנחש תוצאות משחקים</p>
        </div>
      )}

      <div className="space-y-2.5 mb-4">
        {forms.map((form) => {
          const formStatus = normalizeStatus(form.status);
          return (
            <div
              key={form.formId}
              className={`bg-white rounded-2xl p-4 border shadow-sm card-hover ${
                formStatus === "submitted"
                  ? "border-green-200"
                  : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    formStatus === "submitted"
                      ? "bg-green-100 text-green-600"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {formStatus === "submitted" ? "✓" : (form.formName || "?")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate text-gray-800">
                    {form.formName || "טופס ללא שם"}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {Object.keys(form.matches || {}).length}/{totalMatches}{" "}
                    משחקים
                    {form.budgetNumber ? ` • תקציב: ${form.budgetNumber}` : ""}
                  </div>
                </div>
                <span
                  className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${
                    formStatus === "submitted"
                      ? "bg-green-50 text-green-600"
                      : "bg-gray-50 text-gray-400"
                  }`}
                  title={formStatus === "submitted" ? "הטופס הוגש ולא ניתן לעריכה" : "הטופס עדיין בעריכה ולא הוגש"}
                >
                  {formStatus === "submitted" ? "✅ הוגש" : "טיוטה"}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setActiveFormId(form.formId)}
                  className="flex-1 bg-primary text-white text-sm font-bold py-2.5 rounded-xl hover:bg-primary-light transition border-none cursor-pointer"
                >
                  {formStatus === "draft" ? "עריכה" : "צפייה"}
                </button>
                {formStatus === "submitted" && !settings.predictionsLocked && (
                  <button
                    onClick={() => reopenForm(form.formId)}
                    className="px-3 py-2.5 bg-amber-50 text-amber-700 text-sm font-semibold rounded-xl hover:bg-amber-100 transition border-none cursor-pointer"
                  >
                    פתח לעריכה
                  </button>
                )}
                {formStatus === "draft" && (
                  <button
                    onClick={() => {
                      if (window.confirm(`למחוק את "${form.formName}"?`))
                        handleDeleteForm(form.formId);
                    }}
                    className="px-3 py-2.5 bg-red-50 text-red-400 text-sm font-semibold rounded-xl hover:bg-red-100 transition border-none cursor-pointer"
                  >
                    מחק
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onShowAllForms}
        className="w-full bg-white text-primary font-bold py-3.5 rounded-2xl border-2 border-primary/20 hover:border-primary/40 hover:bg-gray-50 transition text-sm mb-3 cursor-pointer shadow-sm"
      >
        👀 צפייה בטפסים של כולם
      </button>

      {showNewForm ? (
        <div className="bg-white rounded-2xl p-5 border-2 border-primary/30 shadow-sm">
          <h3 className="font-bold text-sm text-primary mb-3">טופס חדש</h3>
          <input
            type="text"
            value={newFormName}
            onChange={(e) => setNewFormName(e.target.value)}
            placeholder={`טופס ${forms.length + 1}`}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 mb-3"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateForm}
              className="flex-1 bg-primary text-white font-bold py-3 rounded-2xl hover:bg-primary-light transition text-sm border-none cursor-pointer shadow-sm"
            >
              צור טופס
            </button>
            <button
              onClick={() => {
                setShowNewForm(false);
                setNewFormName("");
              }}
              className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-50 transition cursor-pointer"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNewForm(true)}
          className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition text-base border-none cursor-pointer shadow-sm"
        >
          + טופס חדש
        </button>
      )}
    </div>
  );
}
