import { useEffect, useState } from "react";
import {
  useScenarioData,
  DEFAULT_SIM_COUNT,
  AUTO_SIM_COUNT,
  MIN_SIM_COUNT,
  MAX_SIM_COUNT,
} from "../hooks/useScenarioRun";
import { useCurrentUser, useActualBonuses } from "../hooks/useStore";
import { saveActualBonuses } from "../store";
import { TOP_SCORER_CANDIDATES } from "../utils/topScorerRace";
import { getPlayerDisplayName } from "../utils/playerSearch";
import { useToast } from "./Toast";
import ScenarioExplorer, { ScenarioOverallTable } from "./ScenarioExplorer";
import Spinner from "./Spinner";

// Stored odds (0..1, possibly partial) → per-candidate integer percents for
// the admin inputs, falling back to the built-in defaults.
function pctFromStored(storedSim: any): Record<string, number> {
  return Object.fromEntries(
    TOP_SCORER_CANDIDATES.map((c) => {
      const stored = Number(storedSim?.odds?.[c.name]);
      const p = Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : c.prob;
      return [c.name, Math.round(p * 100)];
    }),
  );
}

// Read-only scenarios view: loads the server-computed run and renders the
// explorer. Shared by the user "נתונים" tab and the admin tab (the latter
// passes showRecompute to expose a run-count input + a recompute control with
// a server/local toggle).
type RunMode = "server" | "local";

