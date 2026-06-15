import { useMemo, useState } from "react";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { useMatchResults, useCurrentUser, useAllPredictions, useSettings } from "../hooks/useStore";
import { computeConsensusMap } from "../utils/matchPredictionStats";
import { normalizeStatus } from "../utils/helpers";
import MatchConsensusLine from "../components/MatchConsensusLine";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getFilteredMatches } from "../utils/matchFiltering";
import { CHRONOLOGICAL_DAYS } from "../utils/chronologicalSchedule";
import { formatMatchDateShort, formatMatchClock } from "../utils/userTime";
import { getCachedBracket } from "../utils/bracketCache";
import GroupTable from "../components/GroupTable";
import GroupSelector from "../components/GroupSelector";
import ClickableName from "../components/ClickableName";
import { useTeamModal } from "../components/TeamModal";
import StageSelector from "../components/StageSelector";
import PageHeader from "../components/PageHeader";
import LoginPrompt from "../components/LoginPrompt";

function getStageContextLabel(match) {
  return match.stage === "group" ? `בית ${match.group}` : STAGES[match.stage];
}

function TeamNameCell({ team, code, className }: { team: any; code: string | null; className: string }) {
  const openTeam = useTeamModal();
  if (!team) {
    return <span className={`${className} text-ink-light italic`}>טרם נקבע</span>;
  }
  return (
    <ClickableName onClick={() => openTeam(code as string)} className={`${className} text-ink`} title={`פרטי ${team.name}`}>
      {team.name}
    </ClickableName>
  );
}

function ResultMatchCard({ match, result, bracketTeams, chronological, consensus }) {
  const isKnockout = match.stage !== "group";
  const derived = isKnockout
    ? {
        home: result?.homeTeam || bracketTeams[match.id]?.home || null,
        away: result?.awayTeam || bracketTeams[match.id]?.away || null,
      }
    : { home: match.homeTeam, away: match.awayTeam };
  const homeTeam = derived.home ? getTeamByCode(derived.home) : null;
  const awayTeam = derived.away ? getTeamByCode(derived.away) : null;

  // In chronological mode the day header already carries the date, so the
  // meta row shows stage context instead, plus time · venue.
  const metaLeft = chronological
    ? getStageContextLabel(match)
    : isKnockout && match.label && !/^W\d+\s+vs\s+W\d+$/.test(match.label)
      ? match.label
      : null;
  const metaRight = (chronological
    ? [formatMatchClock(match), match.venue]
    : [formatMatchDateShort(match), formatMatchClock(match), match.venue]
  )
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`bg-white rounded-2xl p-4 ${
        result ? "border-2 border-primary/50" : "border border-border"
      }`}
    >
      {(metaLeft || metaRight) && (
        <div className="flex justify-between items-center mb-1.5">
          {metaLeft ? (
            <span className="text-xs text-secondary font-bold">{metaLeft}</span>
          ) : (
            <span />
          )}
          <span className="text-xs text-ink-muted">{metaRight}</span>
        </div>
      )}
      {result ? (
        <div>
          <div className="flex items-center justify-between py-1.5">
            <TeamNameCell team={homeTeam} code={derived.home} className="text-sm font-bold" />
            <span className={`text-2xl font-extrabold tabular-nums ${result.homeScore > result.awayScore ? "text-primary" : "text-ink-muted"}`}>
              {result.homeScore}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-t border-border">
            <TeamNameCell team={awayTeam} code={derived.away} className="text-sm font-bold" />
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
            <TeamNameCell team={homeTeam} code={derived.home} className="text-sm font-bold" />
            <span className="text-sm text-ink-light">–</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-t border-border">
            <TeamNameCell team={awayTeam} code={derived.away} className="text-sm font-bold" />
            <span className="text-sm text-ink-light">–</span>
          </div>
        </div>
      )}
      <MatchConsensusLine consensus={consensus} />
    </div>
  );
}

