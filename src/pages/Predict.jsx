import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser, useFullUserPredictions, useSettings } from '../hooks/useStore';
import { savePrediction, saveAdvancingPrediction, saveBonusPrediction, submitPredictions } from '../store';
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
  const [activeTab, setActiveTab] = useState('matches');
  const [showConfirm, setShowConfirm] = useState(false);

  const status = predictions.status || 'draft';
  // User can edit only when status is 'draft' and predictions aren't globally locked
  const canEdit = status === 'draft' && !settings.predictionsLocked;

  const handlePredictionChange = useCallback(
    (matchId, prediction) => {
      if (!user || !canEdit) return;
      savePrediction(user.id, matchId, prediction);
    },
    [user, canEdit]
  );

  const handleSubmit = () => {
    if (!user) return;
    submitPredictions(user.id);
    setShowConfirm(false);
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-gray-700 mb-2">Join the Game First</h2>
        <p className="text-gray-500 mb-4">You need to pick your name to make predictions</p>
        <Link to="/login" className="inline-block bg-primary text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-light transition no-underline">
          Join Game
        </Link>
      </div>
    );
  }

  const matchPredictions = predictions.matches || {};

  // Count progress
  const predictedGroupMatches = groupMatches.filter(
    (m) => matchPredictions[m.id]?.homeScore !== undefined && matchPredictions[m.id]?.homeScore !== null
  ).length;
  const predictedKnockout = knockoutMatches.filter(
    (m) => matchPredictions[m.id]?.homeScore !== undefined && matchPredictions[m.id]?.homeScore !== null
  ).length;

  const filteredMatches =
    selectedStage === 'group'
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

  // Status banner
  const renderStatusBanner = () => {
    if (status === 'pending') {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-center">
          <div className="text-2xl mb-1">⏳</div>
          <div className="text-sm font-semibold text-yellow-700">Submitted — Waiting for Admin Approval</div>
          <div className="text-xs text-yellow-600 mt-1">
            Your predictions are locked until the admin reviews them.
          </div>
        </div>
      );
    }
    if (status === 'approved') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
          <div className="text-2xl mb-1">✅</div>
          <div className="text-sm font-semibold text-green-700">Approved by Admin</div>
          <div className="text-xs text-green-600 mt-1">
            Your predictions are locked and will be scored when matches are played.
          </div>
        </div>
      );
    }
    if (predictions.rejectedAt) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-center">
          <div className="text-xs text-red-600">
            Your previous submission was sent back by the admin. Please review and resubmit.
          </div>
        </div>
      );
    }
    return null;
  };

  // Submit confirmation dialog
  const renderConfirmDialog = () => {
    if (!showConfirm) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
          <div className="text-3xl text-center mb-3">📋</div>
          <h3 className="text-lg font-bold text-center text-primary mb-2">Submit Predictions?</h3>
          <p className="text-sm text-gray-600 text-center mb-4">
            Once you submit, you won't be able to make changes until the admin reviews your predictions.
          </p>
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 mb-4">
            <div>Matches predicted: {predictedGroupMatches + predictedKnockout} / {groupMatches.length + knockoutMatches.length}</div>
            <div>Champion: {predictions.champion ? ALL_TEAMS.find(t => t.code === predictions.champion)?.name : 'Not selected'}</div>
            <div>Top Scorer: {predictions.topScorer || 'Not entered'}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-light transition"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMatchesTab = () => (
    <>
      <StageSelector selectedStage={selectedStage} onSelect={setSelectedStage} />
      {selectedStage === 'group' && (
        <GroupSelector groups={Object.keys(GROUPS)} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
      )}
      <div className="space-y-2">
        {filteredMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            prediction={matchPredictions[match.id]}
            editable={canEdit}
            onPredictionChange={(pred) => handlePredictionChange(match.id, pred)}
          />
        ))}
        {filteredMatches.length === 0 && (
          <div className="text-center py-8 text-gray-400"><p>No matches in this stage yet</p></div>
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
            return (
              <div key={round.id} className="bg-white rounded-xl p-4 border border-gray-100">
                <h3 className="font-bold text-sm text-primary mb-1">{round.label}</h3>
                <p className="text-xs text-gray-400 mb-3">{round.description}</p>
                {Object.entries(GROUPS).map(([groupName, teams]) => (
                  <div key={groupName} className="mb-3">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Group {groupName}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {teams.map((team) => {
                        const isSelected = selected.includes(team.code);
                        return (
                          <button key={team.code} disabled={!canEdit}
                            onClick={() => {
                              const newSelected = isSelected
                                ? selected.filter(t => t !== team.code)
                                : [...selected, team.code];
                              saveAdvancingPrediction(user.id, round.id, newSelected);
                            }}
                            className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                              isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            } ${!canEdit ? 'opacity-60' : ''}`}>
                            {team.flag} {team.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="text-xs text-gray-400 mt-1">Selected: {selected.length}/{round.count}</div>
              </div>
            );
          }

          return (
            <div key={round.id} className="bg-white rounded-xl p-4 border border-gray-100">
              <h3 className="font-bold text-sm text-primary mb-1">{round.label}</h3>
              <p className="text-xs text-gray-400 mb-2">{round.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TEAMS.map((team) => {
                  const isSelected = selected.includes(team.code);
                  return (
                    <button key={team.code} disabled={!canEdit}
                      onClick={() => {
                        const newSelected = isSelected
                          ? selected.filter(t => t !== team.code)
                          : selected.length < round.count ? [...selected, team.code] : selected;
                        saveAdvancingPrediction(user.id, round.id, newSelected);
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                        isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } ${!canEdit ? 'opacity-60' : ''}`}>
                      {team.flag} {team.name}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-gray-400 mt-2">Selected: {selected.length}/{round.count}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBonusesTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-1">🏆 Champion (9 pts)</h3>
        <p className="text-xs text-gray-400 mb-3">Which team will win the World Cup?</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TEAMS.map((team) => (
            <button key={team.code} disabled={!canEdit}
              onClick={() => saveBonusPrediction(user.id, 'champion', team.code)}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                predictions.champion === team.code ? 'bg-yellow-400 text-yellow-900 font-bold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!canEdit ? 'opacity-60' : ''}`}>
              {team.flag} {team.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-1">⚽ Top Scorer (8 pts)</h3>
        <p className="text-xs text-gray-400 mb-3">Who will be the Golden Boot winner? Penalty shootout goals don't count.</p>
        <input type="text" value={predictions.topScorer || ''} disabled={!canEdit}
          onChange={(e) => saveBonusPrediction(user.id, 'topScorer', e.target.value)}
          placeholder="Enter player name..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? 'opacity-60 bg-gray-50' : ''}`} />
      </div>

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
            {[
              ['Group', 1, 3, 2], ['Round of 32', 3, 3, 4], ['Round of 16', 3, 3, 4],
              ['Quarter-Final', 5, 3, 6], ['Semi-Final', 7, 3, 8],
              ['3rd Place', 7, 3, '-'], ['Final', 9, 3, '-'],
            ].map(([stage, o, e, a]) => (
              <tr key={stage} className="border-b border-gray-50">
                <td className="py-1.5">{stage}</td>
                <td className="text-center">{o}</td>
                <td className="text-center">+{e}</td>
                <td className="text-center">{a}</td>
              </tr>
            ))}
            <tr className="border-b border-gray-50"><td className="py-1.5 font-semibold">Champion</td><td colSpan="3" className="text-center">9</td></tr>
            <tr><td className="py-1.5 font-semibold">Top Scorer</td><td colSpan="3" className="text-center">8</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">Knockout scores based on 90-minute result only.</p>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-primary">Your Predictions</h1>
        {status === 'pending' && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">⏳ Pending</span>
        )}
        {status === 'approved' && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">✅ Approved</span>
        )}
        {settings.predictionsLocked && status === 'draft' && (
          <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">🔒 Locked</span>
        )}
      </div>

      {renderStatusBanner()}

      {/* Progress */}
      <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Group: {predictedGroupMatches}/{groupMatches.length}</span>
          <span>Knockout: {predictedKnockout}/{knockoutMatches.length}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${((predictedGroupMatches + predictedKnockout) / (groupMatches.length + knockoutMatches.length)) * 100}%` }} />
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[
          { id: 'matches', label: 'Matches' },
          { id: 'advancing', label: 'Advancing' },
          { id: 'bonuses', label: 'Bonuses' },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'matches' && renderMatchesTab()}
      {activeTab === 'advancing' && renderAdvancingTab()}
      {activeTab === 'bonuses' && renderBonusesTab()}

      {/* Submit Button — only show when draft */}
      {status === 'draft' && !settings.predictionsLocked && (
        <div className="sticky bottom-16 mt-6 pb-2">
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full bg-green-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-green-600 active:bg-green-700 transition text-base"
          >
            Submit Predictions for Approval
          </button>
        </div>
      )}

      {renderConfirmDialog()}
    </div>
  );
}
