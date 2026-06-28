import { useMemo, useState, useEffect } from "react";
import { useUsers } from "../hooks/useStore";
import { getTeamByCode } from "../data/teams";
import type { ScenarioRunResult, Scenario } from "../utils/scenarioSim";

// ── formatting (clarity-first, per the UX review) ──
const teamLabel = (code: string) => {
  const t = getTeamByCode(code);
  return t ? `${t.flag} ${t.name}` : code;
};
const intPct = (p: number) => `${Math.round(p * 100)}%`;
// Joint final probability: a touch more precision when small, else integer.
const jointPct = (p: number) => (p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);
// Per-form win probability: integer ≥1%, "<1%" for tiny nonzero, "—" for zero.
const winPctLabel = (p: number) => (p <= 0 ? "—" : p < 0.01 ? "<1%" : `${Math.round(p * 100)}%`);

const LTR: React.CSSProperties = { direction: "ltr", unicodeBidi: "plaintext" };
const LOW_SAMPLE = 1000;
const DEFAULT_ROWS = 25;

type Row = { formId: string; winProb: number; avgRank: number; avgPoints: number };

function ScenarioTable({
  scenario,
  run,
  currentUserId,
}: {
  scenario: Scenario;
  run: ScenarioRunResult;
  currentUserId?: string | null;
}) {
  const users = useUsers();
  const [showAll, setShowAll] = useState(false);

  const label = (formId: string) => {
    const f = run.forms[formId];
    const owner = f ? users[f.userId]?.displayName : null;
    const name = f?.formName || "טופס";
    return owner ? `${name} · ${owner}` : name;
  };
  const isMine = (formId: string) =>
    !!currentUserId && run.forms[formId]?.userId === currentUserId;

  const rows: Row[] = useMemo(() => {
    const r = run.formOrder.map((formId, i) => ({
      formId,
      winProb: scenario.winProb[i],
      avgRank: scenario.avgRank[i],
      avgPoints: scenario.avgPoints[i],
    }));
    r.sort((a, b) => b.winProb - a.winProb || a.avgRank - b.avgRank);
    return r;
  }, [scenario, run.formOrder]);

  const maxWin = rows.length ? Math.max(rows[0].winProb, 0.0001) : 1;
  const myBest = useMemo(() => {
    const idx = rows.findIndex((r) => isMine(r.formId));
    return idx >= 0 ? { ...rows[idx], position: idx + 1 } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, currentUserId]);

  const renderRow = (r: Row, position: number) => {
    const podium = position <= 3 ? ["podium-gold", "podium-silver", "podium-bronze"][position - 1] : "";
    const mine = isMine(r.formId);
    return (
      <div
        key={r.formId}
        className={`flex items-center gap-2 text-xs py-1 px-1 rounded-lg ${mine ? "bg-primary-soft" : "odd:bg-bg-soft"}`}
      >
        <span className={`w-6 text-center font-bold shrink-0 ${podium ? `${podium} rounded-md` : "text-ink-light"}`}>
          {position}
        </span>
        <span className="flex-1 font-bold text-ink truncate">
          {label(r.formId)}
          {mine && <span className="text-primary-dark"> · אתה</span>}
        </span>
        <span className="w-16 shrink-0 relative">
          <span className="absolute inset-y-0 right-0 rounded bg-primary/15" style={{ width: `${(r.winProb / maxWin) * 100}%` }} aria-hidden="true" />
          <span className="relative font-extrabold text-primary-dark" style={LTR}>{winPctLabel(r.winProb)}</span>
        </span>
        <span className="w-12 text-left text-ink-muted font-bold shrink-0" style={LTR}>{r.avgRank.toFixed(1)}</span>
        <span className="w-12 text-left text-ink-muted font-bold shrink-0" style={LTR}>{Math.round(r.avgPoints)}</span>
      </div>
    );
  };

  return (
    <div className="mt-3">
      {myBest && (
        <div className="alert-primary-soft rounded-2xl p-3 mb-3" aria-live="polite">
          <div className="text-2xs text-ink-muted font-extrabold mb-0.5">הטופס שלך בתרחיש הזה</div>
          <div className="text-sm font-extrabold text-ink">
            {label(myBest.formId)} — סיכוי לזכייה{" "}
            <span className="text-primary-dark" style={LTR}>{winPctLabel(myBest.winProb)}</span>
            {" · "}מקום ממוצע <span style={LTR}>{myBest.avgRank.toFixed(1)}</span>
            {" · "}בטבלה זו: <span style={LTR}>{myBest.position}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-3xs text-ink-light font-extrabold pb-1.5 border-b-2 border-border">
        <span className="w-6 text-center shrink-0">#</span>
        <span className="flex-1">טופס</span>
        <span className="w-16 shrink-0">סיכוי לזכייה</span>
        <span className="w-12 text-left shrink-0">דירוג ממוצע</span>
        <span className="w-12 text-left shrink-0">נק׳ ממוצע</span>
      </div>
      <div className="mt-1">
        {(showAll ? rows : rows.slice(0, DEFAULT_ROWS)).map((r, i) => renderRow(r, i + 1))}
      </div>
      {rows.length > DEFAULT_ROWS && (
        <button onClick={() => setShowAll((v) => !v)} className="btn-duo btn-duo-ghost btn-duo-sm mt-2 w-full">
          {showAll ? "הצג פחות" : `הצג את כל ${rows.length} הטפסים`}
        </button>
      )}
    </div>
  );
}

export default function ScenarioExplorer({
  run,
  currentUserId,
}: {
  run: ScenarioRunResult;
  currentUserId?: string | null;
}) {
  // Champions that have at least one tabled final.
  const pickableChampions = useMemo(() => {
    const withScenario = new Set(run.scenarios.map((s) => s.champion));
    return run.champions.filter((c) => withScenario.has(c.code));
  }, [run]);

  const [champion, setChampion] = useState<string>("");
  const [runnerUp, setRunnerUp] = useState<string>("");

  const runnerUpOptions = useMemo(
    () => run.scenarios.filter((s) => s.champion === champion).sort((a, b) => b.prob - a.prob),
    [run, champion],
  );
  const championSamples = useMemo(
    () => run.champions.find((c) => c.code === champion)?.samples || 0,
    [run, champion],
  );

  // Default to the single most likely final so the table is populated on load.
  useEffect(() => {
    if (champion || pickableChampions.length === 0) return;
    const topChamp = pickableChampions[0].code;
    const tops = run.scenarios.filter((s) => s.champion === topChamp).sort((a, b) => b.prob - a.prob);
    setChampion(topChamp);
    setRunnerUp(tops[0]?.runnerUp || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const selected = useMemo(
    () => runnerUpOptions.find((s) => s.runnerUp === runnerUp) || null,
    [runnerUpOptions, runnerUp],
  );

  const lowSample = selected && selected.samples < LOW_SAMPLE;

  // Narrative line: who is most helped by this exact final.
  const users = useUsers();
  const narrative = useMemo(() => {
    if (!selected) return null;
    let bestI = 0;
    for (let i = 1; i < run.formOrder.length; i++) {
      if (selected.winProb[i] > selected.winProb[bestI]) bestI = i;
    }
    const f = run.forms[run.formOrder[bestI]];
    if (!f || selected.winProb[bestI] <= 0) return null;
    const owner = users[f.userId]?.displayName;
    const who = owner ? `${f.formName} · ${owner}` : f.formName;
    return { who, p: selected.winProb[bestI] };
  }, [selected, run, users]);

  return (
    <div className="space-y-3">
      {/* Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-ink-muted font-extrabold">בוחרים אלופה</span>
          <select
            value={champion}
            onChange={(e) => { setChampion(e.target.value); setRunnerUp(""); }}
            className="input-duo input-duo-sm"
          >
            <option value="">בחרו אלופה</option>
            {pickableChampions.map((c) => (
              <option key={c.code} value={c.code}>
                {teamLabel(c.code)} — אלוף ב-{intPct(c.prob)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs text-ink-muted font-extrabold">שהובסה בגמר (סגנית)</span>
          <select
            value={runnerUp}
            onChange={(e) => setRunnerUp(e.target.value)}
            disabled={!champion}
            className="input-duo input-duo-sm"
          >
            <option value="">{champion ? "בחרו סגנית" : "בחרו קודם אלופה"}</option>
            {runnerUpOptions.map((s) => (
              <option key={s.runnerUp} value={s.runnerUp}>
                {teamLabel(s.runnerUp)} — {intPct(championSamples ? s.samples / championSamples : 0)} מהמקרים
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected && (
        <>
          {/* Matchup card — carries the JOINT probability, explicitly labelled */}
          <div className="card-duo-tight bg-primary-soft border-2 border-primary/30">
            <div className="text-center font-extrabold text-ink">
              🏆 {teamLabel(selected.champion)} <span className="text-ink-muted">🆚</span> {teamLabel(selected.runnerUp)}
            </div>
            <div className="text-center text-2xs text-ink-muted font-bold mt-1">
              גמר כזה קורה ב-<span style={LTR}>{jointPct(selected.prob)}</span> מההרצות (≈
              <span style={LTR}>{selected.samples.toLocaleString("he-IL")}</span> מתוך{" "}
              <span style={LTR}>{run.meta.simCount.toLocaleString("he-IL")}</span>)
            </div>
            {lowSample && (
              <div className="text-center text-2xs text-accent-text font-bold mt-1">
                ⚠️ מעט תרחישים — המספרים בטבלה משוערים
              </div>
            )}
          </div>

          {narrative && (
            <div className="alert-primary-soft rounded-2xl p-3 text-sm font-bold text-ink">
              אם {teamLabel(selected.champion)} תנצח את {teamLabel(selected.runnerUp)} בגמר — הטופס של{" "}
              <span className="text-primary-dark">{narrative.who}</span> הכי קרוב לזכייה, עם{" "}
              <span className="text-primary-dark" style={LTR}>{winPctLabel(narrative.p)}</span> סיכוי למקום ראשון.
            </div>
          )}

          <ScenarioTable scenario={selected} run={run} currentUserId={currentUserId} />

          <p className="text-3xs text-ink-light font-medium text-center">
            הסיכויים מחושבים רק מהתרחישים שבהם {teamLabel(selected.champion)} ניצחה את{" "}
            {teamLabel(selected.runnerUp)} בגמר. מודל Elo — הערכה, לא הימור.
          </p>
        </>
      )}
    </div>
  );
}
