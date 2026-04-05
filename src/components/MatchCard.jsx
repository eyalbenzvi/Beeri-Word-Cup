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
  const hasPrediction = predHome !== '' && predAway !== '';

  const showLabel = match.label && match.stage !== 'group';

  return (
    <div className={`bg-white rounded-2xl border p-3.5 transition-all ${
      hasResult ? 'border-primary/30 shadow-sm' :
      hasPrediction && !editable ? 'border-green-200' : 'border-gray-100'
    }`}>
      {/* Bracket label & date */}
      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-[11px] text-gray-400 font-medium">{match.label}</span>
          {match.date && <span className="text-[11px] text-gray-300">{match.date}</span>}
        </div>
      )}

      {/* Points badge */}
      {showPoints && points !== null && (
        <div className="flex justify-end mb-1.5">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
            points.points > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'
          }`}>
            {points.points > 0 ? `+${points.points}` : '0'} נק׳ — {points.breakdown}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Home Team */}
        <div className="flex-1 text-center">
          <div className={`text-sm font-semibold ${homeTeam ? 'text-gray-800' : 'text-gray-300'}`}>{homeName}</div>
        </div>

        {/* Score / Prediction Input */}
        <div className="flex flex-col items-center gap-1 min-w-[110px]">
          {hasResult && (
            <div className="text-xl font-extrabold text-primary tracking-wider">
              {actualResult.homeScore} – {actualResult.awayScore}
            </div>
          )}

          {editable ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="20"
                inputMode="numeric"
                value={predHome}
                onChange={(e) => {
                  const newHome = e.target.value === '' ? null : parseInt(e.target.value);
                  const newPred = { ...prediction, homeScore: newHome };
                  if (isKnockout) delete newPred.advancingTeam;
                  onPredictionChange?.(newPred);
                }}
                className="w-12 h-12 text-center border-2 border-gray-200 rounded-2xl text-lg font-bold focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all bg-gray-50/50"
                placeholder="–"
              />
              <span className="text-gray-300 font-bold text-base">:</span>
              <input
                type="number"
                min="0"
                max="20"
                inputMode="numeric"
                value={predAway}
                onChange={(e) => {
                  const newAway = e.target.value === '' ? null : parseInt(e.target.value);
                  const newPred = { ...prediction, awayScore: newAway };
                  if (isKnockout) delete newPred.advancingTeam;
                  onPredictionChange?.(newPred);
                }}
                className="w-12 h-12 text-center border-2 border-gray-200 rounded-2xl text-lg font-bold focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all bg-gray-50/50"
                placeholder="–"
              />
            </div>
          ) : (
            !hasResult && (
              <div className={`text-sm tracking-wider ${hasPrediction ? 'font-bold text-gray-600' : 'text-gray-300'}`}>
                {hasPrediction ? `${predHome} – ${predAway}` : '– : –'}
              </div>
            )
          )}

          {hasResult && !editable && predHome !== '' && (
            <div className="text-[11px] text-gray-400 font-medium">
              ניחוש: {predHome} – {predAway}
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="flex-1 text-center">
          <div className={`text-sm font-semibold ${awayTeam ? 'text-gray-800' : 'text-gray-300'}`}>{awayName}</div>
        </div>
      </div>

      {/* Knockout tie — choose who advances */}
      {isKnockout && predHome !== '' && predAway !== '' &&
       parseInt(predHome) === parseInt(predAway) && (
        editable ? (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-[11px] text-gray-400 text-center mb-2 font-medium">מי עולה? (פנדלים)</div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => onPredictionChange?.({ ...prediction, advancingTeam: match.homeTeam })}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                  prediction?.advancingTeam === match.homeTeam
                    ? 'bg-primary text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {homeName}
              </button>
              <button
                onClick={() => onPredictionChange?.({ ...prediction, advancingTeam: match.awayTeam })}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                  prediction?.advancingTeam === match.awayTeam
                    ? 'bg-primary text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {awayName}
              </button>
            </div>
          </div>
        ) : prediction?.advancingTeam ? (
          <div className="mt-1.5 text-[11px] text-gray-400 text-center font-medium">
            עולה: {prediction.advancingTeam === match.homeTeam ? homeName : awayName}
          </div>
        ) : null
      )}
    </div>
  );
}
