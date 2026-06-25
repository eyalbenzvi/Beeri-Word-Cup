import { useMemo, useState } from "react";
import { LayoutGrid, GitBranch } from "lucide-react";
import { GROUPS } from "../data/teams";
import { getFilteredMatches } from "../utils/matchFiltering";
import { getCachedBracket } from "../utils/bracketCache";
import StageSelector from "./StageSelector";
import GroupSelector from "./GroupSelector";
import GroupTable from "./GroupTable";
import BracketView from "./BracketView";
import { MatchRow, type Prediction } from "./FormMatchesView";

// Read-only rich view of ONE form's predictions — the "view someone else's
// form like you view your own" surface used by the AllForms accordion.
//
// It mirrors the Results page UX: a stages ⇄ bracket toggle. The "stages"
// mode reuses StageSelector/GroupSelector/GroupTable + per-stage MatchRows
// (so a viewer sees group STANDINGS, not just scores); "bracket" mode feeds
// the predictions straight into the shared BracketView knockout tree. Both
// pieces (GroupTable, BracketView) are the exact components the owner's own
// Predict/Results views render — no duplicated standings/bracket logic.
//
// All inputs are derived from `predictions` (the form's `matches` map). KO
// matchups resolve from the predicted bracket; the score/advancing fields on
// each prediction share the same shape the actual-results views consume, so
// GroupTable + BracketView accept them with no source-specific branch.
export default function FormPredictionView({
  predictions,
}: {
  predictions: Record<string, Prediction>;
}) {
  const [viewMode, setViewMode] = useState<"stages" | "bracket">("stages");
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");

  const bracketTeams = useMemo(
    () => getCachedBracket(predictions),
    [predictions],
  );
  const filteredMatches = useMemo(
    () => getFilteredMatches(selectedStage, selectedGroup),
    [selectedStage, selectedGroup],
  );

  return (
    <div>
      <div className="flex gap-1 mb-3 bg-bg-soft rounded-xl p-1 border-2 border-border">
        <button
          type="button"
          onClick={() => setViewMode("stages")}
          aria-pressed={viewMode === "stages"}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-extrabold flex items-center justify-center gap-1.5 transition border-none cursor-pointer ${
            viewMode === "stages"
              ? "bg-white text-ink shadow-sm"
              : "bg-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <LayoutGrid size={14} aria-hidden="true" />
          לפי שלבים
        </button>
        <button
          type="button"
          onClick={() => setViewMode("bracket")}
          aria-pressed={viewMode === "bracket"}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-extrabold flex items-center justify-center gap-1.5 transition border-none cursor-pointer ${
            viewMode === "bracket"
              ? "bg-white text-ink shadow-sm"
              : "bg-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <GitBranch size={14} aria-hidden="true" />
          עץ
        </button>
      </div>

      {viewMode === "bracket" ? (
        <BracketView results={predictions} bracketTeams={bracketTeams} />
      ) : (
        <>
          <StageSelector
            selectedStage={selectedStage}
            onSelect={setSelectedStage}
          />

          {selectedStage === "group" && (
            <GroupSelector
              groups={Object.keys(GROUPS)}
              selectedGroup={selectedGroup}
              onSelect={setSelectedGroup}
            />
          )}

          {selectedStage === "group" && (
            <GroupTable matchData={predictions} group={selectedGroup} />
          )}

          <div>
            {filteredMatches.map((m) => {
              // KO matchups resolve from the predicted bracket; group matches
              // already carry their fixed teams.
              const derived =
                selectedStage !== "group" && bracketTeams[m.id]
                  ? {
                      ...m,
                      homeTeam: bracketTeams[m.id].home,
                      awayTeam: bracketTeams[m.id].away,
                    }
                  : m;
              return (
                <MatchRow
                  key={m.id}
                  match={derived}
                  prediction={predictions[m.id]}
                />
              );
            })}
            {filteredMatches.length === 0 && (
              <div className="text-center py-6 text-ink-muted font-medium text-sm">
                אין משחקים בשלב הזה
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
