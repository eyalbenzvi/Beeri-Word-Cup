import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser, useFullUserPredictions, useSettings } from '../hooks/useStore';
import { savePrediction, saveAdvancingPrediction, saveBonusPrediction } from '../store';
import { generateGroupMatches, generateKnockoutMatches } from '../data/matches';
import { GROUPS, ALL_TEAMS } from '../data/teams';
import MatchCard from '../components/MatchCard';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();

export default function Predict() {
  const { user } = useCurrentUser();
  const predictions = useFullUserPredictions(user?.id);
  const settings = useSettings();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [activeTab, setActiveTab] = useState('matches'); // 'matches' | 'advancing' | 'bonuses'

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

  const locked = settings.predictionsLocked;
  const matchPredictions = predictions.matches || {};

  // Count progress
  const predictedGroupMatches = groupMatches.filter(
    (m) => matchPredictions[m.id]?.homeScore !== undefined && matchPredictions[m.id]?.homeScore !== null
  ).length;
  const predictedKnockout = knockoutMatches.filter(
    (m) => matchPredictions[m.id]?.homeScore !== undefined && matchPredictions[m.id]?.homeScore !== null
  ).length;

  // Filter matches for current view
  const filteredMatches =
    selectedStage === 'group'
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

  const renderMatchesTab = () => (
    <>
      <StageSelector selectedStage={selectedStage} onSelect={setSelectedStage} />

      {selectedStage === 'group' && (
        <GroupSelector
          groups={Object.keys(GROUPS)}
          selectedGroup={selectedGroup}
          onSelect={setSelectedGroup}
        />
      )}

      <div className="space-y-2">
        {filteredMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            prediction={matchPredictions[match.id]}
            editable={!locked}
            onPredictionChange={(pred) => handlePredictionChange(match.id, pred)}
          />
        ))}

        {filteredMatches.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p>No matches in this stage yet</p>
          </div>
        )}
      </div>
    </>
  );

  const renderAdvancingTab = () => {
    const advancing = predictions.advancing || {};
    const rounds = [
      { id: 'R32', label: 'Advancing to Round of 32', count: 32, description: 'Top 2 from each group + 8 best 3rd place', source: 'groups' },
      { id: 'R16', label: 'Advancing to Round of 16', count: 16, description: 'Winners of Round of 32' },
      { id: 'QF', label: 'Advancing to Quarter-Finals', count: 8, description: 'Winners of Round of 16' },
      { id: 'SF', label: 'Advancing to Semi-Finals', count: 4, description: 'Winners of Quarter-Finals' },
      { id: 'F', label: 'Advancing to Final', count: 2, description: 'Winners of Semi-Finals' },
    ];

    return (
      <div className="space-y-4">
        {rounds.map((round) => {
          const selected = advancing[round.id] || [];

          if (round.source === 'groups') {
            // For R32: pick per group
            return (
              <div key={round.id} className="bg-white rounded-xl p-4 border border-gray-100">
                <h3 className="font-bold text-sm text-primary mb-1">{round.label}</h3>
                <p className="text-xs text-gray-400 mb-3">{round.description}</p>

                {Object.entries(GROUPS).map(([groupName, teams]) => {
                  const groupSelected = selected.filter(t => teams.some(team => team.code === t));
                  return (
                    <div key={groupName} className="mb-3">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Group {groupName}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {teams.map((team) => {
                          const isSelected = selected.includes(team.code);
                          return (
                            <button
                              key={team.code}
                              disabled={locked}
                              onClick={() => {
                                let newSelected;
                                if (isSelected) {
                                  newSelected = selected.filter(t => t !== team.code);
                                } else {
                                  newSelected = [...selected, team.code];
                                }
                                saveAdvancingPrediction(user.id, round.id, newSelected);
                              }}
                              className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                                isSelected
                                  ? 'bg-primary text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              } ${locked ? 'opacity-60' : ''}`}
                            >
                              {team.flag} {team.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div className="text-xs text-gray-400 mt-1">
                  Selected: {selected.length}/{round.count}
                </div>
              </div>
            );
          }

          // For knockout rounds: pick from all 48 teams
          return (
            <div key={round.id} className="bg-white rounded-xl p-4 border border-gray-100">
              <h3 className="font-bold text-sm text-primary mb-1">{round.label}</h3>
              <p className="text-xs text-gray-400 mb-2">{round.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TEAMS.map((team) => {
                  const isSelected = selected.includes(team.code);
                  return (
                    <button
                      key={team.code}
                      disabled={locked}
                      onClick={() => {
                        let newSelected;
                        if (isSelected) {
                          newSelected = selected.filter(t => t !== team.code);
                        } else if (selected.length < round.count) {
                          newSelected = [...selected, team.code];
                        } else {
                          return; // max reached
                        }
                        saveAdvancingPrediction(user.id, round.id, newSelected);
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                        isSelected
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } ${locked ? 'opacity-60' : ''}`}
                    >
                      {team.flag} {team.name}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Selected: {selected.length}/{round.count}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBonusesTab = () => (
    <div className="space-y-4">
      {/* Champion */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-1">🏆 Champion (9 pts)</h3>
        <p className="text-xs text-gray-400 mb-3">Which team will win the World Cup?</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TEAMS.map((team) => (
            <button
              key={team.code}
              disabled={locked}
              onClick={() => saveBonusPrediction(user.id, 'champion', team.code)}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                predictions.champion === team.code
                  ? 'bg-yellow-400 text-yellow-900 font-bold'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${locked ? 'opacity-60' : ''}`}
            >
              {team.flag} {team.name}
            </button>
          ))}
        </div>
      </div>

      {/* Top Scorer */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-1">⚽ Top Scorer (8 pts)</h3>
        <p className="text-xs text-gray-400 mb-3">
          Who will be the Golden Boot winner? Penalty shootout goals don't count.
        </p>
        <input
          type="text"
          value={predictions.topScorer || ''}
          disabled={locked}
          onChange={(e) => saveBonusPrediction(user.id, 'topScorer', e.target.value)}
          placeholder="Enter player name..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${locked ? 'opacity-60 bg-gray-50' : ''}`}
        />
      </div>

      {/* Scoring Rules Summary */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-2">Scoring Rules</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-100">
              <th className="text-left py-1.5">Stage</th>
              <th className="text-center py-1.5">Outcome</th>
              <th className="text-center py-1.5">+Exact</th>
              <th className="text-center py-1.5">Advance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">Group</td>
              <td className="text-center">1</td>
              <td className="text-center">+3</td>
              <td className="text-center">2</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">Round of 32</td>
              <td className="text-center">3</td>
              <td className="text-center">+3</td>
              <td className="text-center">4</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">Quarter-Final</td>
              <td className="text-center">5</td>
              <td className="text-center">+3</td>
              <td className="text-center">6</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">Semi-Final</td>
              <td className="text-center">7</td>
              <td className="text-center">+3</td>
              <td className="text-center">8</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">3rd Place</td>
              <td className="text-center">7</td>
              <td className="text-center">+3</td>
              <td className="text-center">-</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">Final</td>
              <td className="text-center">9</td>
              <td className="text-center">+3</td>
              <td className="text-center">-</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5 font-semibold">Champion</td>
              <td colSpan="3" className="text-center">9</td>
            </tr>
            <tr>
              <td className="py-1.5 font-semibold">Top Scorer</td>
              <td colSpan="3" className="text-center">8</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">
          Knockout scores based on 90-minute result only.
        </p>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-primary">Your Predictions</h1>
        {locked && (
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

      {/* Main Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[
          { id: 'matches', label: 'Matches' },
          { id: 'advancing', label: 'Advancing' },
          { id: 'bonuses', label: 'Bonuses' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              activeTab === tab.id
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'matches' && renderMatchesTab()}
      {activeTab === 'advancing' && renderAdvancingTab()}
      {activeTab === 'bonuses' && renderBonusesTab()}
    </div>
  );
}