export default function ScenariosSection({ showRecompute = false }: { showRecompute?: boolean }) {
  const { state, recompute, computeLocal, local } = useScenarioData();
  const { user } = useCurrentUser();
  const actualBonuses = useActualBonuses();
  const showToast = useToast();
  const [simCount, setSimCount] = useState<number>(DEFAULT_SIM_COUNT);
  // Default to LOCAL: it runs entirely in the browser, so it works even when
  // the Netlify background function isn't available — the reliable manual path.
  const [mode, setMode] = useState<RunMode>("local");
  // Admin-only "no-scenario" overall table, hidden behind a toggle so it's an
  // additional option rather than always on.
  const [showOverall, setShowOverall] = useState(false);
  const run = state.result;

  // Golden-boot sampling config (admin decides per recompute; OFF by default
  // so the automatic post-result server run never includes it on its own).
  // Saved to actualBonuses.topScorerSim on "חשב מחדש" — one source of truth
  // that the server run, the local worker AND the personal analysis all read.
  const storedSim = (actualBonuses as any)?.topScorerSim;
  const [tsEnabled, setTsEnabled] = useState<boolean>(() => !!storedSim?.enabled);
  const [tsPct, setTsPct] = useState<Record<string, number>>(() => pctFromStored(storedSim));
  // The bonuses doc can land AFTER mount (async cache) or be changed by
  // another admin — resync untouched inputs to the stored config; local edits
  // (tsDirty) win until saved.
  const [tsDirty, setTsDirty] = useState(false);
  // Guards the recompute button through the awaited config save (a fast
  // double-tap must not fire two runs / two doc writes).
  const [savingConfig, setSavingConfig] = useState(false);
  const storedSimKey = showRecompute ? JSON.stringify(storedSim ?? null) : "null";
  useEffect(() => {
    if (!showRecompute || tsDirty) return;
    const parsed = storedSimKey === "null" ? null : JSON.parse(storedSimKey);
    setTsEnabled(!!parsed?.enabled);
    setTsPct(pctFromStored(parsed));
  }, [showRecompute, storedSimKey, tsDirty]);

  const handleRecompute = async () => {
    if (savingConfig) return;
    const n = Math.min(MAX_SIM_COUNT, Math.max(MIN_SIM_COUNT, Math.round(simCount) || DEFAULT_SIM_COUNT));
    // Persist the golden-boot decision FIRST: the server run reads the doc,
    // and the personal analysis follows the same flag.
    const topScorerSim = {
      enabled: tsEnabled,
      odds: Object.fromEntries(
        TOP_SCORER_CANDIDATES.map((c) => {
          const pct = Number(tsPct[c.name]);
          const p = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) / 100 : c.prob;
          return [c.name, p];
        }),
      ),
    };
    const bonuses = { ...(actualBonuses || {}), topScorerSim };
    setSavingConfig(true);
    const saved = await saveActualBonuses(bonuses);
    setSavingConfig(false);
    if (!saved) {
      showToast("שמירת הגדרת מלך השערים נכשלה — החישוב לא הופעל. נסו שוב.", "error");
      return;
    }
    setTsDirty(false);
    if (mode === "server") {
      recompute(n);
      showToast(`החישוב נשלח לשרת (${n.toLocaleString("he-IL")} הרצות) — יתעדכן בעוד כדקות`);
    } else {
      computeLocal(n, bonuses);
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
    <>
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
              disabled={local.running || savingConfig}
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
      {showRecompute && (
        <div className="rounded-2xl border-2 border-border p-2.5 mb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-ink">👑 מלך השערים בהרצה</span>
            <button
              type="button"
              onClick={() => { setTsEnabled((v) => !v); setTsDirty(true); }}
              aria-pressed={tsEnabled}
              className={`chip-duo ${tsEnabled ? "active" : ""}`}
            >
              {tsEnabled ? "כלול בהרצה" : "לא כלול"}
            </button>
          </div>
          {tsEnabled && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {TOP_SCORER_CANDIDATES.map((c) => (
                <label key={c.name} className="flex flex-col gap-1">
                  <span className="text-2xs text-ink-muted font-extrabold truncate">
                    {getPlayerDisplayName(c.name, undefined)}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={tsPct[c.name] ?? 0}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const v = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
                        setTsPct((s) => ({ ...s, [c.name]: v }));
                        setTsDirty(true);
                      }}
                      className="input-duo input-duo-sm w-full"
                      aria-label={`סיכוי מלך שערים — ${getPlayerDisplayName(c.name, undefined)}`}
                    />
                    <span className="text-2xs text-ink-muted font-bold">%</span>
                  </div>
                </label>
              ))}
            </div>
          )}
          <p className="text-3xs text-ink-light font-medium mt-1.5">
            כשמופעל, כל הרצה מגרילה מי מלך השערים לפי הסיכויים שכאן (יכולים לצאת גם
            כמה יחד — שוויון בטבלת הכובשים), ובחירה פוגעת מזכה ב-8 נק׳. ההגדרה נשמרת
            בלחיצה על ״חשב מחדש״, משפיעה גם על ״המצב שלי בתחרות״ ונשארת בתוקף גם
            לריצות האוטומטיות שאחרי כל תוצאה — עד שמכבים אותה כאן. מועמד שנבחרתו
            הודחה מאופס אוטומטית.
          </p>
        </div>
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
              {" · "}
              {run.meta.topScorerProbs ? "👑 כולל מלך השערים" : "ללא מלך השערים"}
            </p>
          )}
        </>
      )}
    </div>

    {showRecompute && run && run.formOrder.length > 0 && (
      <div className="card-duo">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div>
            <h3 className="font-extrabold text-base text-ink">📋 טבלה כללית (ללא תרחיש)</h3>
            <p className="text-xs text-ink-muted font-medium mt-0.5">
              כל ההרצות יחד: לכל טופס סיכוי למקום ראשון, דירוג ממוצע וניקוד ממוצע.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowOverall((v) => !v)}
            aria-pressed={showOverall}
            className="btn-duo btn-duo-blue btn-duo-sm shrink-0"
          >
            {showOverall ? "הסתר" : "הצג טבלה"}
          </button>
        </div>
        {showOverall && (
          <ScenarioOverallTable run={run} currentUserId={user?.id || null} />
        )}
      </div>
    )}
    </>
  );
}
