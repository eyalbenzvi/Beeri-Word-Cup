import { useState } from 'react';
import {
  useCurrentUser, useMatchResults, useAllPredictions,
  useUsers, useActualAdvancing, useActualBonuses,
} from '../hooks/useStore';
import { calculateFullScore, compareTiebreaker, calculateMatchPoints } from '../utils/scoring';
import { generateGroupMatches, generateKnockoutMatches, STAGES } from '../data/matches';
import { getTeamByCode } from '../data/teams';
import { calcBracketTeams, deriveAdvancingTeams, deriveChampion } from '../utils/bracket';
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
  const actualAdvancing = useActualAdvancing();
  const actualBonuses = useActualBonuses();
  const [selectedUser, setSelectedUser] = useState(null);

  // Calculate scores for all users (derive advancing & champion from bracket)
  const leaderboard = Object.entries(allPredictions)
    .map(([userId, predData]) => {
      const matchPreds = predData.matches || {};
      const bracket = calcBracketTeams(matchPreds);
      const derivedAdvancing = deriveAdvancingTeams(bracket);
      const derivedChampion = deriveChampion(matchPreds, bracket);
      const enrichedPredData = {
        ...predData,
        advancing: derivedAdvancing,
        champion: derivedChampion,
      };
      const score = calculateFullScore(enrichedPredData, results, actualAdvancing, actualBonuses);
      const userInfo = users[userId] || {};
      return {
        userId,
        displayName: userInfo.formName || userInfo.displayName || userId,
        ...score,
      };
    })
    .sort((a, b) => {
      // Sort by total points first, then tiebreaker
      if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
      return compareTiebreaker(a, b);
    });

  // Detailed view for selected user
  const renderUserDetail = () => {
    if (!selectedUser) return null;

    const predData = allPredictions[selectedUser] || {};
    const matchPreds = predData.matches || {};
    const bracket = calcBracketTeams(matchPreds);
    const derivedAdvancing = deriveAdvancingTeams(bracket);
    const derivedChampion = deriveChampion(matchPreds, bracket);
    const enrichedPredData = { ...predData, advancing: derivedAdvancing, champion: derivedChampion };
    const score = calculateFullScore(enrichedPredData, results, actualAdvancing, actualBonuses);
    const playedMatches = Object.keys(results);

    // Compute bracket from actual results for knockout team names
    const resultsBracket = calcBracketTeams(results);

    const matchesByStage = {};
    for (const matchId of playedMatches) {
      const match = allMatchesMap[matchId];
      const result = results[matchId];
      const stage = result.stage || match?.stage || 'group';
      if (!matchesByStage[stage]) matchesByStage[stage] = [];
      matchesByStage[stage].push({ matchId, match, result });
    }

    return (
      <div className="mt-4">
        <button
          onClick={() => setSelectedUser(null)}
          className="text-sm text-primary mb-3 flex items-center gap-1"
        >
          ← Back to leaderboard
        </button>

        <h2 className="text-lg font-bold text-primary mb-1">
          {users[selectedUser]?.formName || users[selectedUser]?.displayName || selectedUser}
        </h2>

        {/* Score breakdown */}
        <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-primary">{score.totalPoints}</div>
            <div className="text-gray-500">Total Points</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-green-600">{score.exactScoreCount}</div>
            <div className="text-gray-500">Exact Scores</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold text-blue-600">{score.outcomeCount}</div>
            <div className="text-gray-500">Correct Outcomes</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-lg font-bold">
              {score.correctChampion ? '✅' : '❌'}
            </div>
            <div className="text-gray-500">Champion</div>
          </div>
        </div>

        {/* Bonus predictions */}
        <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100 text-sm">
          <div className="flex justify-between py-1 border-b border-gray-50">
            <span className="text-gray-600">Champion pick:</span>
            <span className="font-medium">
              {derivedChampion ? (getTeamByCode(derivedChampion)?.flag + ' ' + getTeamByCode(derivedChampion)?.name) : 'None'}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-600">Top scorer pick:</span>
            <span className="font-medium">{predData.topScorer || 'None'}</span>
          </div>
        </div>

        {/* Match-by-match results */}
        {Object.entries(matchesByStage).map(([stage, matches]) => (
          <div key={stage} className="mb-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              {STAGES[stage] || stage}
            </h3>
            {matches.map(({ matchId, match, result }) => {
              const prediction = predData.matches?.[matchId];
              const pts = calculateMatchPoints(prediction, result, stage);
              // For knockout, derive real team names from actual results bracket
              const derivedMatch = match?.stage !== 'group' && resultsBracket[matchId]
                ? { ...match, homeTeam: resultsBracket[matchId].home, awayTeam: resultsBracket[matchId].away }
                : match || { homeTeam: result.homeTeam, awayTeam: result.awayTeam };
              return (
                <MatchCard
                  key={matchId}
                  match={derivedMatch}
                  prediction={prediction}
                  actualResult={result}
                  showPoints
                  points={pts}
                />
              );
            })}
          </div>
        ))}

        {playedMatches.length === 0 && (
          <p className="text-center text-gray-400 py-8">
            No matches have been played yet
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">🏆 Leaderboard</h1>

      {selectedUser ? (
        renderUserDetail()
      ) : (
        <>
          <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100">
            <div className="text-xs text-gray-500 text-center">
              {Object.keys(results).length} matches played •{' '}
              {leaderboard.length} players
            </div>
          </div>

          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <button
                key={entry.userId}
                onClick={() => setSelectedUser(entry.userId)}
                className="w-full bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3 hover:bg-gray-50 transition text-left"
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
                  {entry.displayName.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-800 truncate">
                    {entry.displayName}
                    {entry.userId === user?.id && (
                      <span className="text-xs text-primary ml-1">(You)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {entry.exactScoreCount} exact • {entry.outcomeCount} correct
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold text-primary">
                    {entry.totalPoints}
                  </div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </button>
            ))}

            {leaderboard.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">🏟️</div>
                <p>No predictions yet. Be the first!</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
