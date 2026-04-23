import { useRef, useState } from "react";
import { useNavigation } from "../hooks/useNavigation";
import {
  updateSettings,
  exportAllData,
  clearAllData,
  clearMatchResults,
} from "../store";
import { TOP_SCORER_PLAYERS } from "../data/players";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";

export default function AdminSettingsTab({
  settings,
  users,
  allPredictions,
  results,
}) {
  const { navigate } = useNavigation();
  const playerFileRef = useRef(null);
  const [playerCount, setPlayerCount] = useState(settings.topScorerPlayers?.length || 0);
  const showToast = useToast();
  const confirm = useConfirm();

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

  return (
    <div className="space-y-4">
      <div className="card-duo">
        <h3 className="font-bold text-sm mb-3">בקרת טורניר</h3>
        <div className="flex items-center justify-between py-3 border-b border-gray-50">
          <div>
            <div className="text-sm font-medium">הקפאת טפסים</div>
            <div className="text-xs text-ink-muted">
              מונע הגשה, עריכה ופתיחה מחדש
            </div>
          </div>
          <button
            onClick={() =>
              updateSettings({ predictionsLocked: !settings.predictionsLocked })
            }
            className={`relative w-12 h-6 rounded-full transition-colors ${settings.predictionsLocked ? "bg-danger" : "bg-border-strong"}`}
            aria-pressed={settings.predictionsLocked}
            aria-label="נעל ניחושים"
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.predictionsLocked ? "translate-x-6" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </div>

      <div className="card-duo">
        <h3 className="font-bold text-sm mb-2">סטטיסטיקות</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-bg-soft rounded-xl border-2 border-border p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(users).length}
            </div>
            <div className="text-xs text-ink-muted">שחקנים</div>
          </div>
          <div className="bg-bg-soft rounded-xl border-2 border-border p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(allPredictions).length}
            </div>
            <div className="text-xs text-ink-muted">טפסים</div>
          </div>
          <div className="bg-bg-soft rounded-xl border-2 border-border p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(results).length}
            </div>
            <div className="text-xs text-ink-muted">תוצאות</div>
          </div>
        </div>
      </div>

      <div className="card-duo">
        <h3 className="font-bold text-sm mb-3">רשימת מלך שערים</h3>
        <div className="text-xs text-ink-muted mb-3">
          {settings.topScorerPlayers?.length > 0
            ? `רשימה מותאמת: ${settings.topScorerPlayers.length} שחקנים`
            : `רשימה ברירת מחדל: ${TOP_SCORER_PLAYERS.length} שחקנים`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              updateSettings({ topScorerPlayers: TOP_SCORER_PLAYERS });
              setPlayerCount(TOP_SCORER_PLAYERS.length);
              showToast("רשימת השחקנים אופסה לברירת המחדל");
            }}
            className="flex-1 bg-primary text-white text-sm py-2 rounded-xl hover:bg-primary-light transition"
          >
            אפס לברירת מחדל
          </button>
          <button
            onClick={() => playerFileRef.current?.click()}
            className="flex-1 bg-white text-primary text-sm py-2 rounded-xl border-2 border-primary hover:bg-bg-soft transition"
          >
            טען רשימה מקובץ
          </button>
          <input
            ref={playerFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                try {
                  const data = JSON.parse(ev.target.result);
                  if (!Array.isArray(data) || !data[0]?.team || !data[0]?.name) {
                    showToast("פורמט לא תקין — נדרש מערך של { team, name, nameHe? }", "error");
                    return;
                  }
                  const missingHe = data.filter((p) => !p.nameHe).length;
                  updateSettings({ topScorerPlayers: data });
                  setPlayerCount(data.length);
                  if (missingHe > 0) {
                    showToast(`נטענו ${data.length} שחקנים (${missingHe} ללא nameHe — חיפוש בעברית לא יעבוד עבורם)`);
                  } else {
                    showToast(`נטענו ${data.length} שחקנים`);
                  }
                } catch {
                  showToast("שגיאה בקריאת הקובץ", "error");
                }
              };
              reader.readAsText(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border-2 border-danger/30">
        <h3 className="font-bold text-sm text-danger mb-2">אזור מסוכן</h3>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: "מחיקת תוצאות אמת",
              message: "פעולה זו תמחק את כל תוצאות האמת\n(גיבוי יורד אוטומטית לפני המחיקה)",
              confirmLabel: "מחק תוצאות",
              variant: "danger",
            });
            if (!ok) return;
            downloadBackup("before-clear-results");
            clearMatchResults();
          }}
          className="btn-duo btn-duo-orange w-full mb-3"
        >
          מחק את כל תוצאות האמת
        </button>
        <p className="text-xs text-ink-muted mb-3">
          מחיקת כל הנתונים: משתמשים, ניחושים, תוצאות. לא ניתן לבטל.
        </p>
        <button
          onClick={async () => {
            const firstOk = await confirm({
              title: "מחיקת כל הנתונים",
              message: "פעולה זו תמחק את כל הנתונים — משתמשים, ניחושים ותוצאות\n(גיבוי יורד אוטומטית)",
              confirmLabel: "המשך למחיקה",
              variant: "danger",
            });
            if (!firstOk) return;
            const secondOk = await confirm({
              title: "אישור סופי",
              message: "האם אתה בטוח לחלוטין\n\nמחיקה מלאה של כל הנתונים בבסיס הנתונים.\nלחיצה על \"מחק הכל\" תשמיד את כל הנתונים.",
              confirmLabel: "מחק הכל",
              cancelLabel: "בטל",
              variant: "danger",
            });
            if (!secondOk) return;
            downloadBackup("before-clear-all");
            clearAllData();
            navigate("home");
          }}
          className="btn-duo btn-duo-danger w-full"
        >
          מחק את כל הנתונים
        </button>
      </div>
    </div>
  );
}