export default function Results() {
  const results = useMatchResults();
  const { user } = useCurrentUser();
  const allPredictions = useAllPredictions();
  const settings = useSettings();
  const [viewMode, setViewMode] = useState("stages");
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");

  const filteredMatches = getFilteredMatches(selectedStage, selectedGroup);
  const bracketTeams = useMemo(() => getCachedBracket(results), [results]);

  // Crowd consensus per match (#8). Only computed/shown once predictions are
  // locked, so it never reveals picks before kickoff. Built once per data
  // change in a single pass over the submitted forms.
  const consensusMap = useMemo(() => {
    if (!settings.predictionsLocked) return {};
    const submitted = Object.entries(allPredictions)
      .filter(([, f]) => normalizeStatus((f as any).status) === "submitted")
      .map(([formId, f]) => ({ formId, ...(f as any) }));
    return computeConsensusMap(submitted);
  }, [allPredictions, settings.predictionsLocked]);

  const playedCount = Object.keys(results).length;
  const totalMatches = groupMatches.length + knockoutMatches.length;

  return (
    <div>
      <PageHeader
        eyebrow="מה קרה בפועל"
        title="תוצאות"
        subtitle={`${playedCount} מתוך ${totalMatches} משחקים שוחקו`}
      />
      {!user && (
        <LoginPrompt
          variant="banner"
          title="התחבר כדי לנחש תוצאות"
          subtitle="כל אחד יכול לראות את התוצאות. כדי לצבור נקודות — צריך חשבון."
        />
      )}

      <div className="mb-4">
        <div className="w-full bg-bg-soft rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary rounded-full h-full transition-all"
            style={{ width: `${(playedCount / totalMatches) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1 mb-3 bg-bg-soft rounded-xl p-1 border-2 border-border">
        <button
          type="button"
          onClick={() => setViewMode("stages")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-extrabold flex items-center justify-center gap-1.5 transition ${
            viewMode === "stages"
              ? "bg-white text-ink shadow-sm"
              : "bg-transparent text-ink-muted hover:text-ink"
          }`}
          aria-pressed={viewMode === "stages"}
        >
          <LayoutGrid size={14} />
          לפי שלבים
        </button>
        <button
          type="button"
          onClick={() => setViewMode("chronological")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-extrabold flex items-center justify-center gap-1.5 transition ${
            viewMode === "chronological"
              ? "bg-white text-ink shadow-sm"
              : "bg-transparent text-ink-muted hover:text-ink"
          }`}
          aria-pressed={viewMode === "chronological"}
        >
          <CalendarDays size={14} />
          סדר כרונולוגי
        </button>
      </div>

      {viewMode === "stages" ? (
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
            <GroupTable matchData={results} group={selectedGroup} />
          )}

          <div className="space-y-2 md:grid md:grid-cols-2 xl:grid-cols-2 md:gap-3 md:space-y-0">
            {filteredMatches.map((match) => (
              <ResultMatchCard
                key={match.id}
                match={match}
                result={results[match.id]}
                bracketTeams={bracketTeams}
                consensus={consensusMap[match.id]}
                chronological={false}
              />
            ))}
          </div>
        </>
      ) : (
        <div>
          {CHRONOLOGICAL_DAYS.map((day) => (
            <div key={day.key}>
              <div className="flex items-center gap-3 mt-5 mb-2 first:mt-0">
                <span className="text-sm font-extrabold text-ink whitespace-nowrap">
                  {day.label}
                </span>
                <div className="flex-1 border-t-2 border-border" />
              </div>
              <div className="space-y-2 md:grid md:grid-cols-2 xl:grid-cols-2 md:gap-3 md:space-y-0">
                {day.matches.map((match) => (
                  <ResultMatchCard
                    key={match.id}
                    match={match}
                    result={results[match.id]}
                    bracketTeams={bracketTeams}
                    consensus={consensusMap[match.id]}
                    chronological
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {playedCount === 0 && (
        <div className="text-center py-12 card-duo-lg mt-4">
          <div className="text-6xl mb-3">🏟️</div>
          <p className="text-lg font-extrabold text-ink">עדיין לא הוזנו תוצאות</p>
        </div>
      )}
    </div>
  );
}
