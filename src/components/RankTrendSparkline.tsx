import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { RankPoint } from "../utils/computeFormRankHistory";

// Compact rank-trend chart for a single form (#6). The series is derived
// retroactively from official results (see computeFormRankHistory) — one point
// per completed match, identical for every viewer — so it renders nothing until
// at least two matches have been played.
//
// Readability rules (UX/infographic pass):
//  • Time runs RIGHT→LEFT to match Hebrew reading: the earliest match sits at
//    the right edge ("התחלה"), the current standing at the left ("נוכחי"), so
//    the end-dot and the "נוכחי" label finally agree.
//  • Y axis is inverted — a better (lower) rank number sits HIGHER — and a tiny
//    caption plus a dashed "starting line" make that legible without a full
//    numeric axis. Anything above the dashed line beat the starting place.
//  • The line, the end-dot and the delta badge all share ONE colour driven by
//    the net trend: green = climbed, red = dropped, blue = unchanged. No more
//    "green line / red badge" contradiction.
const W = 240;
const H = 56;
const PAD = 6;

export default function RankTrendSparkline({ history }: { history: RankPoint[] }) {
  if (!history || history.length < 2) return null;

  const ranks = history.map((p) => p.rank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = max - min || 1;
  const n = history.length;

  const first = ranks[0];
  const last = ranks[ranks.length - 1];
  const delta = first - last; // positive = climbed (rank number went down)
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  // One semantic colour for the line + end-dot + badge.
  const color =
    trend === "up"
      ? "var(--color-primary)"
      : trend === "down"
        ? "var(--color-danger)"
        : "var(--color-secondary)";

  // RTL x: index 0 (start) at the right edge, latest (current) at the left.
  // Inverted y: a lower (better) rank maps higher on the chart.
  const xAt = (i: number) => W - PAD - (i / (n - 1)) * (W - 2 * PAD);
  const yAt = (rank: number) => PAD + ((rank - min) / span) * (H - 2 * PAD);

  const pts = history.map((p, i) => [xAt(i), yAt(p.rank)] as const);
  const path = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const startY = yAt(first);

  // Fractional endpoint positions for the HTML dot overlays — kept perfectly
  // circular regardless of the SVG's non-uniform horizontal stretch.
  const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  const startDot = pct(xAt(0), startY);
  const curDot = pct(xAt(n - 1), yAt(last));

  const change =
    trend === "up"
      ? `עלייה של ${delta} מקומות`
      : trend === "down"
        ? `ירידה של ${-delta} מקומות`
        : "ללא שינוי בדירוג";
  const ariaLabel = `מגמת דירוג: התחלה במקום ${first}, נוכחי מקום ${last} — ${change}`;

  return (
    <div className="card-duo mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-extrabold text-ink">📈 מגמת דירוג</div>
        <div className="text-xs font-bold">
          {trend === "up" ? (
            <span className="text-primary-dark inline-flex items-center gap-1">
              <TrendingUp size={14} aria-hidden="true" /> {delta} מקומות
            </span>
          ) : trend === "down" ? (
            <span className="text-danger inline-flex items-center gap-1">
              <TrendingDown size={14} aria-hidden="true" /> {-delta} מקומות
            </span>
          ) : (
            <span className="text-ink-muted inline-flex items-center gap-1">
              <Minus size={14} aria-hidden="true" /> ללא שינוי
            </span>
          )}
        </div>
      </div>

      {/* Direction key — removes the inverted-axis ambiguity in one line. */}
      <div className="text-3xs text-ink-light font-bold mb-1">
        ככל שהקו גבוה יותר, כך הדירוג טוב יותר
      </div>

      <div className="relative" style={{ height: H }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
          className="block"
        >
          {/* Starting-place reference: anything above this line beat the start. */}
          <line
            x1="0"
            y1={startY.toFixed(1)}
            x2={W}
            y2={startY.toFixed(1)}
            stroke="var(--color-border-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Endpoints as HTML overlays so the horizontal stretch can't squash
            them into ellipses. Hollow = start, filled = current. */}
        <span
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg"
          style={{ left: startDot.left, top: startDot.top, borderColor: color }}
          aria-hidden="true"
        />
        <span
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg"
          style={{ left: curDot.left, top: curDot.top, backgroundColor: color }}
          aria-hidden="true"
        />
      </div>

      {/* Endpoint labels: start on the right, current on the left — now aligned
          with the line's right→left time direction. */}
      <div className="flex justify-between text-2xs font-bold text-ink-muted mt-1">
        <span>התחלה · מקום {first}</span>
        <span>נוכחי · מקום {last}</span>
      </div>
    </div>
  );
}
