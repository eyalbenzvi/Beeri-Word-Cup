import { useState } from 'react';
import {
  useCurrentUser, useMatchResults, useAllPredictions,
  useUsers, useActualBonuses,
} from '../hooks/useStore';
import { calculateFullScore, compareTiebreaker, calculateMatchPoints } from '../utils/scoring';
import { generateGroupMatches, generateKnockoutMatches, STAGES } from '../data/matches';
import { getTeamByCode } from '../data/teams';
import { calcBracketTeams, deriveAdvancingTeams, deriveActualAdvancing, deriveChampion } from '../utils/bracket';
import MatchCard from '../components/MatchCard';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();
const allMatchesMap = Object.fromEntries(
  [...groupMatches, ...knockoutMatches].map((m) => [m.id, m])
);

export default function Leaderboard() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const [selectedForm, setSelectedForm] = useState(null);

  // Compute bracket from actual results (once, shared)
  const actualBracket = calcBracketTeams(results);
  // Only award advancing points for completed groups/played knockout matches
  const actualDerivedAdvancing = deriveActualAdvancing(actualBracket, results);
  const actualDerivedChampion = deriveChampion(results, actualBracket);

  // Calculate scores for approved forms only
  const leaderboard = Object.entries(allPredictions)
    .filter(([, predData]) => predData.status === 'submitted')
    .map(([formId, predData]) => {
      const matchPreds = predData.matches || {};
      const predBracket = calcBracketTeams(matchPreds);
      const derivedAdvancing = deriveAdvancingTeams(predBracket);
      const derivedChampion = deriveChampion(matchPreds, predBracket);
      const enrichedPredData = {
        ...predData,
        advancing: derivedAdvancing,
        champion: derivedChampion,
      };
      const score = calculateFullScore(
        enrichedPredData, results, actualDerivedAdvancing,
        { ...actualBonuses, champion: actualDerivedChampion },
        predBracket, actualBracket
      );
      const userInfo = users[predData.userId] || {};
      return {
        formId,
        userId: predData.userId,
        formName: predData.formName || 'טופס ללא שם',
        userName: userInfo.displayName || predData.userId,
        ...score,
      };
    })
    .sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
      return compareTiebreaker(a, b);
    });

  // Detailed view for selected form
  const renderFormDetail = () => {
    if (!selectedForm) return null;

    const predData = allPredictions[selectedForm] || {};
    const matchPreds = predData.matches || {};
    const predBracket = calcBracketTeams(matchPreds);
    const derivedAdvancing = deriveAdvancingTeams(predBracket);
    const derivedChampion = deriveChampion(matchPreds, predBracket);
    const enrichedPredData = { ...predData, advancing: derivedAdvancing, champion: derivedChampion };
    const score = calculateFullScore(
      enrichedPredData, results, actualDerivedAdvancing,
      { ...actualBonuses, champion: actualDerivedChampion },
      predBracket, actualBracket
    );
    const playedMatches = Object.keys(results);

    const matchesByStage = {};
    for (const matchId of playedMatches) {
      const match = allMatchesMap[matchId];
      const result = results[matchId];
      const stage = result.stage || match?.stage || 'group';
      if (!matchesByStage[stage]) matchesByStage[stage] = [];
      matchesByStage[stage].push({ matchId, match, result });
    }

    const userInfo = users[predData.userId] || {};

    return (
      <div className="mt-4">
        <button
          onClick={() => setSelectedForm(null)}
          className="text-sm text-primary mb-3 flex items-center gap-1"
        >
          חזרה לטבלת הדירוג →
        </button>

        <h2 className="text-lg font-bold text-primary mb-0.5">
          {predData.formName || 'טופס ללא שם'}
        </h2>
        <p className="text-xs text-gray-400 mb-3">{userInfo.displayName || predData.userId}</p>

        {/* Score breakdown */}
        <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-primary">{score.totalPoints}</div>
            <div className="text-gray-500">סה״כ</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-green-600">{score.exactScoreCount}</div>
            <div className="text-gray-500">תוצאות מדויקות</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-blue-600">{score.outcomeCount}</div>
            <div className="text-gray-500">הכרעות</div>
          </div>
        </div>

        {/* Advancing points */}
        {Object.values(score.advancingPoints).some(v => v > 0) && (
          <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100 text-sm">
            <div className="text-xs font-semibold text-gray-600 mb-1">נקודות עליה:</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[['R32','שמינית'],['R16','שמינית-16'],['QF','רבע'],['SF','חצי'],['F','גמר']].map(([round, label]) => {
                const pts = score.advancingPoints[round] || 0;
                if (!pts) return null;
                return (
                  <span key={round} className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                    {label}: +{pts}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Bonus predictions */}
        <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100 text-sm">
          <div className="flex justify-between py-1 border-b border-gray-50">
            <span className="text-gray-600">ניחוש אלופה:</span>
            <span className="font-medium">
              {derivedChampion ? (getTeamByCode(derivedChampion)?.name || 'טרם נקבע') : 'אין'}
              {score.correctChampion ? ' ✅' : ''}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-600">ניחוש מלך שערים:</span>
            <span className="font-medium">
              {predData.topScorer || 'אין'}
              {score.correctTopScorer ? ' ✅' : ''}
            </span>
          </div>
        </div>

        {/* Match-by-match results */}
        {Object.entries(matchesByStage).map(([stage, matches]) => (
          <div key={stage} className="mb-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">
              {STAGES[stage] || stage}
            </h3>
            {matches.map(({ matchId, match, result }) => {
              const prediction = predData.matches?.[matchId];
              const predTeams = predBracket[matchId] || null;
              const actTeams = actualBracket[matchId] || null;
              const pts = calculateMatchPoints(prediction, result, stage, predTeams, actTeams);
              const derivedMatch = match?.stage !== 'group' && actTeams
                ? { ...match, homeTeam: actTeams.home, awayTeam: actTeams.away }
                : match || { homeTeam: result.homeTeam, awayTeam: result.awayTeam };
              const predMatchup = (stage !== 'group' && predTeams?.home && predTeams?.away)
                ? { home: getTeamByCode(predTeams.home), away: getTeamByCode(predTeams.away) }
                : null;
              return (
                <div key={matchId}>
                  <MatchCard
                    match={derivedMatch}
                    prediction={prediction}
                    actualResult={result}
                    showPoints
                    points={pts}
                  />
                  {predMatchup && (
                    <div className={`text-xs px-3 py-1.5 -mt-1 mb-2 rounded-b-xl ${
                      pts.wrongMatchup ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'
                    }`}>
                      ניחש: {predMatchup.home?.name || 'טרם נקבע'} נגד {predMatchup.away?.name || 'טרם נקבע'}
                      {prediction ? ` (${prediction.homeScore}-${prediction.awayScore})` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {playedMatches.length === 0 && (
          <p className="text-center text-gray-400 py-8">
            עדיין לא שוחקו משחקים
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">🏆 טבלת דירוג</h1>

      {selectedForm ? (
        renderFormDetail()
      ) : (
        <>
          <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100">
            <div className="text-xs text-gray-500 text-center">
              {Object.keys(results).length} משחקים שוחקו •{' '}
              {leaderboard.length} טפסים
            </div>
          </div>

          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <button
                key={entry.formId}
                onClick={() => setSelectedForm(entry.formId)}
                className="w-full bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3 hover:bg-gray-50 transition text-right"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0
                      ? 'bg-yellow-100 text-yellow-700'
                      : index === 1
                      ? 'bg-gray-100 text-gray-600'
                      : index === 2
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-50 text-gray-500'
                  }`}
                >
                  {index + 1}
                </div>

                <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                  {entry.formName.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-800 truncate">
                    {entry.formName}
                    {entry.userId === user?.id && (
                      <span className="text-xs text-primary mr-1">(שלי)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {entry.userName} • {entry.exactScoreCount} מדויקים • {entry.outcomeCount} הכרעות
                  </div>
                </div>

                <div className="text-left">
                  <div className="text-lg font-bold text-primary">
                    {entry.totalPoints}
                  </div>
                  <div className="text-xs text-gray-400">נק׳</div>
                </div>
              </button>
            ))}

            {leaderboard.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">🏟️</div>
                <p>אין ניחושים עדיין. היה הראשון!</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
