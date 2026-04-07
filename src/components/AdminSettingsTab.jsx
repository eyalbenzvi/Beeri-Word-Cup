import { useRef } from "react";
import { useNavigation } from "../hooks/useNavigation";
import {
  updateSettings,
  exportAllData,
  importAllData,
  clearAllData,
  clearMatchResults,
} from "../store";

export default function AdminSettingsTab({
  settings,
  users,
  allPredictions,
  results,
}) {
  const { navigate } = useNavigation();
  const fileInputRef = useRef(null);

  const downloadBackup = (label = "backup") => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beeri-worldcup-${label}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beeri-worldcup-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // Validate schema
        const validKeys = ["users", "predictions", "matchResults", "settings", "actualBonuses", "actualAdvancing"];
        const dataKeys = Object.keys(data);
        if (dataKeys.length === 0 || !dataKeys.some(k => validKeys.includes(k))) {
          alert("קובץ לא תקין — חסרים שדות נדרשים (users, predictions, וכו')");
          return;
        }
        const invalidKeys = dataKeys.filter(k => !validKeys.includes(k));
        if (invalidKeys.length > 0) {
          alert(`שדות לא מוכרים בקובץ: ${invalidKeys.join(", ")}`);
          return;
        }
        // Confirm with preview
        const preview = dataKeys.map(k => {
          const count = typeof data[k] === "object" ? Object.keys(data[k]).length : "?";
          return `${k}: ${count} רשומות`;
        }).join("\n");
        if (!window.confirm(`ייבוא ידרוס את הנתונים הקיימים.\n\nתוכן הקובץ:\n${preview}\n\nלהמשיך?`)) return;
        importAllData(data);
        alert("כל הנתונים הקיימים הוחלפו בנתונים שיובאו בהצלחה");
      } catch {
        alert("קובץ לא תקין — שגיאה בפרסור JSON");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">בקרת טורניר</h3>
        <div className="flex items-center justify-between py-3 border-b border-gray-50">
          <div>
            <div className="text-sm font-medium">הקפאת טפסים</div>
            <div className="text-xs text-gray-400">
              מונע הגשה, עריכה ופתיחה מחדש
            </div>
          </div>
          <button
            onClick={() =>
              updateSettings({ predictionsLocked: !settings.predictionsLocked })
            }
            className={`relative w-12 h-6 rounded-full transition-colors ${settings.predictionsLocked ? "bg-red-400" : "bg-gray-300"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.predictionsLocked ? "translate-x-6" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-2">סטטיסטיקות</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(users).length}
            </div>
            <div className="text-xs text-gray-500">שחקנים</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(allPredictions).length}
            </div>
            <div className="text-xs text-gray-500">טפסים</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(results).length}
            </div>
            <div className="text-xs text-gray-500">תוצאות</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">גיבוי נתונים</h3>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex-1 bg-primary text-white text-sm py-2 rounded-lg hover:bg-primary-light transition"
          >
            ייצוא
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-white text-primary text-sm py-2 rounded-lg border-2 border-primary hover:bg-gray-50 transition"
          >
            ייבוא
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-red-200">
        <h3 className="font-semibold text-sm text-red-600 mb-2">אזור מסוכן</h3>
        <button
          onClick={() => {
            if (window.confirm("בטוח? פעולה זו תמחק את כל תוצאות האמת.")) {
              downloadBackup("before-clear-results");
              clearMatchResults();
            }
          }}
          className="w-full bg-orange-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-orange-600 transition mb-3"
        >
          מחק את כל תוצאות האמת
        </button>
        <p className="text-xs text-gray-400 mb-3">
          מחיקת כל הנתונים: משתמשים, ניחושים, תוצאות. לא ניתן לבטל.
        </p>
        <button
          onClick={() => {
            if (!window.confirm("בטוח? פעולה זו תמחק את כל הנתונים — משתמשים, ניחושים ותוצאות.")) return;
            const typed = window.prompt("הקלד DELETE לאישור סופי:");
            if (typed !== "DELETE") return;
            downloadBackup("before-clear-all");
            clearAllData();
            navigate("home");
          }}
          className="w-full bg-red-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-red-600 transition"
        >
          מחק את כל הנתונים
        </button>
      </div>
    </div>
  );
}
