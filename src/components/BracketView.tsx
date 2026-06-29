import { knockoutMatches, STAGES, BRACKET_DISPLAY_ORDER } from "../data/matches";
import { getTeamByCode } from "../data/teams";
import { r32SlotLabel } from "../utils/matchSlot";
import { useTeamModal } from "./TeamModal";
import ClickableName from "./ClickableName";
import ResultBreakdown from "./ResultBreakdown";

// Visual knockout tree (#5). The classic connected-bracket layout is hostile to
// narrow screens, so this renders one horizontally-scrollable column per round
// (R32 → Final) with the matchups stacked inside — which reads as the
// progression while staying readable on a phone. Teams resolve from the actual
// bracket (derived from results); scores + the advancing side come from the
// official results. A small third-place card sits below.
const ROUND_ORDER = ["R32", "R16", "QF", "SF", "F"];

function side(code: string | null, score: number | null, isWinner: boolean, openTeam: (c: string) => void, placeholder: string | null) {
  const team = code ? getTeamByCode(code) : null;
  return (
    <div className={`flex items-center justify-between gap-1 ${isWinner ? "font-extrabold text-ink" : "text-ink-muted"}`}>
      <span className="truncate flex items-center gap-1 min-w-0">
        {team?.flag && <span aria-hidden="true">{team.flag}</span>}
        {team ? (
          <ClickableName onClick={() => openTeam(code as string)} title={`פרטי ${team.name}`} className="truncate">
            {team.name}
          </ClickableName>
        ) : (
          <span className="italic text-ink-light truncate">{placeholder || "טרם נקבע"}</span>
        )}
      </span>
      <span className="tabular-nums shrink-0">{score == null ? "" : score}</span>
    </div>
  );
}

function BracketCell({ match, result, derived }: { match: any; result: any; derived: { home: string | null; away: string | null } }) {
  const openTeam = useTeamModal();
  const hasResult = result && result.homeScore != null;
  // Winner: explicit advancing team (covers penalties) else higher score.
  let winner: string | null = null;
  if (hasResult) {
    if (result.advancingTeam) winner = result.advancingTeam;
    else if (result.homeScore > result.awayScore) winner = derived.home;
    else if (result.awayScore > result.homeScore) winner = derived.away;
  }
  return (
    <div className={`rounded-xl border-2 p-2 text-xs bg-card ${hasResult ? "border-primary/60" : "border-border"}`}>
      {side(derived.home, hasResult ? result.homeScore : null, winner === derived.home, openTeam, r32SlotLabel(match, "home"))}
      <div className="h-px bg-border my-1" />
      {side(derived.away, hasResult ? result.awayScore : null, winner === derived.away, openTeam, r32SlotLabel(match, "away"))}
      <ResultBreakdown result={result} variant="badge" />
    </div>
  );
}

export default function BracketView({ results, bracketTeams }: { results: Record<string, any>; bracketTeams: Record<string, any> }) {
  const derivedFor = (m: any) => ({
    home: results[m.id]?.homeTeam || bracketTeams[m.id]?.home || null,
    away: results[m.id]?.awayTeam || bracketTeams[m.id]?.away || null,
  });

  const thirdPlace = knockoutMatches.find((m) => m.stage === "3RD");

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div className="flex gap-3 min-w-max">
          {ROUND_ORDER.map((stage) => {
            // Stack each round in bracket order (not raw FIFA-number order) so
            // every match sits vertically centred between its two feeders — the
            // adjacency IS the tree, so the order has to encode the real
            // homeFrom/awayFrom links (e.g. R16-1 between R32-2 and R32-5).
            const order: string[] = BRACKET_DISPLAY_ORDER[stage] || [];
            const matches = knockoutMatches
              .filter((m) => m.stage === stage)
              .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
            if (matches.length === 0) return null;
            return (
              <div key={stage} className="flex flex-col gap-2 w-[150px] sm:w-[170px] shrink-0">
                <div className="text-xs font-extrabold text-ink-muted text-center sticky top-0 bg-bg py-1">
                  {STAGES[stage] || stage}
                </div>
                <div className="flex flex-col justify-around gap-2 flex-1">
                  {matches.map((m) => (
                    <BracketCell key={m.id} match={m} result={results[m.id]} derived={derivedFor(m)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {thirdPlace && (
        <div className="mt-4 max-w-[280px] mx-auto">
          <div className="text-xs font-extrabold text-ink-muted text-center mb-1">
            {STAGES["3RD"] || "מקום שלישי"} 🥉
          </div>
          <BracketCell match={thirdPlace} result={results[thirdPlace.id]} derived={derivedFor(thirdPlace)} />
        </div>
      )}
    </div>
  );
}
