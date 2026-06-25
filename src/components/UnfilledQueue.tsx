import { getTeamByCode } from "../data/teams";
import { STAGES } from "../data/matches";
import { r32SlotLabel } from "../utils/matchSlot";

export default function UnfilledQueue({
  groupMatches,
  knockoutMatches,
  matchPredictions,
  bracketTeams,
  onJump,
}) {
  const isMissing = (m) => {
    const p = matchPredictions[m.id];
    return (
      !p ||
      p.homeScore === undefined ||
      p.homeScore === null ||
      p.awayScore === undefined ||
      p.awayScore === null
    );
  };

  const missingGroup = groupMatches.filter(isMissing);
  const missingKnockout = knockoutMatches.filter(isMissing);
  const allMissing = [...missingGroup, ...missingKnockout];

  if (allMissing.length === 0) {
    return (
      <div className="text-center py-12 card-duo-lg">
        <div className="text-6xl mb-3 animate-pop-in">🎉</div>
        <p className="text-lg font-extrabold text-primary">כל המשחקים הושלמו!</p>
        <p className="text-sm text-ink-muted mt-1 font-medium">
          אל תשכח לבדוק את הפרטים ולהגיש
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm text-ink-muted mb-3 font-bold">
        {allMissing.length} משחקים חסרים — בתים ראשון, אח"כ נוקאאוט
      </div>
      <div className="space-y-2">
        {allMissing.map((match) => {
          const isKO = match.stage !== "group";
          const teams =
            isKO && bracketTeams[match.id]
              ? bracketTeams[match.id]
              : { home: match.homeTeam, away: match.awayTeam };
          const homeInfo = getTeamByCode(teams.home);
          const awayInfo = getTeamByCode(teams.away);

          return (
            <button
              key={match.id}
              onClick={() => onJump(match)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border-2 border-border hover:border-border-strong transition cursor-pointer text-right"
            >
              <span
                className={`text-3xs font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap text-white ${
                  isKO ? "bg-purple" : "bg-secondary"
                }`}
              >
                {match.stage === "group"
                  ? `בית ${match.group}`
                  : STAGES[match.stage]}
              </span>
              <span className="text-sm text-ink font-bold flex-1 truncate">
                {homeInfo?.name || r32SlotLabel(match, "home") || "טרם נקבע"} —{" "}
                {awayInfo?.name || r32SlotLabel(match, "away") || "טרם נקבע"}
              </span>
              <span className="text-ink-light text-xs">←</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
