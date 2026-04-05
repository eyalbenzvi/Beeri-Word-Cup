import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  useMatchResults,
  useAllPredictions,
  useAllUsers,
  useTournamentSettings,
  saveMatchResult,
  updateTournamentSettings,
} from '../hooks/useFirestore';
import { generateGroupMatches, generateKnockoutMatches, STAGES } from '../data/matches';
import { GROUPS, getTeamByCode } from '../data/teams';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();

export default function Admin() {
  const { userProfile } = useAuth();
  const { results } = useMatchResults();
  const { allPredictions } = useAllPredictions();
  const { users } = useAllUsers();
  const { settings } = useTournamentSettings();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [editingMatch, setEditingMatch] = useState(null);
  const [editScores, setEditScores] = useState({ homeScore: '', awayScore: '' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('results'); // 'results' | 'settings' | 'users'

  if (!userProfile?.isAdmin) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-lg font-bold text-gray-700">Admin Access Required</h2>
        <p className="text-gray-500 text-sm mt-2">
          You don't have admin permissions.
        </p>
      </div>
    );
  }

  const filteredMatches =
    selectedStage === 'group'
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

  const handleSaveResult = async (match) => {
    if (editScores.homeScore === '' || editScores.awayScore === '') return;
    setSaving(true);
    try {
      await saveMatchResult(match.id, {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: parseInt(editScores.homeScore),
        awayScore: parseInt(editScores.awayScore),
        stage: match.stage || 'group',
        group: match.group || null,
        played: true,
      });
      setEditingMatch(null);
      setEditScores({ homeScore: '', awayScore: '' });
    } catch (err) {
      console.error('Failed to save result:', err);
    }
    setSaving(false);
  };

  const toggleLock = async () => {
    await updateTournamentSettings({
      predictionsLocked: !settings.predictionsLocked,
    });
  };

  const renderResultsTab = () => (
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
        {filteredMatches.map((match) => {
          const homeTeam = getTeamByCode(match.homeTeam);
          const awayTeam = getTeamByCode(match.awayTeam);
          const result = results[match.id];
          const isEditing = editingMatch === match.id;

          return (
            <div
              key={match.id}
              className={`bg-white rounded-xl p-3 border ${
                result ? 'border-green-200 bg-green-50/30' : 'border-gray-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span>{homeTeam?.flag || '🏳️'}</span>
                    <span className="font-medium">
                      {homeTeam?.name || match.homeTeam || 'TBD'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <span>{awayTeam?.flag || '🏳️'}</span>
                    <span className="font-medium">
                      {awayTeam?.name || match.awayTeam || 'TBD'}
                    </span>
                  </div>
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <input
                        type="number"
                        min="0"
                        value={editScores.homeScore}
                        onChange={(e) =>
                          setEditScores((s) => ({ ...s, homeScore: e.target.value }))
                        }
                        className="w-12 h-8 text-center border rounded text-sm"
                        placeholder="0"
                      />
                      <input
                        type="number"
                        min="0"
                        value={editScores.awayScore}
                        onChange={(e) =>
                          setEditScores((s) => ({ ...s, awayScore: e.target.value }))
                        }
                        className="w-12 h-8 text-center border rounded text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleSaveResult(match)}
                        disabled={saving}
                        className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 disabled:opacity-50"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingMatch(null)}
                        className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {result ? (
                      <span className="font-bold text-primary text-lg">
                        {result.homeScore} - {result.awayScore}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">Not played</span>
                    )}
                    <button
                      onClick={() => {
                        setEditingMatch(match.id);
                        setEditScores({
                          homeScore: result?.homeScore ?? '',
                          awayScore: result?.awayScore ?? '',
                        });
                      }}
                      className="text-xs bg-primary text-white px-2 py-1.5 rounded hover:bg-primary-light"
                    >
                      {result ? 'Edit' : 'Enter'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const renderSettingsTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">Tournament Controls</h3>

        <div className="flex items-center justify-between py-3 border-b border-gray-50">
          <div>
            <div className="text-sm font-medium">Lock Predictions</div>
            <div className="text-xs text-gray-400">
              Prevent users from changing predictions
            </div>
          </div>
          <button
            onClick={toggleLock}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.predictionsLocked ? 'bg-red-400' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                settings.predictionsLocked ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-2">Stats</h3>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(users).length}
            </div>
            <div className="text-xs text-gray-500">Players</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(results).length}
            </div>
            <div className="text-xs text-gray-500">Results Entered</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">
              {Object.keys(allPredictions).length}
            </div>
            <div className="text-xs text-gray-500">Predictions</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">
              {groupMatches.length + knockoutMatches.length}
            </div>
            <div className="text-xs text-gray-500">Total Matches</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderUsersTab = () => (
    <div className="space-y-2">
      {Object.entries(users).map(([uid, u]) => {
        const predCount = Object.keys(allPredictions[uid]?.matches || {}).length;
        return (
          <div
            key={uid}
            className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3"
          >
            {u.photoURL ? (
              <img src={u.photoURL} alt="" className="w-9 h-9 rounded-full" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                {(u.displayName || '?').charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.displayName}</div>
              <div className="text-xs text-gray-400">{u.email}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-primary">{predCount}</div>
              <div className="text-xs text-gray-400">predictions</div>
            </div>
            {u.isAdmin && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Admin
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">⚙️ Admin Panel</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[
          { id: 'results', label: 'Results' },
          { id: 'settings', label: 'Settings' },
          { id: 'users', label: 'Users' },
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

      {activeTab === 'results' && renderResultsTab()}
      {activeTab === 'settings' && renderSettingsTab()}
      {activeTab === 'users' && renderUsersTab()}
    </div>
  );
}
