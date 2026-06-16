import { useMemo } from "react";
import Score from "./Score";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getCachedBracket } from "../utils/bracketCache";

// Compact list of all 104 matches with their (predicted or actual) results,
// grouped by group letter (A–L) and KO stage. Used by both AllForms (to view
// a submitted form's predictions) and BestCasePanel (to view the optimised
// scenario's results). The two callers share identical layout so consumers
// see a consistent "results form" shape regardless of source.

type Prediction = {
  homeScore?: number | null;
  awayScore?: number | null;
  advancingTeam?: string;
};

function MatchRow({
  match,
  prediction,
}: {
  match: any;
  prediction: Prediction | undefined;
}) {
  const home = getTeamByCode(match.homeTeam);
  const away = getTeamByCode(match.awayTeam);
  const homeName = home?.name || "טרם נקבע";
  const awayName = away?.name || "טרם נקבע";
  const hasScore =
    prediction?.homeScore != null && prediction?.awayScore != null;

  const isTie =
    match.stage !== "group" &&
    hasScore &&
    prediction!.homeScore === prediction!.awayScore &&
    prediction!.advancingTeam;

  return (
    <div className="py-1.5 border-b border-border last:border-0 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-center truncate text-ink font-medium">
          <bdi>{homeName}</bdi>
        </div>
        <div className="w-14 text-center font-extrabold text-ink tabular-nums">
          {hasScore ? (
            <Score home={prediction!.homeScore} away={prediction!.awayScore} />
          ) : (
            "–"
          )}
        </div>
        <div className="flex-1 text-center truncate text-ink font-medium">
          <bdi>{awayName}</bdi>
        </div>
      </div>
      {isTie && (
        <div className="text-3xs text-ink-muted font-bold text-center mt-0.5">
          בעיטות הכרעה: {getTeamByCode(prediction!.advancingTeam!)?.name}
        </div>
      )}
    </div>
  );
}

const KO_ORDER = ["R32", "R16", "QF", "SF", "3RD", "F"] as const;

export default function FormMatchesView({
  predictions,
}: {
  predictions: Record<string, Prediction>;
}) {
  // Bracket teams for KO matchups. Derived from the predictions/results
  // we're viewing — the same bracket logic the leaderboard uses.
  const bracketTeams = useMemo(() => getCachedBracket(predictions), [predictions]);

  return (
    <div className="space-y-3">
      {Object.keys(GROUPS).map((group) => {
        const matches = groupMatches.filter((m) => m.group === group);
        return (
          <div key={group}>
            <div className="text-xs font-extrabold text-ink-muted mb-1">
              בית {group}
            </div>
            {matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                prediction={predictions[m.id]}
              />
            ))}
          </div>
        );
      })}

      {KO_ORDER.map((stage) => {
        const matches = knockoutMatches.filter((m) => m.stage === stage);
        if (matches.length === 0) return null;
        return (
          <div key={stage}>
            <div className="text-xs font-extrabold text-ink-muted mb-1">
              {STAGES[stage]}
            </div>
            {matches.map((m) => {
              const derived = bracketTeams[m.id]
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
          </div>
        );
      })}
    </div>
  );
}
