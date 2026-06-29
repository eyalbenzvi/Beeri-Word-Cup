import { useState } from "react";
import {
  useScenarioData,
  DEFAULT_SIM_COUNT,
  AUTO_SIM_COUNT,
  MIN_SIM_COUNT,
  MAX_SIM_COUNT,
} from "../hooks/useScenarioRun";
import { useCurrentUser } from "../hooks/useStore";
import { useToast } from "./Toast";
import ScenarioExplorer from "./ScenarioExplorer";
import Spinner from "./Spinner";

// Read-only scenarios view: loads the server-computed run and renders the
// explorer. Shared by the user "נתונים" tab and the admin tab (the latter
// passes showRecompute to expose a run-count input + a recompute control with
// a server/local toggle).
type RunMode = "server" | "local";

export default function ScenariosSection({ showRecompute = false }: { showRecompute?: boolean }) {
  const { state, recompute, computeLocal, local } = useScenarioData();
  const { user } = useCurrentUser();
  const showToast = useToast();
  const [simCount, setSimCount] = useState<number>(DEFAULT_SIM_COUNT);
  // Default to LOCAL: it runs entirely in the browser, so it works even when
  // the Netlify background function isn't available — the reliable manual path.
  const [mode, setMode] = useState<RunMode>("local");
  const run = state.result;

  const handleRecompute = () => {
    const n = Math.min(MAX_SIM_COUNT, Math.max(MIN_SIM_COUNT, Math.round(simCount) || DEFAULT_SIM_COUNT));
    if (mode === "server") {
      recompute(n);
      showToast(`החישוב נשלח לשרת (${n.toLocaleString("he-IL")} הרצות) — יתעדכן בעוד כדקות`);
    } else {
      computeLocal(n);
      showToast(`מריץ חישוב מקומי (${n.toLocaleString("he-IL")} הרצות) — אל תסגרו את הדף`);
    }
  };

  const generatedAt = run
    ? new Date(run.meta.generatedAt).toLocaleString("he-IL", {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="card-duo">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div>
          <h3 className="font-extrabold text-base text-ink">🎲 תרחישים: אלופה + סגנית</h3>
          <p className="text-xs text-ink-muted font-medium mt-0.5">
            סימולציה של שארית הטורניר. בחרו גמר וראו מי צפוי להוביל.
          </p>
        </div>
        {showRecompute && (
          <div className="flex items-end gap-2 shrink-0">
            <label className="flex flex-col gap-1">
              <span className="text-2xs text-ink-muted font-extrabold">איפה לחשב</span>
              <div className="flex rounded-lg overflow-hidden border border-ink/10">
                <button
                  type="button"
                  onClick={() => setMode("local")}
                  className={`px-2.5 py-1.5 text-2xs font-extrabold transition-colors ${
                    mode === "local" ? "bg-blue-600 text-white" : "bg-white text-ink-muted"
                  }`}
                  aria-pressed={mode === "local"}
                >
                  מקומי
                </button>
                <button
                  type="button"
                  onClick={() => setMode("server")}
                  className={`px-2.5 py-1.5 text-2xs font-extrabold transition-colors ${
                    mode === "server" ? "bg-blue-600 text-white" : "bg-white text-ink-muted"
                  }`}
                  aria-pressed={mode === "server"}
                >
                  שרת
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs text-ink-muted font-extrabold">מספר הרצות</span>
              <input
                type="number"
                min={MIN_SIM_COUNT}
                max={MAX_SIM_COUNT}
                step={1000}
                value={simCount}
                onChange={(e) => setSimCount(Number(e.target.value))}
                className="input-duo input-duo-sm w-28"
                aria-label="מספר הרצות לסימולציה"
              />
            </label>
            <button
              onClick={handleRecompute}
              disabled={local.running}
              className="btn-duo btn-duo-blue btn-duo-sm disabled:opacity-60"
              title={
                mode === "server"
                  ? `שולח חישוב מחדש לשרת (${MIN_SIM_COUNT.toLocaleString("he-IL")}–${MAX_SIM_COUNT.toLocaleString("he-IL")} הרצות, כדקות)`
                  : `מריץ חישוב מחדש בדפדפן (${MIN_SIM_COUNT.toLocaleString("he-IL")}–${MAX_SIM_COUNT.toLocaleString("he-IL")} הרצות, כדקה-שתיים)`
              }
            >
              {local.running ? `מחשב… ${local.percent}%` : "חשב מחדש"}
            </button>
          </div>
        )}
      </div>
      {showRecompute && (
        <p className="text-3xs text-ink-light font-medium mb-1">
          {mode === "server"
            ? `שרת: רץ ברקע (כדקות), זמין לכל המכשירים. רץ אוטומטית אחרי כל תוצאה (${AUTO_SIM_COUNT.toLocaleString("he-IL")} הרצות).`
            : `מקומי: רץ בדפדפן הזה (גיבוי לכשהשרת לא זמין). השאירו את הדף פתוח עד הסיום.`}
        </p>
      )}
      {showRecompute && local.error && (
        <p className="text-3xs text-red-600 font-bold mb-1">החישוב המקומי נכשל. נסו שוב או עברו לשרת.</p>
      )}
      {showRecompute && local.saveError && (
        <p className="text-3xs text-red-600 font-bold mb-1">החישוב הסתיים אך השמירה נכשלה — התוצאה לא נשמרה. נסו שוב.</p>
      )}

      {state.loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : !run || run.scenarios.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-5xl mb-2">📊</div>
          <p className="text-sm text-ink-muted font-medium">
            {state.error ? "טעינת הנתונים נכשלה. נסו לרענן." : "עוד אין נתוני תרחישים — יחושבו אוטומטית אחרי התוצאה הבאה."}
          </p>
        </div>
      ) : (
        <>
          <ScenarioExplorer run={run} currentUserId={user?.id || null} />
          {generatedAt && (
            <p className="text-3xs text-ink-light font-bold mt-3 text-center">
              חושב: {generatedAt} · {run.meta.simCount.toLocaleString("he-IL")} הרצות · {run.meta.formCount} טפסים
            </p>
          )}
        </>
      )}
    </div>
  );
}
