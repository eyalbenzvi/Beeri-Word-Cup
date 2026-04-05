import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser, useUserPredictions, useSettings } from '../hooks/useStore';
import { savePrediction } from '../store';
import { generateGroupMatches, generateKnockoutMatches } from '../data/matches';
import { GROUPS } from '../data/teams';
import MatchCard from '../components/MatchCard';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();

export default function Predict() {
  const { user } = useCurrentUser();
  const predictions = useUserPredictions(user?.id);
  const settings = useSettings();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');

  const handlePredictionChange = useCallback(
    (matchId, prediction) => {
      if (!user || settings.predictionsLocked) return;
      savePrediction(user.id, matchId, prediction);
    },
    [user, settings.predictionsLocked]
  );

  if (!user) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-gray-700 mb-2">Join the Game First</h2>
        <p className="text-gray-500 mb-4">You need to pick your name to make predictions</p>
        <Link
          to="/login"
          className="inline-block bg-primary text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-light transition no-underline"
        >
          Join Game
        </Link>
      </div>
    );
  }

  // Filter matches for current view
  const filteredMatches =
    selectedStage === 'group'
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

  // Count predictions
  const predictedGroupMatches = groupMatches.filter(
    (m) => predictions[m.id]?.homeScore !== undefined && predictions[m.id]?.homeScore !== null
  ).length;
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
          <span>Group: {predictedGroupMatches}/{groupMatches.length}</span>
          <span>Knockout: {predictedKnockout}/{knockoutMatches.length}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-primary rounded-full h-2 transition-all"
            style={{
              width: `${((predictedGroupMatches + predictedKnockout) / (groupMatches.length + knockoutMatches.length)) * 100}%`,
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
          <MatchCard
            key={match.id}
            match={match}
            prediction={predictions[match.id]}
            editable={!settings.predictionsLocked}
            onPredictionChange={(pred) => handlePredictionChange(match.id, pred)}
          />
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
