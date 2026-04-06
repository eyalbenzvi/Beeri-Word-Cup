import { SCORING_DATA } from "../constants/scoring";

export default function ScoringTable() {
  return (
    <>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b-2 border-border">
            <th className="text-right py-2 font-semibold">שלב</th>
            <th className="text-center py-2 font-semibold">הכרעה</th>
            <th className="text-center py-2 font-semibold">+מדויק</th>
            <th className="text-center py-2 font-semibold">עליה</th>
          </tr>
        </thead>
        <tbody className="text-ink">
          {SCORING_DATA.map(([stage, outcome, exact, advance], i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-2 font-medium">{stage}</td>
              <td className="text-center font-bold">{outcome}</td>
              <td className="text-center font-bold text-green-600">+{exact}</td>
              <td className="text-center font-bold text-purple-600">
                {advance ?? "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
          <span className="text-ink-muted">🏆 ניחוש אלופה</span>
          <span className="font-bold text-accent-text">9 נק׳</span>
        </div>
        <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
          <span className="text-ink-muted">⚽ מלך שערים</span>
          <span className="font-bold text-accent-text">8 נק׳</span>
        </div>
      </div>
    </>
  );
}
