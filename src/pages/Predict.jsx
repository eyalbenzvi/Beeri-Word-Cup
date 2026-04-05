import { useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  useUserPredictions,
  useTournamentSettings,
  savePrediction,
} from '../hooks/useFirestore';
import { generateGroupMatches, generateKnockoutMatches, STAGES } from '../data/matches';
import { GROUPS } from '../data/teams';
import MatchCard from '../components/MatchCard';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();
const allMatches = [...groupMatches, ...knockoutMatches];

export default function Predict() {
  const { user, login } = useAuth();
  const { predictions, loading } = useUserPredictions(user?.uid);
  const { settings } = useTournamentSettings();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [saving, setSaving] = useState({});

  const handlePredictionChange = useCallback(
    async (matchId, prediction) => {
      if (!user || settings.predictionsLocked) return;

      // Optimistic - save immediately
      setSaving((prev) => ({ ...prev, [matchId]: true }));
      try {
        await savePrediction(user.uid, matchId, prediction);
      } catch (err) {
        console.error('Failed to save prediction:', err);
      }
      setSaving((prev) => ({ ...prev, [matchId]: false }));
    },
    [user, settings.predictionsLocked]
  );

  if (!user) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-gray-700 mb-2">Sign In Required</h2>
        <p className="text-gray-500 mb-4">You need to sign in to make predictions</p>
        <button
          onClick={login}
          className="bg-primary text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-light transition"
        >
          Sign In with Google
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl animate-spin">⚽</div>
        <p className="text-gray-500 mt-2">Loading predictions...</p>
      </div>
    );
  }

  // Filter matches for current view
  const filteredMatches =
    selectedStage === 'group'
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

  // Count predictions
  const totalGroupMatches = groupMatches.length;
  const predictedGroupMatches = groupMatches.filter(
    (m) => predictions[m.id]?.homeScore !== undefined && predictions[m.id]?.homeScore !== null
  ).length;
  const totalKnockout = knockoutMatches.length;
  const predictedKnockout = knockoutMatches.filter(
    (m) => predictions[m.id]?.homeScore !== undefined && predictions[m.id]?.homeScore !== null
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-primary">Your Predictions</h1>
        {settings.predictionsLocked && (
          <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">
            🔒 Locked
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Group: {predictedGroupMatches}/{totalGroupMatches}</span>
          <span>Knockout: {predictedKnockout}/{totalKnockout}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-primary rounded-full h-2 transition-all"
            style={{
              width: `${((predictedGroupMatches + predictedKnockout) / (totalGroupMatches + totalKnockout)) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Stage Selector */}
      <StageSelector selectedStage={selectedStage} onSelect={setSelectedStage} />

      {/* Group Selector (only for group stage) */}
      {selectedStage === 'group' && (
        <GroupSelector
          groups={Object.keys(GROUPS)}
          selectedGroup={selectedGroup}
          onSelect={setSelectedGroup}
        />
      )}

      {/* Match Cards */}
      <div className="space-y-2">
        {filteredMatches.map((match) => (
          <div key={match.id} className="relative">
            <MatchCard
              match={match}
              prediction={predictions[match.id]}
              editable={!settings.predictionsLocked}
              onPredictionChange={(pred) => handlePredictionChange(match.id, pred)}
            />
            {saving[match.id] && (
              <div className="absolute top-2 right-2">
                <span className="text-xs text-primary animate-pulse">Saving...</span>
              </div>
            )}
          </div>
        ))}

        {filteredMatches.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p>No matches in this stage yet</p>
            {selectedStage !== 'group' && (
              <p className="text-xs mt-1">
                Knockout teams will be determined after the group stage
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
