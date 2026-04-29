import { useMemo, useState } from "react";
import { useMatchResults } from "../hooks/useStore";
import { groupMatches, knockoutMatches } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getFilteredMatches } from "../utils/matchFiltering";
import { getCachedBracket } from "../utils/bracketCache";
import GroupTable from "../components/GroupTable";
import GroupSelector from "../components/GroupSelector";
import StageSelector from "../components/StageSelector";
import PageHeader from "../components/PageHeader";

export default function Results() {
  const results = useMatchResults();
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");

  const filteredMatches = getFilteredMatches(selectedStage, selectedGroup);
  const bracketTeams = useMemo(() => getCachedBracket(results), [results]);

  const playedCount = Object.keys(results).length;
  const totalMatches = groupMatches.length + knockoutMatches.length;

  return (
    <div>
      <PageHeader
        eyebrow="מה קרה בפועל"
        title="תוצאות"
        subtitle={`${playedCount} מתוך ${totalMatches} משחקים שוחקו`}
      />

      <div className="mb-4">
        <div className="w-full bg-bg-soft rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary rounded-full h-full transition-all"
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

      <div className="space-y-2 md:grid md:grid-cols-2 xl:grid-cols-2 md:gap-3 md:space-y-0">
        {filteredMatches.map((match) => {
          const isKnockout = match.stage !== "group";
          const result = results[match.id];
          const derived =
            isKnockout && result
              ? { home: result.homeTeam, away: result.awayTeam }
              : isKnockout
                ? {
                    home: bracketTeams[match.id]?.home || null,
                    away: bracketTeams[match.id]?.away || null,
                  }
                : { home: match.homeTeam, away: match.awayTeam };
          const homeTeam = derived.home ? getTeamByCode(derived.home) : null;
          const awayTeam = derived.away ? getTeamByCode(derived.away) : null;

          return (
            <div
              key={match.id}
              className={`bg-white rounded-2xl p-4 ${
                result ? "border-2 border-primary/50" : "border border-border"
              }`}
            >
              {match.date && (
                <div className="flex justify-between items-center mb-1.5">
                  {isKnockout && match.label && !/^W\d+\s+vs\s+W\d+$/.test(match.label) ? (
                    <span className="text-xs text-secondary font-bold">
                      {match.label}
                    </span>
                  ) : <span />}
                  <span className="text-xs text-ink-muted">
                    {[match.date, match.time, match.venue].filter(Boolean).join(" · ")}
                  </span>
                </div>
              )}
              {result ? (
                <div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className={`text-sm font-bold ${homeTeam ? "text-ink" : "text-ink-light italic"}`}>
                      {homeTeam?.name || "טרם נקבע"}
                    </span>
                    <span className={`text-2xl font-extrabold tabular-nums ${result.homeScore > result.awayScore ? "text-primary" : "text-ink-muted"}`}>
                      {result.homeScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-t border-border">
                    <span className={`text-sm font-bold ${awayTeam ? "text-ink" : "text-ink-light italic"}`}>
                      {awayTeam?.name || "טרם נקבע"}
                    </span>
                    <span className={`text-2xl font-extrabold tabular-nums ${result.awayScore > result.homeScore ? "text-primary" : "text-ink-muted"}`}>
                      {result.awayScore}
                    </span>
                  </div>
                  {isKnockout &&
                    result.homeScore === result.awayScore &&
                    result.advancingTeam && (
                      <div className="text-xs text-ink-muted text-center mt-2 pt-2 border-t border-border font-bold">
                        בעיטות הכרעה:{" "}
                        {getTeamByCode(result.advancingTeam)?.name ||
                          result.advancingTeam}
                      </div>
                    )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className={`text-sm font-bold ${homeTeam ? "text-ink" : "text-ink-light italic"}`}>
                      {homeTeam?.name || "טרם נקבע"}
                    </span>
                    <span className="text-sm text-ink-light">–</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-t border-border">
                    <span className={`text-sm font-bold ${awayTeam ? "text-ink" : "text-ink-light italic"}`}>
                      {awayTeam?.name || "טרם נקבע"}
                    </span>
                    <span className="text-sm text-ink-light">–</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {playedCount === 0 && (
        <div className="text-center py-12 card-duo-lg mt-4">
          <div className="text-6xl mb-3">🏟️</div>
          <p className="text-lg font-extrabold text-ink">עדיין לא הוזנו תוצאות</p>
        </div>
      )}
    </div>
  );
}
