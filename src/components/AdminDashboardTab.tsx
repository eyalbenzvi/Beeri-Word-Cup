import { useMemo } from "react";
import { updateSettings } from "../store";
import { TOTAL_MATCH_COUNT, ALL_MATCHES } from "../data/matches";

// Preview cap on the "missing matches" list shown on the admin dashboard.
// Beyond this we truncate — the dashboard is a glance, not a worklist.
const MISSING_MATCHES_PREVIEW_LIMIT = 8;

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
    for (const [, pAny] of formEntries) {
      const p = pAny as any;
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
    return ALL_MATCHES.filter((m) => !have.has(m.id)).slice(0, MISSING_MATCHES_PREVIEW_LIMIT);
  }, [results]);

  return (
    <div className="space-y-4">
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-3">סטטוס טורניר</h3>
        <div className="mb-2">
          <div className="flex justify-between text-sm text-ink-muted mb-1 font-bold">
            <span>תוצאות שהוזנו</span>
            <span className="font-mono tabular-nums">
              {resultsCount} / {TOTAL_MATCH_COUNT}
            </span>
          </div>
          <div className="h-3 bg-bg-soft rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="text-xs text-ink-muted mt-1 font-bold">{progressPct}%</div>
        </div>
      </div>

      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-3">ניחושים</h3>
        <div className="mb-2">
          <div className="flex justify-between text-sm text-ink-muted mb-1 font-bold">
            <span>טפסים שהוגשו</span>
            <span className="font-mono tabular-nums">
              {submittedCount} / {Object.keys(allPredictions).length || 0}
            </span>
          </div>
          <div className="h-3 bg-bg-soft rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-primary rounded-full transition-all"
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
          <div className="rounded-xl p-3 border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
            <div className="text-2xl font-extrabold text-primary-dark tabular-nums">
              {userCount}
            </div>
            <div className="text-ink-muted font-bold">משתמשים</div>
          </div>
          <div className="rounded-xl p-3 border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
            <div className="text-2xl font-extrabold text-primary-dark tabular-nums">
              {submittedCount}
            </div>
            <div className="text-ink-muted font-bold">הוגשו</div>
          </div>
          <div className="rounded-xl p-3 border-2 border-accent/30" style={{ background: "var(--color-accent-soft)" }}>
            <div className="text-2xl font-extrabold text-accent-text tabular-nums">
              {draftCount}
            </div>
            <div className="text-ink-muted font-bold">טיוטות</div>
          </div>
        </div>
      </div>

      {missingMatchIds.length > 0 && (
        <div className="border-2 border-accent rounded-2xl p-4" style={{ background: "var(--color-accent-soft)" }}>
          <div className="text-sm font-extrabold text-accent-text mb-1">
            משחקים ללא תוצאה (דוגמה)
          </div>
          <ul className="text-xs text-accent-text space-y-0.5 font-mono font-bold">
            {missingMatchIds.map((m) => (
              <li key={m.id}>
                {m.id}
                {m.label ? ` — ${m.label}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-duo" style={{ borderColor: "var(--color-primary)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold text-ink">הקפאת טפסים</div>
            <div className="text-xs text-ink-muted font-medium">
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
            className={`relative w-14 h-7 rounded-full transition-colors shrink-0 border-2 ${
              settings.predictionsLocked ? "bg-danger border-danger" : "bg-border border-border-strong"
            }`}
            aria-pressed={settings.predictionsLocked}
          >
            <span
              className={`absolute top-0 w-6 h-6 bg-white rounded-full transition-transform ${
                settings.predictionsLocked ? "translate-x-7" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
