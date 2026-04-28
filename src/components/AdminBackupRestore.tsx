import { useRef, useState } from "react";
import {
  exportAllData,
  importAllData,
  validateBackupShape,
} from "../store";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";

function downloadJson(data, label) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `beeri-worldcup-${label}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminBackupRestore() {
  const fileInputRef = useRef(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const showToast = useToast();
  const confirm = useConfirm();

  const handleBackup = () => {
    try {
      const data = exportAllData();
      downloadJson(data, "backup");
      showToast(
        `גיבוי הורד: ${data.counts.users} משתמשים, ${data.counts.predictions} טפסים, ${data.counts.matchResults} תוצאות`,
      );
    } catch (err) {
      console.error("Backup failed:", err);
      showToast("שגיאה בהורדת הגיבוי", "error");
    }
  };

  const handleFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => showToast("שגיאה בקריאת הקובץ", "error");
    reader.onload = async (ev) => {
      let data;
      try {
        data = JSON.parse(ev.target!.result as string);
      } catch {
        showToast("קובץ לא תקין — שגיאה בפרסור JSON", "error");
        return;
      }

      const shape = validateBackupShape(data);
      if (!shape.ok) {
        showToast(`קובץ לא תקין: ${shape.errors[0]}`, "error");
        return;
      }

      const preview = [
        `משתמשים: ${shape.counts.users}`,
        `טפסים: ${shape.counts.predictions}`,
        `תוצאות: ${shape.counts.matchResults}`,
        data.settings ? `הגדרות: ${data.settings.predictionsLocked ? "נעול" : "פתוח"}` : null,
        data.exportedAt ? `תאריך גיבוי: ${new Date(data.exportedAt).toLocaleString("he-IL")}` : null,
      ].filter(Boolean).join("\n");

      const firstOk = await confirm({
        title: "שחזור מסד נתונים",
        message: `הפעולה תמחק את כל הנתונים הקיימים ותחליף אותם בנתונים מהקובץ.\n\nתוכן הקובץ:\n${preview}\n\nגיבוי של המצב הנוכחי יורד אוטומטית לפני השחזור.`,
        confirmLabel: "המשך",
        variant: "danger",
      });
      if (!firstOk) return;

      const secondOk = await confirm({
        title: "אישור סופי",
        message: "פעולה זו בלתי הפיכה ללא הגיבוי האוטומטי.\nלחיצה על \"שחזר\" תחליף את כל הנתונים במסד.",
        confirmLabel: "שחזר",
        cancelLabel: "בטל",
        variant: "danger",
      });
      if (!secondOk) return;

      setIsRestoring(true);
      try {
        try {
          const pre = exportAllData();
          downloadJson(pre, "before-restore");
        } catch (err) {
          console.error("Pre-restore backup failed:", err);
          showToast("אזהרה: לא הצלחנו להוריד גיבוי אוטומטי", "error");
        }

        const result = await importAllData(data);
        showToast(
          `שחזור הושלם: ${result.counts.users} משתמשים, ${result.counts.predictions} טפסים`,
        );
      } catch (err) {
        console.error("Restore failed:", err);
        showToast(`שחזור נכשל: ${err?.message || "שגיאה לא ידועה"}`, "error");
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-2">
          גיבוי מסד נתונים
        </h3>
        <p className="text-xs text-ink-muted mb-3">
          מוריד קובץ JSON עם כל הנתונים: משתמשים, טפסים, תוצאות, הגדרות ובונוסים.
        </p>
        <button
          type="button"
          onClick={handleBackup}
          disabled={isRestoring}
          className="btn-duo btn-duo-primary w-full md:w-auto md:min-w-[200px]"
        >
          הורד גיבוי
        </button>
      </div>

      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-2">
          שחזור מסד נתונים מגיבוי
        </h3>
        <p className="text-xs text-ink-muted mb-3">
          טוען קובץ גיבוי ומחליף את כל הנתונים הקיימים.
          משתמשים עם הרשאת מנהל נשמרים כמנהלים גם אחרי השחזור.
          <br />
          <span className="text-danger font-bold">פעולה זו מוחקת את כל הנתונים הקיימים.</span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChosen}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRestoring}
          className="btn-duo btn-duo-danger w-full md:w-auto md:min-w-[240px]"
        >
          {isRestoring ? "משחזר..." : "בחר קובץ ושחזר"}
        </button>
      </div>
    </div>
  );
}
