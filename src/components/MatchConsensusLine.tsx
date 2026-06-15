import Score from "./Score";
import type { MatchConsensus } from "../utils/matchPredictionStats";

// Compact "what did the crowd predict?" line for a single match, shown on the
// Results cards. Only meaningful once predictions are locked (the caller gates
// on that) so it never leaks picks before kickoff. 1/X/2 mirrors the notation
// used in the Stats panel.
export default function MatchConsensusLine({ consensus }: { consensus?: MatchConsensus | null }) {
  if (!consensus || consensus.preds === 0) return null;
  const { preds, homeWin, draw, awayWin, topHome, topAway, topCount } = consensus;

  const buckets = [
    { sym: "1", n: homeWin },
    { sym: "X", n: draw },
    { sym: "2", n: awayWin },
  ];
  const top = buckets.reduce((best, b) => (b.n > best.n ? b : best), buckets[0]);
  const pct = Math.round((top.n / preds) * 100);

  return (
    <div className="text-[11px] text-ink-muted font-bold mt-2 pt-2 border-t border-border flex flex-wrap gap-x-2 gap-y-0.5 items-center">
      <span aria-hidden="true">🔮</span>
      <span>
        הקהל: <span className="text-ink">{top.sym} {pct}%</span>
      </span>
      {topHome != null && topAway != null && (
        <span>
          · נפוצה <Score home={topHome} away={topAway} /> ({topCount})
        </span>
      )}
      <span className="text-ink-light">· {preds} ניחושים</span>
    </div>
  );
}
