import { useMemo, useState } from "react";
import { useScenarioRun } from "../hooks/useScenarioRun";
import { useUsers } from "../hooks/useStore";
import { getTeamByCode } from "../data/teams";
import type { ScenarioRunResult, Scenario } from "../utils/scenarioSim";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const teamLabel = (code: string) => {
  const t = getTeamByCode(code);
  return t ? `${t.flag} ${t.name}` : code;
};

function useFormLabeler(run: ScenarioRunResult | null) {
  const users = useUsers();
  return (formId: string) => {
    const f = run?.forms[formId];
    const owner = f ? users[f.userId]?.displayName : null;
    const name = f?.formName || "טופס";
    return owner ? `${name} · ${owner}` : name;
  };
}

// Full per-form table for one champion+runner-up final: every form's win%,
// average rank, and average points within that scenario.
function ScenarioTable({
  scenario,
  run,
  label,
}: {
  scenario: Scenario;
  run: ScenarioRunResult;
  label: (formId: string) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const r = run.formOrder.map((formId, i) => ({
      formId,
      winProb: scenario.winProb[i],
      avgRank: scenario.avgRank[i],
      avgPoints: scenario.avgPoints[i],
    }));
    r.sort((a, b) => b.winProb - a.winProb || a.avgRank - b.avgRank);
    return r;
  }, [scenario, run.formOrder]);

  const indicative = scenario.samples < run.meta.minScenarioSamples;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="font-extrabold text-sm text-ink">
          {teamLabel(scenario.champion)} אלופה · {teamLabel(scenario.runnerUp)} סגנית
        </span>
        <span className="badge-duo badge-duo-secondary shrink-0">{pct(scenario.prob)}</span>
      </div>
      <div className="text-2xs text-ink-light font-bold mb-2">
        {scenario.samples.toLocaleString("he-IL")} תרחישים
        {indicative && <span className="text-accent-text"> · אינדיקטיבי בלבד</span>}
      </div>

      <div className="flex items-center gap-2 text-3xs text-ink-light font-extrabold pb-1.5 border-b-2 border-border">
        <span className="w-6 shrink-0">#</span>
        <span className="flex-1">טופס</span>
        <span className="w-16 text-left shrink-0">מקום ראשון</span>
        <span className="w-14 text-left shrink-0">דירוג ממוצע</span>
        <span className="w-16 text-left shrink-0">נק׳ ממוצע</span>
      </div>
      <div className="mt-1">
        {(showAll ? rows : rows.slice(0, 40)).map((r, i) => (
          <div key={r.formId} className="flex items-center gap-2 text-xs py-1 odd:bg-bg-soft rounded-lg px-1">
            <span className="w-6 text-ink-light font-bold shrink-0">{i + 1}</span>
            <span className="flex-1 font-bold text-ink truncate">{label(r.formId)}</span>
            <span className="w-16 text-left font-extrabold text-primary shrink-0">{pct(r.winProb)}</span>
            <span className="w-14 text-left text-ink-muted font-bold shrink-0">{r.avgRank.toFixed(1)}</span>
            <span className="w-16 text-left text-ink-muted font-bold shrink-0">{r.avgPoints.toFixed(1)}</span>
          </div>
        ))}
      </div>
      {rows.length > 40 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="btn-duo btn-duo-ghost btn-duo-sm mt-2 w-full"
        >
          {showAll ? "הצג פחות" : `הצג את כל ${rows.length} הטפסים`}
        </button>
      )}
    </div>
  );
}

