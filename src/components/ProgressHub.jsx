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
    <div className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right"
        aria-expanded={expanded}
      >
        <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-primary">מפת השלמה</span>
          <div className="flex gap-1.5 text-[11px] font-bold">
            <span
              className={`px-2 py-0.5 rounded-full ${filledGroups === totalGroups ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
            >
              בתים {filledGroups}/{totalGroups}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full ${filledKO === totalKO ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
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
            <div className="text-[11px] font-bold text-gray-400 mb-2">
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
                    className={`relative flex flex-col items-center py-2.5 px-1.5 min-h-[44px] rounded-xl border-none cursor-pointer transition active:scale-95 ${
                      isDone
                        ? "bg-green-50 text-green-700"
                        : isEmpty
                          ? "bg-gray-50 text-gray-400"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <span className="text-sm font-bold">{group}</span>
                    <span className="text-[11px] font-medium mt-0.5">
                      {filled}/{total}
                    </span>
                    <div className="w-full h-1 bg-gray-200/60 rounded-full mt-1">
                      <div
                        className={`h-1 rounded-full transition-all ${isDone ? "bg-green-500" : "bg-amber-400"}`}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Knockout stages */}
          <div>
            <div className="text-[11px] font-bold text-gray-400 mb-2">
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
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-transparent border-none cursor-pointer hover:bg-gray-50 transition active:scale-[0.98] text-right"
                  >
                    <span className="text-xs font-bold text-gray-700 flex-1">
                      {label}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isDone ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {filled}/{total}
                    </span>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isDone ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${pct * 100}%` }}
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
