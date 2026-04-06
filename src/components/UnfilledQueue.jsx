import { getTeamByCode } from "../data/teams";
import { STAGES } from "../data/matches";

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
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-sm font-bold text-green-600">כל המשחקים הושלמו!</p>
        <p className="text-xs text-gray-400 mt-1">
          אל תשכח לבדוק את הפרטים ולהגיש
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-gray-500 mb-3 font-medium">
        {allMissing.length} משחקים חסרים — בתים ראשון, אח"כ נוקאאוט
      </div>
      <div className="space-y-1">
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
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition cursor-pointer active:scale-[0.98] text-right"
            >
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  isKO
                    ? "bg-purple-50 text-purple-600"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                {match.stage === "group"
                  ? `בית ${match.group}`
                  : STAGES[match.stage]}
              </span>
              <span className="text-xs text-gray-700 font-medium flex-1 truncate">
                {homeInfo?.name || "טרם נקבע"} — {awayInfo?.name || "טרם נקבע"}
              </span>
              <span className="text-gray-300 text-xs">←</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
