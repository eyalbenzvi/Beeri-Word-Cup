import { SCORING_DATA, BONUSES } from "../constants/scoring";
import { LABELS } from "../constants/messages";

export default function ScoringTable() {
  return (
    <>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b-2 border-border">
            <th className="text-right py-2 font-extrabold">שלב</th>
            <th className="text-center py-2 font-extrabold">הכרעה</th>
            <th className="text-center py-2 font-extrabold">+מדויק</th>
            <th className="text-center py-2 font-extrabold">עליה</th>
          </tr>
        </thead>
        <tbody className="text-ink">
          {SCORING_DATA.map(([stage, outcome, exact, advance], i) => (
            <tr key={i} className="border-b border-border">
              <td className="py-2 font-bold">{stage}</td>
              <td className="text-center font-extrabold">{outcome}</td>
              <td className="text-center font-extrabold text-primary">+{exact}</td>
              <td className="text-center font-extrabold text-purple">
                {advance ?? "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between items-center rounded-xl px-3 py-2 border-2 border-accent/40" style={{ background: "var(--color-accent-soft)" }}>
          <span className="text-ink font-medium">🏆 {LABELS.guessChampion}</span>
          <span className="font-extrabold text-accent-text">{BONUSES.champion} {LABELS.pointsShort}</span>
        </div>
        <div className="flex justify-between items-center rounded-xl px-3 py-2 border-2 border-accent/40" style={{ background: "var(--color-accent-soft)" }}>
          <span className="text-ink font-medium">⚽ {LABELS.topScorer}</span>
          <span className="font-extrabold text-accent-text">{BONUSES.topScorer} {LABELS.pointsShort}</span>
        </div>
      </div>
    </>
  );
}
