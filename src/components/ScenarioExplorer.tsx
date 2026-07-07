import { useMemo, useState } from "react";
import { getTeamByCode } from "../data/teams";
import { getPlayerDisplayName } from "../utils/playerSearch";
import { useNavigation } from "../hooks/useNavigation";
import ClickableName from "./ClickableName";
import type { ScenarioRunResult } from "../utils/scenarioSim";

// Reflect whether THIS run drew the golden-boot king per sim (admin opt-in;
// meta.topScorerProbs is stamped by the engine), including the odds it used —
// so users always know what the tables do and don't contain.
function topScorerNote(meta: ScenarioRunResult["meta"]): string {
  const probs = meta.topScorerProbs;
  if (!probs) return "ללא בונוס מלך השערים.";
  const parts = Object.entries(probs)
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, p]) => `${getPlayerDisplayName(name, undefined)} ${Math.round(p * 100)}%`);
  return parts.length
    ? `כולל הגרלת מלך השערים (${parts.join(", ")}).`
    : "כולל הגרלת מלך השערים.";
}

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
// How the ranking table is ordered. Default stays "win" (% chance to win) so
// the table opens the same way it always has; the user can re-sort by average
// points or average position.
type SortKey = "win" | "points" | "rank";

// A set of per-form metric arrays, all aligned to `run.formOrder` — exactly
// the shape a Scenario carries, and also what the "no-scenario" overall
// aggregate carries. Driving the table off this (rather than a Scenario)
// lets the admin overall view reuse the identical sorting/rendering.
type Metrics = { winProb: number[]; avgRank: number[]; avgPoints: number[] };

