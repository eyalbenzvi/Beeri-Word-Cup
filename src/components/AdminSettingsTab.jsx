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
        importAllData(JSON.parse(ev.target.result));
        alert("הנתונים יובאו בהצלחה!");
      } catch {
        alert("קובץ לא תקין");
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
        <div className="py-3">
          <div className="text-sm font-medium mb-2">קוד מנהל</div>
          <input
            type="text"
            defaultValue={settings.adminPin || "1234"}
            onBlur={(e) => updateSettings({ adminPin: e.target.value })}
            className="w-32 px-3 py-1.5 border rounded text-sm"
          />
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
            if (
              window.confirm(
                "בטוח? פעולה זו תמחק את כל הנתונים — משתמשים, ניחושים ותוצאות.",
              )
            ) {
              clearAllData();
              navigate("home");
            }
          }}
          className="w-full bg-red-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-red-600 transition"
        >
          מחק את כל הנתונים
        </button>
      </div>
    </div>
  );
}
