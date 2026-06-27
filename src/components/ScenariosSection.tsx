import { useScenarioData } from "../hooks/useScenarioRun";
import { useCurrentUser } from "../hooks/useStore";
import ScenarioExplorer from "./ScenarioExplorer";
import Spinner from "./Spinner";

// Read-only scenarios view: loads the server-computed run and renders the
// explorer. Shared by the user "נתונים" tab and the admin tab (the latter
// passes showRecompute to expose a manual "recompute now" poke).
export default function ScenariosSection({ showRecompute = false }: { showRecompute?: boolean }) {
  const { state, recompute } = useScenarioData();
  const { user } = useCurrentUser();
  const run = state.result;

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
          <button onClick={recompute} className="btn-duo btn-duo-blue btn-duo-sm shrink-0" title="מפעיל חישוב מחדש בשרת (כדקות)">
            חשב מחדש
          </button>
        )}
      </div>

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
