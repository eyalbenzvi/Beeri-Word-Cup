import { getTeamByCode } from '../data/teams';

export default function MatchCard({
  match,
  prediction,
  actualResult,
  onPredictionChange,
  editable = false,
  showPoints = false,
  points = null,
  isKnockout = false,
}) {
  const homeTeam = getTeamByCode(match.homeTeam);
  const awayTeam = getTeamByCode(match.awayTeam);

  const homeName = homeTeam?.name || 'טרם נקבע';
  const awayName = awayTeam?.name || 'טרם נקבע';

  const predHome = prediction?.homeScore ?? '';
  const predAway = prediction?.awayScore ?? '';

  const hasResult = actualResult && actualResult.homeScore !== null;

  // Show bracket label for knockout matches
  const showLabel = match.label && match.stage !== 'group';

  return (
    <div className={`bg-card rounded-xl shadow-sm border border-gray-100 p-3 mb-2 ${
      hasResult ? 'border-l-4 border-l-primary' : ''
    }`}>
      {/* Bracket label & date */}
      {showLabel && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-400 font-medium">{match.label}</span>
          {match.date && <span className="text-xs text-gray-300">{match.date}</span>}
        </div>
      )}

      {/* Points badge */}
      {showPoints && points !== null && (
        <div className="flex justify-end mb-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            points.points > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {points.points > 0 ? `+${points.points}` : '0'} נק׳ — {points.breakdown}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Home Team */}
        <div className="flex-1 text-center">
          <div className="text-sm font-medium">{homeName}</div>
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
                onChange={(e) => {
                  const newHome = e.target.value === '' ? null : parseInt(e.target.value);
                  const newPred = { ...prediction, homeScore: newHome };
                  // Clear advancingTeam when score changes (tie status may change)
                  if (isKnockout) delete newPred.advancingTeam;
                  onPredictionChange?.(newPred);
                }}
                className="w-10 h-9 text-center border-2 border-gray-200 rounded-lg text-lg font-bold focus:border-primary focus:outline-none"
                placeholder="-"
              />
              <span className="text-gray-400 font-bold">:</span>
              <input
                type="number"
                min="0"
                max="20"
                value={predAway}
                onChange={(e) => {
                  const newAway = e.target.value === '' ? null : parseInt(e.target.value);
                  const newPred = { ...prediction, awayScore: newAway };
                  // Clear advancingTeam when score changes (tie status may change)
                  if (isKnockout) delete newPred.advancingTeam;
                  onPredictionChange?.(newPred);
                }}
                className="w-10 h-9 text-center border-2 border-gray-200 rounded-lg text-lg font-bold focus:border-primary focus:outline-none"
                placeholder="-"
              />
            </div>
          ) : (
            !hasResult && (
              <div className="text-sm text-gray-400">
                {predHome !== '' ? `${predHome} - ${predAway}` : 'אין ניחוש'}
              </div>
            )
          )}

          {/* Show user prediction under actual result */}
          {hasResult && !editable && predHome !== '' && (
            <div className="text-xs text-gray-500">
              הניחוש שלך: {predHome} - {predAway}
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="flex-1 text-center">
          <div className="text-sm font-medium">{awayName}</div>
        </div>
      </div>

      {/* Knockout tie — choose who advances */}
      {isKnockout && predHome !== '' && predAway !== '' &&
       parseInt(predHome) === parseInt(predAway) && (
        editable ? (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="text-xs text-gray-500 text-center mb-1.5">מי עולה? (פנדלים)</div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => onPredictionChange?.({ ...prediction, advancingTeam: match.homeTeam })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  prediction?.advancingTeam === match.homeTeam
                    ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {homeName}
              </button>
              <button
                onClick={() => onPredictionChange?.({ ...prediction, advancingTeam: match.awayTeam })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  prediction?.advancingTeam === match.awayTeam
                    ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {awayName}
              </button>
            </div>
          </div>
        ) : prediction?.advancingTeam ? (
          <div className="mt-1 text-xs text-gray-400 text-center">
            עולה: {prediction.advancingTeam === match.homeTeam ? homeName : awayName}
          </div>
        ) : null
      )}
    </div>
  );
}
