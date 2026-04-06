import { useState } from "react";
import { useMatchResults } from "../hooks/useStore";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import GroupTable from "../components/GroupTable";
import GroupSelector from "../components/GroupSelector";
import StageSelector from "../components/StageSelector";

export default function Results() {
  const results = useMatchResults();
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");

  const filteredMatches =
    selectedStage === "group"
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

  const playedCount = Object.keys(results).length;
  const totalMatches = groupMatches.length + knockoutMatches.length;

  return (
    <div>
      <h1 className="text-xl font-extrabold text-primary mb-4 tracking-tight">
        ⚽ תוצאות אמת
      </h1>

      <div className="bg-white rounded-2xl p-4 mb-4 border border-border shadow-sm">
        <div className="text-xs text-gray-400 text-center font-medium">
          {playedCount} / {totalMatches} משחקים שוחקו
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 mt-1.5">
          <div
            className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${(playedCount / totalMatches) * 100}%` }}
          />
        </div>
      </div>

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
        <GroupTable matchData={results} group={selectedGroup} />
      )}

      <div className="space-y-2">
        {filteredMatches.map((match) => {
          const isKnockout = match.stage !== "group";
          const result = results[match.id];
          // For knockout, only show team names if the match has a result
          const derived =
            isKnockout && result
              ? { home: result.homeTeam, away: result.awayTeam }
              : isKnockout
                ? { home: null, away: null }
                : { home: match.homeTeam, away: match.awayTeam };
          const homeTeam = derived.home ? getTeamByCode(derived.home) : null;
          const awayTeam = derived.away ? getTeamByCode(derived.away) : null;

          return (
            <div
              key={match.id}
              className={`bg-white rounded-2xl p-4 border card-hover ${
                result ? "border-primary/20 shadow-sm" : "border-border"
              }`}
            >
              {isKnockout && match.label && (
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-gray-400 font-medium">
                    {match.label}
                  </span>
                  {match.date && (
                    <span className="text-xs text-gray-300">{match.date}</span>
                  )}
                </div>
              )}
              {result ? (
                <div>
                  <div className="flex items-center justify-between py-1">
                    <span
                      className={`text-sm font-semibold ${homeTeam ? "text-gray-800" : "text-gray-300 italic"}`}
                    >
                      {homeTeam?.name || "טרם נקבע"}
                    </span>
                    <span
                      className={`text-lg font-extrabold tabular-nums ${result.homeScore > result.awayScore ? "text-primary" : "text-gray-400"}`}
                    >
                      {result.homeScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-t border-gray-50">
                    <span
                      className={`text-sm font-semibold ${awayTeam ? "text-gray-800" : "text-gray-300 italic"}`}
                    >
                      {awayTeam?.name || "טרם נקבע"}
                    </span>
                    <span
                      className={`text-lg font-extrabold tabular-nums ${result.awayScore > result.homeScore ? "text-primary" : "text-gray-400"}`}
                    >
                      {result.awayScore}
                    </span>
                  </div>
                  {isKnockout &&
                    result.homeScore === result.awayScore &&
                    result.advancingTeam && (
                      <div className="text-[11px] text-gray-400 text-center mt-1 pt-1 border-t border-gray-50">
                        בעיטות הכרעה:{" "}
                        {getTeamByCode(result.advancingTeam)?.name ||
                          result.advancingTeam}
                      </div>
                    )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between py-1">
                    <span
                      className={`text-sm font-semibold ${homeTeam ? "text-gray-800" : "text-gray-300 italic"}`}
                    >
                      {homeTeam?.name || "טרם נקבע"}
                    </span>
                    <span className="text-sm text-gray-300">–</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-t border-gray-50">
                    <span
                      className={`text-sm font-semibold ${awayTeam ? "text-gray-800" : "text-gray-300 italic"}`}
                    >
                      {awayTeam?.name || "טרם נקבע"}
                    </span>
                    <span className="text-sm text-gray-300">–</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {playedCount === 0 && (
        <div className="text-center py-8 text-gray-400 mt-4">
          <div className="text-4xl mb-2">🏟️</div>
          <p>עדיין לא הוזנו תוצאות</p>
        </div>
      )}
    </div>
  );
}
