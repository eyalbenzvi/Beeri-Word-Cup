import { TrendingUp, TrendingDown } from "lucide-react";
import type { RankPoint } from "../utils/computeFormRankHistory";

// Tiny inline-SVG sparkline of a form's rank over time (#6). Rank is inverted
// on the Y axis (a lower number = better = higher on the chart). The series is
// derived retroactively from official results (see computeFormRankHistory) —
// one point per completed match, identical for every viewer. Renders nothing
// until at least two matches have been played, so a single-result tournament
// (or a form yet to be scored) simply omits the panel.
const W = 240;
const H = 48;
const PAD = 4;

export default function RankTrendSparkline({ history }: { history: RankPoint[] }) {
  if (!history || history.length < 2) return null;

  const ranks = history.map((p) => p.rank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = max - min || 1;
  const n = history.length;

  // x evenly spaced by index; y inverted (best rank at top).
  const pts = history.map((p, i) => {
    const x = PAD + (i / (n - 1)) * (W - 2 * PAD);
    const y = PAD + ((p.rank - min) / span) * (H - 2 * PAD);
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = pts[pts.length - 1];

  const first = ranks[0];
  const last = ranks[ranks.length - 1];
  const delta = first - last; // positive = improved (rank number went down)

  return (
    <div className="card-duo mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-extrabold text-ink">📈 מגמת דירוג</div>
        <div className="text-xs font-bold">
          {delta > 0 ? (
            <span className="text-primary-dark inline-flex items-center gap-1">
              <TrendingUp size={14} aria-hidden="true" /> {delta} מאז ההתחלה
            </span>
          ) : delta < 0 ? (
            <span className="text-danger inline-flex items-center gap-1">
              <TrendingDown size={14} aria-hidden="true" /> {-delta} מאז ההתחלה
            </span>
          ) : (
            <span className="text-ink-muted">יציב</span>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`מגמת דירוג: ממקום ${first} למקום ${last}`}
      >
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r="3" fill="var(--color-primary)" />
      </svg>
      <div className="flex justify-between text-xs text-ink-light font-bold mt-1">
        <span>מקום {first}</span>
        <span>מקום {last} (נוכחי)</span>
      </div>
    </div>
  );
}
