// "המרוץ מול טופס אחר" — head-to-head: pick any submitted form as a rival
// and see what has to happen for the viewed form to finish ABOVE it.
//
// Three layers, same discipline as the rest of the page:
//   - deterministic facts first (current ranks/points gap, and the SOUND
//     clinched/impossible claims via the certainty bounds — never claimed
//     when some completion could overturn them)
//   - probability through the verbal ladder only (no percentages)
//   - root-for advice reuses RootForSection with the aggregate's `beat`
//     channel — same cards, same noise gates, common random numbers.
//
// A tie in the final table is NOT a pass: `beat` counts strictly-above sims,
// and the copy says so.

import { useMemo } from "react";
import RootForSection from "./RootForSection";
import { chanceLabel, formatChance } from "../../utils/analysisVerdict";
import type { CertaintyForm, PoolCertainty } from "../../utils/poolCertainty";
import type { PersonalAnalysisAggregate } from "../../utils/personalAnalysis";
import type { WatchMatch } from "../../utils/analysisWindow";

export default function HeadToHeadSection({
  myFormId,
  cert,
  candidates,
  rivalFormId,
  onPickRival,
  agg,
  targetFormIndex,
  watchMatches,
  predictedAdvancers,
  running,
  failed,
  retry,
}: {
  myFormId: string;
  cert: PoolCertainty;
  // Submitted forms, leaderboard-ordered (the page computes this once).
  candidates: CertaintyForm[];
  rivalFormId: string | null;
  onPickRival: (formId: string | null) => void;
  agg: PersonalAnalysisAggregate | null;
  // Index of the viewed form inside agg.targetForms.
  targetFormIndex: number;
  watchMatches: WatchMatch[];
  predictedAdvancers: Set<string> | null;
  running: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const my = cert.byFormId[myFormId];
  const rival = rivalFormId ? cert.byFormId[rivalFormId] : null;

  const options = useMemo(
    () => candidates.filter((f) => f.formId !== myFormId),
    [candidates, myFormId],
  );

  // Sound deterministic claims (see poolCertainty's contract): the bounds
  // OVER-estimate remaining points, so both claims can only under-fire.
  const facts = useMemo(() => {
    if (!my || !rival) return null;
    return {
      gap: rival.totalPoints - my.totalPoints,
      clinchedAbove: my.totalPoints > rival.totalPoints + rival.maxRemaining,
      impossible: my.totalPoints + my.maxRemaining < rival.totalPoints,
    };
  }, [my, rival]);

  // Use the aggregate's beat counters ONLY when they were computed against
  // THIS rival — during a rival switch the previous run's snapshot may still
  // be mounted for a frame.
  const pBeat = useMemo(() => {
    if (!agg || !rival || agg.rivalFormId !== rival.formId) return null;
    if (targetFormIndex < 0 || agg.simCount === 0) return null;
    return (agg.targetForms[targetFormIndex].hits.beat || 0) / agg.simCount;
  }, [agg, rival, targetFormIndex]);

  if (!my || options.length === 0) return null;

  const decided = !!facts && (facts.clinchedAbove || facts.impossible);

  return (
    <div className="mb-4">
      <h3 className="text-base font-extrabold text-ink mb-0.5">🥊 המרוץ מול טופס אחר</h3>
      <p className="text-xs text-ink-muted font-medium mb-2">
        בוחרים טופס יריב — ורואים מה צריך לקרות כדי לסיים מעליו
      </p>

      <label className="flex flex-col gap-1 mb-2">
        <span className="sr-only">בחירת טופס יריב</span>
        <select
          value={rival ? rival.formId : ""}
          onChange={(e) => onPickRival(e.target.value || null)}
          className="input-duo input-duo-sm"
        >
          <option value="">בחרו טופס יריב…</option>
          {options.map((f) => (
            <option key={f.formId} value={f.formId}>
              #{f.rank} · {f.formName} · {f.totalPoints} נק׳
            </option>
          ))}
        </select>
      </label>

      {rival && facts && (
        <div className="card-duo-tight mb-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-extrabold text-ink mb-1.5">
            <span>
              ⚽ הטופס שלך · מקום <bdi>{my.rank}</bdi> · <bdi>{my.totalPoints}</bdi> נק׳
            </span>
            <span className="text-ink-muted">מול</span>
            <span>
              🥊 {rival.formName} · מקום <bdi>{rival.rank}</bdi> · <bdi>{rival.totalPoints}</bdi> נק׳
            </span>
          </div>

          {facts.clinchedAbove ? (
            <p className="text-sm font-extrabold text-ink">
              זה סגור מתמטית: הטופס שלך מסיים מעל {rival.formName}, לא משנה מה יקרה על
              הדשא 🔒
            </p>
          ) : facts.impossible ? (
            <p className="text-sm font-extrabold text-ink">
              מתמטית זה כבר לא ילך — {rival.formName} מסיים מעליך בכל תרחיש שנשאר 😅
            </p>
          ) : (
            <>
              <p className="text-sm font-bold text-ink">
                {facts.gap > 0 ? (
                  <>
                    הפער כרגע: <bdi>{facts.gap}</bdi> נק׳ לרעתך.
                  </>
                ) : facts.gap < 0 ? (
                  <>
                    הטופס שלך כבר מעל — פער של <bdi>{-facts.gap}</bdi> נק׳ לטובתך.
                  </>
                ) : (
                  <>שוויון נקודות כרגע — ההפרש ייקבע בשוברי השוויון ובהמשך הדרך.</>
                )}{" "}
                {pBeat != null ? (
                  <>הסיכוי לסיים מעל {rival.formName}: {formatChance(chanceLabel(pBeat))}.</>
                ) : failed ? null : (
                  <span className="text-ink-muted animate-pulse">
                    מריצים את המרוץ הזה אלפי פעמים… ⚽
                  </span>
                )}
              </p>
              {failed && pBeat == null && (
                <div className="mt-1.5">
                  <p className="text-xs font-bold text-ink-muted">
                    הניתוח ההסתברותי לא זמין כרגע — העובדות שלמעלה עדיין תקפות.
                  </p>
                  <button onClick={retry} className="btn-duo btn-duo-ghost btn-duo-sm mt-1.5">
                    נסו שוב
                  </button>
                </div>
              )}
              <p className="text-3xs text-ink-light font-bold mt-1.5">
                עקיפה = לסיים במקום גבוה יותר; סיום בשוויון מלא לא נחשב עקיפה.
                {running && pBeat != null ? " · מדייקים את החישוב…" : ""}
              </p>
            </>
          )}
        </div>
      )}

      {rival && facts && !decided && pBeat != null && (
        <RootForSection
          watchMatches={watchMatches}
          agg={agg}
          targetFormIndex={targetFormIndex}
          targetKey="beat"
          predictedAdvancers={predictedAdvancers}
          owned
          phraseOverride={`לעקיפת ${rival.formName}`}
          title="📣 מה צריך לקרות"
          subtitle={`המשחקים הקרובים, מנקודת המבט של המרוץ מול ${rival.formName}`}
          emptyText="המשחקים הקרובים כמעט לא מזיזים במרוץ הזה — הוא יוכרע בהמשך הדרך 😌"
        />
      )}
    </div>
  );
}
