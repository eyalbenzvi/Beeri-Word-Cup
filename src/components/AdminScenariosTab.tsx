import { useMemo, useState } from "react";
import { useScenarioRun } from "../hooks/useScenarioRun";
import { useUsers } from "../hooks/useStore";
import { getTeamByCode } from "../data/teams";
import type { ScenarioRunResult, ScenarioFormStat, TopForm } from "../utils/scenarioSim";

// ── small display helpers ──
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

// median + IQR band rendered as a horizontal strip over [1, formCount].
function RankBand({ f, total }: { f: ScenarioFormStat; total: number }) {
  const toPct = (r: number) => `${((r - 1) / Math.max(1, total - 1)) * 100}%`;
  return (
    <div className="relative h-2 rounded-full bg-bg-soft border border-border w-28">
      <div
        className="absolute h-full rounded-full bg-secondary/30"
        style={{ right: toPct(f.q25), left: `calc(100% - ${toPct(f.q75)})` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 rounded-full bg-secondary"
        style={{ right: `calc(${toPct(f.medianRank)} - 3px)` }}
        title={`חציון ${f.medianRank}`}
      />
    </div>
  );
}

function TopFormsList({
  topForms,
  samples,
  minSamples,
  label,
}: {
  topForms: TopForm[];
  samples: number;
  minSamples: number;
  label: (formId: string) => string;
}) {
  const indicative = samples < minSamples;
  return (
    <div className="mt-2">
      <div className="text-2xs text-ink-light font-bold mb-1">
        {samples.toLocaleString("he-IL")} תרחישים
        {indicative && <span className="text-accent-text"> · אינדיקטיבי בלבד</span>}
      </div>
      <ol className="space-y-1">
        {topForms.slice(0, 6).map((tf, i) => (
          <li key={tf.formId} className="flex items-center justify-between text-xs">
            <span className="font-bold text-ink truncate">
              {i + 1}. {label(tf.formId)}
            </span>
            <span className="badge-duo badge-duo-muted shrink-0">{pct(tf.withinWinProb)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function AdminScenariosTab() {
  const { state, compute } = useScenarioRun();
  const run = state.result;
  const label = useFormLabeler(run);

  const sortedForms = useMemo(
    () =>
      run ? Object.values(run.forms).sort((a, b) => b.winProb - a.winProb) : [],
    [run],
  );
  const [showAll, setShowAll] = useState(false);
  const [pickChampion, setPickChampion] = useState<string | null>(null);
  const [pickForm, setPickForm] = useState<string | null>(null);

  const championView = useMemo(
    () => run?.champions.find((c) => c.code === pickChampion) || null,
    [run, pickChampion],
  );
  const selectedForm = pickForm ? run?.forms[pickForm] : null;

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
      {/* ── Control card ── */}
      <div className="card-duo">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-extrabold text-base text-ink">🎲 תרחישים וסיכויים</h3>
            <p className="text-xs text-ink-muted font-medium mt-1">
              סימולציית מונטה-קרלו: התוצאות שכבר נקבעו קבועות, השאר נדגם אלפי פעמים.
            </p>
          </div>
          <button
            onClick={compute}
            disabled={state.loading}
            className="btn-duo btn-duo-primary btn-duo-sm shrink-0"
          >
            {state.loading ? "מריץ…" : run ? "הרץ מחדש" : "הרץ סימולציה"}
          </button>
        </div>

        {state.loading && (
          <div className="mt-3" aria-live="polite">
            <div className="h-3 rounded-full bg-bg-soft border-2 border-border overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${state.percent}%` }}
              />
            </div>
            <p className="text-2xs text-ink-light font-bold mt-1">
              {state.percent}% — החישוב יכול לקחת כדקה-שתיים. אפשר להישאר בעמוד.
            </p>
          </div>
        )}

        {state.error && (
          <p className="text-xs text-danger font-bold mt-3">החישוב נכשל. נסה שוב.</p>
        )}

        {run && !state.loading && (
          <p className="text-2xs text-ink-light font-bold mt-3">
            חושב: {generatedAt} · {run.meta.simCount.toLocaleString("he-IL")} תרחישים ·{" "}
            {run.meta.formCount} טפסים
            {state.loadedFromStore && " · נטען מחישוב קודם"}
          </p>
        )}
      </div>

      {!run && !state.loading && (
        <div className="card-duo text-center py-8">
          <div className="text-5xl mb-2">📊</div>
          <p className="text-sm text-ink-muted font-medium">
            הרץ סימולציה כדי לראות מי צפוי לנצח ובאילו תרחישים.
          </p>
        </div>
      )}

      {run && (
        <>
          {/* ── Probabilistic podium ── */}
          <div className="card-duo">
            <h4 className="font-extrabold text-sm text-ink mb-3">🏆 מי צפוי לזכות</h4>
            <div className="grid grid-cols-3 gap-2">
              {sortedForms.slice(0, 3).map((f, i) => {
                const podiumClass = ["podium-gold", "podium-silver", "podium-bronze"][i];
                return (
                  <div key={f.formId} className={`${podiumClass} rounded-2xl p-3 text-center`}>
                    <div className="text-2xl">{["🥇", "🥈", "🥉"][i]}</div>
                    <div className="font-extrabold text-xs text-ink truncate mt-1">
                      {label(f.formId)}
                    </div>
                    <div className="font-extrabold text-lg text-ink">{pct(f.winProb)}</div>
                    <div className="text-2xs text-ink-muted font-bold">
                      טופ-3: {pct(f.podiumProb)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Contenders table ── */}
          <div className="card-duo">
            <h4 className="font-extrabold text-sm text-ink mb-3">📋 טבלת מתמודדים</h4>
            <div className="space-y-1">
              {(showAll ? sortedForms : sortedForms.slice(0, 40)).map((f, i) => (
                <div
                  key={f.formId}
                  className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0"
                >
                  <span className="w-6 text-ink-light font-bold shrink-0">{i + 1}</span>
                  <span className="flex-1 font-bold text-ink truncate">{label(f.formId)}</span>
                  {f.winProb === 0 && (
                    <span className="badge-duo badge-duo-muted shrink-0" title="לא יכול לזכות באף תרחיש שנדגם">
                      🔒
                    </span>
                  )}
                  <span className="w-12 text-left font-extrabold text-primary shrink-0">
                    {pct(f.winProb)}
                  </span>
                  <span className="w-12 text-left text-ink-muted font-bold shrink-0 hidden sm:inline">
                    {pct(f.podiumProb)}
                  </span>
                  <span className="hidden sm:flex items-center gap-1 shrink-0">
                    <RankBand f={f} total={run.meta.formCount} />
                    <span className="text-2xs text-ink-light w-5">{f.medianRank}</span>
                  </span>
                </div>
              ))}
            </div>
            {sortedForms.length > 40 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="btn-duo btn-duo-ghost btn-duo-sm mt-2 w-full"
              >
                {showAll ? "הצג פחות" : `הצג את כל ${sortedForms.length} הטפסים`}
              </button>
            )}
            <p className="text-3xs text-ink-light font-bold mt-2">
              עמודות: סיכוי זכייה · טופ-3 · טווח דירוג (חציון + רבעונים). 🔒 = נעול מחוץ לזכייה.
            </p>
          </div>

          {/* ── Interactive: pick the champion ── */}
          <div className="card-duo">
            <h4 className="font-extrabold text-sm text-ink mb-1">🎰 אם האלוף הוא…</h4>
            <p className="text-2xs text-ink-light font-bold mb-2">בחר אלופה וראה מי מוביל באותו תרחיש.</p>
            <div className="flex flex-wrap gap-1.5">
              {run.champions.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setPickChampion((p) => (p === c.code ? null : c.code))}
                  className={`chip-duo ${pickChampion === c.code ? "active-blue" : ""}`}
                >
                  {teamLabel(c.code)} · {pct(c.prob)}
                </button>
              ))}
            </div>
            {championView && (
              <div className="mt-3 alert-primary-soft rounded-2xl p-3">
                <div className="font-extrabold text-xs text-ink">
                  אם {teamLabel(championView.code)} אלופה — המובילים:
                </div>
                <TopFormsList
                  topForms={championView.topForms}
                  samples={championView.samples}
                  minSamples={run.meta.minScenarioSamples}
                  label={label}
                />
              </div>
            )}
          </div>

          {/* ── Interactive: most likely finals ── */}
          <div className="card-duo">
            <h4 className="font-extrabold text-sm text-ink mb-2">⚔️ הגמרים הסבירים</h4>
            <div className="space-y-1.5">
              {run.finalPairs.slice(0, 8).map((fp) => (
                <details key={fp.teams.join()} className="border-b border-border pb-1.5">
                  <summary className="flex items-center justify-between text-xs font-bold text-ink cursor-pointer list-none">
                    <span>
                      {teamLabel(fp.teams[0])} — {teamLabel(fp.teams[1])}
                    </span>
                    <span className="badge-duo badge-duo-secondary">{pct(fp.prob)}</span>
                  </summary>
                  <TopFormsList
                    topForms={fp.topForms}
                    samples={fp.samples}
                    minSamples={run.meta.minScenarioSamples}
                    label={label}
                  />
                </details>
              ))}
            </div>
          </div>

          {/* ── Personal drill-down ── */}
          <div className="card-duo">
            <h4 className="font-extrabold text-sm text-ink mb-2">🔎 ניתוח טופס</h4>
            <select
              value={pickForm || ""}
              onChange={(e) => setPickForm(e.target.value || null)}
              className="input-duo input-duo-sm w-full"
            >
              <option value="">בחר טופס…</option>
              {sortedForms.map((f) => (
                <option key={f.formId} value={f.formId}>
                  {label(f.formId)} ({pct(f.winProb)})
                </option>
              ))}
            </select>

            {selectedForm && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-bg-soft rounded-xl p-2">
                    <div className="text-2xs text-ink-light font-bold">זכייה</div>
                    <div className="font-extrabold text-base text-primary">{pct(selectedForm.winProb)}</div>
                  </div>
                  <div className="bg-bg-soft rounded-xl p-2">
                    <div className="text-2xs text-ink-light font-bold">טופ-3</div>
                    <div className="font-extrabold text-base text-ink">{pct(selectedForm.podiumProb)}</div>
                  </div>
                  <div className="bg-bg-soft rounded-xl p-2">
                    <div className="text-2xs text-ink-light font-bold">דירוג (חציון)</div>
                    <div className="font-extrabold text-base text-ink">
                      {selectedForm.medianRank}
                      <span className="text-2xs text-ink-light"> ({selectedForm.q25}-{selectedForm.q75})</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-2xs text-ink-light font-bold mb-1">📣 למי כדאי לעודד</div>
                  {selectedForm.rootFor.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedForm.rootFor.map((r, i) => (
                        <span key={i} className="chip-duo active">
                          {r.type === "champion" ? "אלופה" : "לגמר"}: {teamLabel(r.code)} +
                          {(r.lift * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xs text-ink-light font-medium">
                      אין אירוע בודד שמשפר משמעותית את הסיכוי של הטופס.
                    </p>
                  )}
                </div>

                {selectedForm.rival && (
                  <div className="alert-accent-soft rounded-2xl p-2.5">
                    <span className="text-xs font-bold text-accent-text">
                      ⚔️ הצל שלך: {label(selectedForm.rival.formId)} — צמודים ב-
                      {selectedForm.rival.count.toLocaleString("he-IL")} תרחישים.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Disclaimer ── */}
          <p className="text-3xs text-ink-light font-medium text-center px-4">
            הערכות ממודל מפושט (דירוג פיפ״א + כושר בשלב הבתים), לא הימורים. הכדורגל אקראי יותר.
          </p>
        </>
      )}
    </div>
  );
}
