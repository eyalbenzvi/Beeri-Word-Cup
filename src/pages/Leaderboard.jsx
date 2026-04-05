import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  useMatchResults,
  useAllPredictions,
  useAllUsers,
} from '../hooks/useFirestore';
import { calculateMatchPoints } from '../utils/scoring';
import { generateGroupMatches, generateKnockoutMatches, STAGES } from '../data/matches';
import { getTeamByCode } from '../data/teams';
import MatchCard from '../components/MatchCard';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();
const allMatchesMap = Object.fromEntries(
  [...groupMatches, ...knockoutMatches].map((m) => [m.id, m])
);

export default function Leaderboard() {
  const { user } = useAuth();
  const { results, loading: resultsLoading } = useMatchResults();
  const { allPredictions, loading: predictionsLoading } = useAllPredictions();
  const { users, loading: usersLoading } = useAllUsers();
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);

  if (resultsLoading || predictionsLoading || usersLoading) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl animate-spin">⚽</div>
        <p className="text-gray-500 mt-2">Loading leaderboard...</p>
      </div>
    );
  }

  // Calculate scores for all users
  const leaderboard = Object.entries(allPredictions)
    .map(([userId, predData]) => {
      const userPredictions = predData.matches || {};
      let totalPoints = 0;
      let exactScores = 0;
      let correctOutcomes = 0;

      for (const [matchId, result] of Object.entries(results)) {
        const prediction = userPredictions[matchId];
        const match = allMatchesMap[matchId];
        const stage = result.stage || match?.stage || 'group';
        const pts = calculateMatchPoints(prediction, result, stage);

        totalPoints += pts.points;
        if (pts.breakdown === 'Exact score!') exactScores++;
        if (pts.points > 0) correctOutcomes++;
      }

      const userInfo = users[userId] || {};
      return {
        userId,
        displayName: userInfo.displayName || 'Unknown',
        photoURL: userInfo.photoURL,
        totalPoints,
        exactScores,
        correctOutcomes,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Detailed view for selected user
  const renderUserDetail = () => {
    if (!selectedUser) return null;

    const userPredictions = allPredictions[selectedUser]?.matches || {};
    const playedMatches = Object.keys(results);

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

        <h2 className="text-lg font-bold text-primary mb-3">
          {users[selectedUser]?.displayName}'s Results
        </h2>

        {Object.entries(matchesByStage).map(([stage, matches]) => (
          <div key={stage} className="mb-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              {STAGES[stage] || stage}
            </h3>
            {matches.map(({ matchId, match, result }) => {
              const prediction = userPredictions[matchId];
              const pts = calculateMatchPoints(prediction, result, stage);
              return (
                <MatchCard
                  key={matchId}
                  match={match || { homeTeam: result.homeTeam, awayTeam: result.awayTeam }}
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
          {/* Stats summary */}
          <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100">
            <div className="text-xs text-gray-500 text-center">
              {Object.keys(results).length} matches played •{' '}
              {leaderboard.length} players
            </div>
          </div>

          {/* Leaderboard Table */}
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <button
                key={entry.userId}
                onClick={() => setSelectedUser(entry.userId)}
                className="w-full bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3 hover:bg-gray-50 transition text-left"
              >
                {/* Rank */}
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

                {/* Avatar */}
                {entry.photoURL ? (
                  <img
                    src={entry.photoURL}
                    alt=""
                    className="w-9 h-9 rounded-full"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                    {entry.displayName.charAt(0)}
                  </div>
                )}

                {/* Name & Stats */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-800 truncate">
                    {entry.displayName}
                    {entry.userId === user?.uid && (
                      <span className="text-xs text-primary ml-1">(You)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {entry.exactScores} exact • {entry.correctOutcomes} correct
                  </div>
                </div>

                {/* Points */}
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
