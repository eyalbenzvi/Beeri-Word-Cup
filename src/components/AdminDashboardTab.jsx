import { useMemo } from "react";
import { updateSettings } from "../store";
import { TOTAL_MATCH_COUNT, ALL_MATCHES } from "../data/matches";

export default function AdminDashboardTab({
  settings,
  users,
  allPredictions,
  results,
}) {
  const userCount = Object.keys(users).length;

  const { submittedCount, draftCount } = useMemo(() => {
    const formEntries = Object.entries(allPredictions);
    let submitted = 0;
    let draft = 0;
    for (const [, p] of formEntries) {
      if (p.status === "submitted" || p.status === "approved") submitted++;
      else draft++;
    }
    return { submittedCount: submitted, draftCount: draft };
  }, [allPredictions]);

  const resultsCount = Object.keys(results).length;
  const progressPct =
    TOTAL_MATCH_COUNT > 0
      ? Math.round((resultsCount / TOTAL_MATCH_COUNT) * 100)
      : 0;

  const missingMatchIds = useMemo(() => {
    const have = new Set(Object.keys(results));
    return ALL_MATCHES.filter((m) => !have.has(m.id)).slice(0, 8);
  }, [results]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-3">סטטוס טורניר</h3>
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>תוצאות שהוזנו</span>
            <span className="font-mono tabular-nums">
              {resultsCount} / {TOTAL_MATCH_COUNT}
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{progressPct}%</div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-3">ניחושים</h3>
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>טפסים שהוגשו</span>
            <span className="font-mono tabular-nums">
              {submittedCount} / {Object.keys(allPredictions).length || 0}
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{
                width:
                  Object.keys(allPredictions).length > 0
                    ? `${Math.round(
                        (submittedCount / Object.keys(allPredictions).length) *
                          100,
                      )}%`
                    : "0%",
              }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-primary tabular-nums">
              {userCount}
            </div>
            <div className="text-gray-500">משתמשים</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-green-600 tabular-nums">
              {submittedCount}
            </div>
            <div className="text-gray-500">הוגשו</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-amber-600 tabular-nums">
              {draftCount}
            </div>
            <div className="text-gray-500">טיוטות</div>
          </div>
        </div>
      </div>

      {missingMatchIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="text-sm font-semibold text-amber-800 mb-1">
            משחקים ללא תוצאה (דוגמה)
          </div>
          <ul className="text-xs text-amber-700 space-y-0.5 font-mono">
            {missingMatchIds.map((m) => (
              <li key={m.id}>
                {m.id}
                {m.label ? ` — ${m.label}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 border-2 border-primary/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">הקפאת טפסים</div>
            <div className="text-xs text-gray-500">
              {settings.predictionsLocked
                ? "הגשה ועריכה חסומות"
                : "הגשה ועריכה פתוחות"}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              updateSettings({ predictionsLocked: !settings.predictionsLocked })
            }
            className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${
              settings.predictionsLocked ? "bg-red-400" : "bg-gray-300"
            }`}
            aria-pressed={settings.predictionsLocked}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                settings.predictionsLocked ? "translate-x-7" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