export default function AdminScenariosTab() {
  const { state, compute } = useScenarioRun();
  const run = state.result;
  const label = useFormLabeler(run);

  const [pickChampion, setPickChampion] = useState<string | null>(null);
  const [pickRunnerUp, setPickRunnerUp] = useState<string | null>(null);

  const runnerUpOptions = useMemo(
    () =>
      run && pickChampion
        ? run.scenarios.filter((s) => s.champion === pickChampion).sort((a, b) => b.prob - a.prob)
        : [],
    [run, pickChampion],
  );
  const selectedScenario = useMemo(
    () => runnerUpOptions.find((s) => s.runnerUp === pickRunnerUp) || null,
    [runnerUpOptions, pickRunnerUp],
  );

  // Champions that actually have at least one tabled final (so the picker never
  // offers a champion with no selectable runner-up).
  const pickableChampions = useMemo(() => {
    if (!run) return [];
    const withScenario = new Set(run.scenarios.map((s) => s.champion));
    return run.champions.filter((c) => withScenario.has(c.code));
  }, [run]);

  const generatedAt = run
    ? new Date(run.meta.generatedAt).toLocaleString("he-IL", {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Control */}
      <div className="card-duo">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-extrabold text-base text-ink">🎯 תרחישים: אלופה + סגנית</h3>
            <p className="text-xs text-ink-muted font-medium mt-1">
              בחר את הגמר, וקבל לכל טופס דירוג ממוצע, נקודות ממוצעות וסיכוי למקום ראשון.
            </p>
          </div>
          <button onClick={compute} disabled={state.loading} className="btn-duo btn-duo-primary btn-duo-sm shrink-0">
            {state.loading ? "מריץ…" : run ? "הרץ מחדש" : "הרץ סימולציה"}
          </button>
        </div>

        {state.loading && (
          <div className="mt-3" aria-live="polite">
            <div className="h-3 rounded-full bg-bg-soft border-2 border-border overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${state.percent}%` }} />
            </div>
            <p className="text-2xs text-ink-light font-bold mt-1">
              {state.percent}% — החישוב יכול לקחת כדקה-שתיים. אפשר להישאר בעמוד.
            </p>
          </div>
        )}

        {state.error && <p className="text-xs text-danger font-bold mt-3">החישוב נכשל. נסה שוב.</p>}

        {run && !state.loading && (
          <>
            <p className="text-2xs text-ink-light font-bold mt-3">
              חושב: {generatedAt} · {run.meta.simCount.toLocaleString("he-IL")} תרחישים · {run.meta.formCount} טפסים
              {state.loadedFromStore && " · נטען מחישוב קודם"}
            </p>
            {state.saveError && (
              <div className="alert-danger-soft rounded-2xl p-2.5 mt-2">
                <span className="text-xs font-bold text-danger">
                  החישוב הצליח אך השמירה נכשלה — התוצאה לא תישמר לפעם הבאה. נסה להריץ שוב.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {!run && !state.loading && (
        <div className="card-duo text-center py-8">
          <div className="text-5xl mb-2">📊</div>
          <p className="text-sm text-ink-muted font-medium">הרץ סימולציה כדי לבחור תרחיש ולראות את הטבלה.</p>
        </div>
      )}

      {run && run.meta.formCount === 0 && (
        <div className="card-duo text-center py-6">
          <p className="text-sm text-ink-muted font-medium">אין טפסים שהוגשו — אין מה לחשב.</p>
        </div>
      )}

      {run && run.scenarios.length === 0 && run.meta.formCount > 0 && (
        <div className="card-duo text-center py-6">
          <p className="text-sm text-ink-muted font-medium">
            אף גמר לא חזר על עצמו מספיק פעמים כדי לבנות טבלה יציבה.
          </p>
        </div>
      )}

      {run && run.scenarios.length > 0 && (
        <div className="card-duo">
          <div className="text-2xs text-ink-muted font-extrabold mb-1">1. אלופה</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {pickableChampions.map((c) => (
              <button
                key={c.code}
                onClick={() => {
                  setPickChampion((p) => (p === c.code ? null : c.code));
                  setPickRunnerUp(null);
                }}
                className={`chip-duo ${pickChampion === c.code ? "active-blue" : ""}`}
              >
                {teamLabel(c.code)} · {pct(c.prob)}
              </button>
            ))}
          </div>

          {pickChampion && (
            <>
              <div className="text-2xs text-ink-muted font-extrabold mb-1">2. סגנית (הפסידה בגמר)</div>
              <div className="flex flex-wrap gap-1.5">
                {runnerUpOptions.map((s) => (
                  <button
                    key={s.runnerUp}
                    onClick={() => setPickRunnerUp((p) => (p === s.runnerUp ? null : s.runnerUp))}
                    className={`chip-duo ${pickRunnerUp === s.runnerUp ? "active" : ""}`}
                  >
                    {teamLabel(s.runnerUp)} · {pct(s.prob)}
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedScenario && <ScenarioTable scenario={selectedScenario} run={run} label={label} />}

          <p className="text-3xs text-ink-light font-medium mt-4">
            הערכות ממודל מפושט (דירוג פיפ״א + כושר בשלב הבתים), לא הימורים.
          </p>
        </div>
      )}
    </div>
  );
}
