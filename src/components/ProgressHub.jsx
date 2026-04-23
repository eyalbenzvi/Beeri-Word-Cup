import { useState } from "react";
import { GROUPS } from "../data/teams";
import { STAGES } from "../data/matches";

const groupKeys = Object.keys(GROUPS);
const knockoutStages = Object.entries(STAGES).filter(([k]) => k !== "group");

export default function ProgressHub({
  groupMatches,
  knockoutMatches,
  matchPredictions,
  onSelectGroup,
  onSelectStage,
}) {
  const isFilled = (m) => {
    const p = matchPredictions[m.id];
    return p != null && p.homeScore != null && p.awayScore != null;
  };

  const groupCompletion = groupKeys.map((g) => {
    const matches = groupMatches.filter((m) => m.group === g);
    const filled = matches.filter(isFilled).length;
    return { group: g, filled, total: matches.length };
  });

  const stageCompletion = knockoutStages.map(([key, label]) => {
    const matches = knockoutMatches.filter((m) => m.stage === key);
    const filled = matches.filter(isFilled).length;
    return { stage: key, label, filled, total: matches.length };
  });

  const totalGroups = groupCompletion.reduce((s, g) => s + g.total, 0);
  const filledGroups = groupCompletion.reduce((s, g) => s + g.filled, 0);
  const totalKO = stageCompletion.reduce((s, g) => s + g.total, 0);
  const filledKO = stageCompletion.reduce((s, g) => s + g.filled, 0);

  const totalAll = totalGroups + totalKO;
  const filledAll = filledGroups + filledKO;
  const completionRatio = totalAll > 0 ? filledAll / totalAll : 0;

  const [expanded, setExpanded] = useState(completionRatio < 0.5);

  return (
    <div className="bg-white rounded-2xl border-2 border-border mb-4 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right hover:bg-bg-soft transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-ink-muted text-xs">{expanded ? "▲" : "▼"}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-extrabold text-ink">מפת השלמה</span>
          <div className="flex gap-1.5 text-xs font-extrabold">
            <span
              className={`px-2 py-0.5 rounded-full text-white ${filledGroups === totalGroups ? "bg-primary" : "bg-accent"}`}
            >
              בתים {filledGroups}/{totalGroups}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-white ${filledKO === totalKO ? "bg-primary" : "bg-accent"}`}
            >
              נוקאאוט {filledKO}/{totalKO}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3">
          {/* Groups grid */}
          <div>
            <div className="text-xs font-extrabold text-ink-muted mb-2">
              שלב הבתים
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {groupCompletion.map(({ group, filled, total }) => {
                const pct = total > 0 ? filled / total : 0;
                const isDone = pct === 1;
                const isEmpty = pct === 0;
                return (
                  <button
                    key={group}
                    onClick={() => onSelectGroup(group)}
                    className="relative flex flex-col items-center py-2.5 px-1.5 min-h-[44px] rounded-xl border-2 cursor-pointer transition"
                    style={{
                      background: isDone ? "var(--color-primary-soft)" : isEmpty ? "var(--color-bg-soft)" : "var(--color-accent-soft-2)",
                      borderColor: isDone ? "var(--color-primary)" : isEmpty ? "var(--color-border)" : "var(--color-accent)",
                      color: isDone ? "var(--color-primary-dark)" : isEmpty ? "var(--color-ink-muted)" : "var(--color-accent-text)",
                    }}
                  >
                    <span className="text-sm font-extrabold">{group}</span>
                    <span className="text-xs font-bold mt-0.5">
                      {filled}/{total}
                    </span>
                    <div className="w-full h-1 bg-white/70 rounded-full mt-1">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{ width: `${pct * 100}%`, background: isDone ? "var(--color-primary)" : "var(--color-accent)" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Knockout stages */}
          <div>
            <div className="text-xs font-extrabold text-ink-muted mb-2">
              שלב הנוקאאוט
            </div>
            <div className="space-y-1">
              {stageCompletion.map(({ stage, label, filled, total }) => {
                const pct = total > 0 ? filled / total : 0;
                const isDone = pct === 1;
                return (
                  <button
                    key={stage}
                    onClick={() => onSelectStage(stage)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-transparent border-none cursor-pointer hover:bg-bg-soft transition text-right"
                  >
                    <span className="text-sm font-bold text-ink flex-1">
                      {label}
                    </span>
                    <span
                      className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${isDone ? "bg-primary text-white" : "bg-bg-soft text-ink-muted"}`}
                    >
                      {filled}/{total}
                    </span>
                    <div className="w-16 h-2 bg-bg-soft rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct * 100}%`, background: isDone ? "var(--color-primary)" : "var(--color-secondary)" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
