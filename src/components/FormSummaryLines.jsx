// Two-line summary of a form's top-level picks (champion + top scorer). Shared
// between FormList, AllForms, Leaderboard, and Profile so the label order,
// colors, and aria text never drift between pages.
import { LABELS } from "../constants/messages";

export default function FormSummaryLines({ championName, topScorerName }) {
  if (!championName && !topScorerName) return null;
  return (
    <>
      {championName && (
        <div
          className="text-xs text-accent-text font-bold mt-0.5 truncate"
          aria-label={LABELS.championAria(championName)}
        >
          🏆 {championName}
        </div>
      )}
      {topScorerName && (
        <div
          className="text-xs text-ink-muted font-medium mt-0.5 truncate"
          aria-label={LABELS.topScorerAria(topScorerName)}
        >
          ⚽ {topScorerName}
        </div>
      )}
    </>
  );
}
