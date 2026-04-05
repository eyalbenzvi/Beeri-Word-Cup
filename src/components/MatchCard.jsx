import { getTeamByCode } from '../data/teams';

export default function MatchCard({
  match,
  prediction,
  actualResult,
  onPredictionChange,
  editable = false,
  showPoints = false,
  points = null,
}) {
  const homeTeam = getTeamByCode(match.homeTeam);
  const awayTeam = getTeamByCode(match.awayTeam);

  const homeName = homeTeam?.name || match.homeTeam || 'TBD';
  const awayName = awayTeam?.name || match.awayTeam || 'TBD';
  const homeFlag = homeTeam?.flag || '🏳️';
  const awayFlag = awayTeam?.flag || '🏳️';

  const predHome = prediction?.homeScore ?? '';
  const predAway = prediction?.awayScore ?? '';

  const hasResult = actualResult && actualResult.homeScore !== null;

  return (
    <div className={`bg-card rounded-xl shadow-sm border border-gray-100 p-3 mb-2 ${
      hasResult ? 'border-l-4 border-l-primary' : ''
    }`}>
      {/* Points badge */}
      {showPoints && points !== null && (
        <div className="flex justify-end mb-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            points.points > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {points.points > 0 ? `+${points.points}` : '0'} pts — {points.breakdown}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Home Team */}
        <div className="flex-1 text-right">
          <div className="text-sm font-medium">{homeName}</div>
          <div className="text-xl">{homeFlag}</div>
        </div>

        {/* Score / Prediction Input */}
        <div className="flex flex-col items-center gap-1 min-w-[100px]">
          {/* Actual result */}
          {hasResult && (
            <div className="text-lg font-bold text-primary">
              {actualResult.homeScore} - {actualResult.awayScore}
            </div>
          )}

          {/* Prediction input */}
          {editable ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="20"
                value={predHome}
                onChange={(e) =>
                  onPredictionChange?.({
                    ...prediction,
                    homeScore: e.target.value === '' ? null : parseInt(e.target.value),
                  })
                }
                className="w-10 h-9 text-center border-2 border-gray-200 rounded-lg text-lg font-bold focus:border-primary focus:outline-none"
                placeholder="-"
              />
              <span className="text-gray-400 font-bold">:</span>
              <input
                type="number"
                min="0"
                max="20"
                value={predAway}
                onChange={(e) =>
                  onPredictionChange?.({
                    ...prediction,
                    awayScore: e.target.value === '' ? null : parseInt(e.target.value),
                  })
                }
                className="w-10 h-9 text-center border-2 border-gray-200 rounded-lg text-lg font-bold focus:border-primary focus:outline-none"
                placeholder="-"
              />
            </div>
          ) : (
            !hasResult && (
              <div className="text-sm text-gray-400">
                {predHome !== '' ? `${predHome} - ${predAway}` : 'No prediction'}
              </div>
            )
          )}

          {/* Show user prediction under actual result */}
          {hasResult && !editable && predHome !== '' && (
            <div className="text-xs text-gray-500">
              Your guess: {predHome} - {predAway}
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="flex-1 text-left">
          <div className="text-sm font-medium">{awayName}</div>
          <div className="text-xl">{awayFlag}</div>
        </div>
      </div>
    </div>
  );
}