function RankingTable({
  metrics,
  run,
  currentUserId,
  myLabel = "הטופס שלך בתרחיש הזה",
}: {
  metrics: Metrics;
  run: ScenarioRunResult;
  currentUserId?: string | null;
  myLabel?: string;
}) {
  const { navigate } = useNavigation();
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("win");

  // Form name only — no owner/username (the table is about the form, and the
  // owner is reachable by tapping through to the form view).
  const label = (formId: string) => run.forms[formId]?.formName || "טופס";
  const isMine = (formId: string) =>
    !!currentUserId && run.forms[formId]?.userId === currentUserId;

  const rows: Row[] = useMemo(() => {
    const r = run.formOrder.map((formId, i) => ({
      formId,
      winProb: metrics.winProb[i],
      avgRank: metrics.avgRank[i],
      avgPoints: metrics.avgPoints[i],
    }));
    // Each sort falls back to win% so ties resolve consistently. Lower avgRank
    // is better (1 = first place), so rank sorts ascending.
    if (sortBy === "points") {
      r.sort((a, b) => b.avgPoints - a.avgPoints || b.winProb - a.winProb);
    } else if (sortBy === "rank") {
      r.sort((a, b) => a.avgRank - b.avgRank || b.winProb - a.winProb);
    } else {
      r.sort((a, b) => b.winProb - a.winProb || a.avgRank - b.avgRank);
    }
    return r;
  }, [metrics, run.formOrder, sortBy]);

  const maxWin = useMemo(
    () => run.formOrder.reduce((m, _f, i) => Math.max(m, metrics.winProb[i]), 0.0001),
    [metrics, run.formOrder],
  );
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
        <span className="flex-1 min-w-0 font-bold text-ink truncate">
          <ClickableName
            onClick={() => navigate("leaderboard", { form: r.formId })}
            title={`פתח את ${label(r.formId)}`}
          >
            {label(r.formId)}
          </ClickableName>
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

  // Render helper (not a nested component) so re-renders don't remount the
  // header buttons — matches the file's renderRow style.
  const sortHeader = (k: SortKey, className: string, children: any) => (
    <button
      type="button"
      key={k}
      onClick={() => setSortBy(k)}
      aria-pressed={sortBy === k}
      className={`${className} bg-transparent border-none cursor-pointer font-extrabold text-3xs ${
        sortBy === k ? "text-primary-dark" : "text-ink-light hover:text-ink-muted"
      }`}
    >
      {sortBy === k ? "▾ " : ""}{children}
    </button>
  );

  return (
    <div className="mt-3">
      {myBest && (
        <div className="alert-primary-soft rounded-2xl p-3 mb-3" aria-live="polite">
          <div className="text-2xs text-ink-muted font-extrabold mb-0.5">{myLabel}</div>
          <div className="text-sm font-extrabold text-ink">
            {label(myBest.formId)} — סיכוי לזכייה{" "}
            <span className="text-primary-dark" style={LTR}>{winPctLabel(myBest.winProb)}</span>
            {" · "}מקום ממוצע <span style={LTR}>{myBest.avgRank.toFixed(1)}</span>
            {" · "}בטבלה זו: <span style={LTR}>{myBest.position}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pb-1.5 border-b-2 border-border">
        <span className="w-6 text-center shrink-0 text-3xs text-ink-light font-extrabold">#</span>
        <span className="flex-1 text-3xs text-ink-light font-extrabold">טופס</span>
        {sortHeader("win", "w-16 shrink-0 text-right", "סיכוי לזכייה")}
        {sortHeader("rank", "w-12 shrink-0 text-left", "דירוג ממוצע")}
        {sortHeader("points", "w-12 shrink-0 text-left", "נק׳ ממוצע")}
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

  // No default pick — the champion/runner-up selectors start empty so the user
  // makes the choice deliberately (the table appears once a final is picked).

  const selected = useMemo(
    () => runnerUpOptions.find((s) => s.runnerUp === runnerUp) || null,
    [runnerUpOptions, runnerUp],
  );

  const lowSample = selected && selected.samples < LOW_SAMPLE;

  // Narrative line: which FORM is most helped by this exact final. Form name
  // only — no owner/username.
  const narrative = useMemo(() => {
    if (!selected) return null;
    let bestI = 0;
    for (let i = 1; i < run.formOrder.length; i++) {
      if (selected.winProb[i] > selected.winProb[bestI]) bestI = i;
    }
    const f = run.forms[run.formOrder[bestI]];
    if (!f || selected.winProb[bestI] <= 0) return null;
    return { who: f.formName || "טופס", p: selected.winProb[bestI] };
  }, [selected, run]);

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
                {teamLabel(c.code)} — {intPct(c.prob)}
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

          <RankingTable
            metrics={selected}
            run={run}
            currentUserId={currentUserId}
          />

          <p className="text-3xs text-ink-light font-medium text-center">
            הסיכויים מחושבים רק מהתרחישים שבהם {teamLabel(selected.champion)} ניצחה את{" "}
            {teamLabel(selected.runnerUp)} בגמר. {topScorerNote(run.meta)}{" "}
            מודל Elo — הערכה, לא הימור.
          </p>
        </>
      )}
    </div>
  );
}

// Admin-only "no-scenario" view: the SAME ranking table, but pooled over every
// simulated tournament instead of conditioned on a chosen final. Shows each
// form's overall chance to finish 1st, its average rank, and average points,
// with the identical sorting + form-name display as the per-scenario table.
export function ScenarioOverallTable({
  run,
  currentUserId,
}: {
  run: ScenarioRunResult;
  currentUserId?: string | null;
}) {
  const overall = run.overall;
  if (!overall || overall.avgRank.length === 0) {
    return (
      <p className="text-2xs text-ink-muted font-medium text-center py-3">
        אין נתונים לטבלה הכללית — הריצו חישוב מחדש כדי ליצור אותה.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <RankingTable metrics={overall} run={run} currentUserId={currentUserId} myLabel="הטופס שלך (כל ההרצות)" />
      <p className="text-3xs text-ink-light font-medium text-center">
        מצרף את כל {run.meta.simCount.toLocaleString("he-IL")} ההרצות, ללא בחירת גמר.{" "}
        {topScorerNote(run.meta)} מודל Elo — הערכה, לא הימור.
      </p>
    </div>
  );
}
