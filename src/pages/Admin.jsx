import { useState, useRef } from 'react';
import {
  useCurrentUser, useMatchResults, useAllPredictions, useUsers,
  useSettings, useActualAdvancing, useActualBonuses,
} from '../hooks/useStore';
import {
  saveMatchResult, updateSettings, exportAllData, importAllData,
  saveActualAdvancing, saveActualBonuses,
} from '../store';
import { generateGroupMatches, generateKnockoutMatches } from '../data/matches';
import { GROUPS, ALL_TEAMS, getTeamByCode } from '../data/teams';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();

export default function Admin() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const settings = useSettings();
  const actualAdvancing = useActualAdvancing();
  const actualBonuses = useActualBonuses();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [editingMatch, setEditingMatch] = useState(null);
  const [editScores, setEditScores] = useState({ homeScore: '', awayScore: '' });
  const [activeTab, setActiveTab] = useState('results');
  const [adminPin, setAdminPin] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [topScorerInput, setTopScorerInput] = useState('');
  const fileInputRef = useRef(null);

  if (!user?.isAdmin) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-lg font-bold text-gray-700">Admin Access Required</h2>
        <p className="text-gray-500 text-sm mt-2">The first player to join becomes admin.</p>
      </div>
    );
  }

  if (!pinVerified && activeTab === 'settings') {
    const currentPin = settings.adminPin || '1234';
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔑</div>
        <h2 className="text-lg font-bold text-gray-700 mb-4">Enter Admin PIN</h2>
        <p className="text-xs text-gray-400 mb-3">Default PIN: 1234</p>
        <form onSubmit={(e) => { e.preventDefault(); if (adminPin === currentPin) setPinVerified(true); }}>
          <input type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)}
            placeholder="PIN" className="w-32 px-4 py-2 border-2 border-gray-200 rounded-xl text-center text-lg tracking-widest focus:border-primary focus:outline-none mb-3" autoFocus />
          <br />
          <button type="submit" className="bg-primary text-white font-semibold px-6 py-2 rounded-xl hover:bg-primary-light transition">Verify</button>
        </form>
        <button onClick={() => setActiveTab('results')} className="mt-3 text-sm text-gray-400 hover:text-primary">← Back</button>
      </div>
    );
  }

  const filteredMatches = selectedStage === 'group'
    ? groupMatches.filter((m) => m.group === selectedGroup)
    : knockoutMatches.filter((m) => m.stage === selectedStage);

  const handleSaveResult = (match) => {
    if (editScores.homeScore === '' || editScores.awayScore === '') return;
    saveMatchResult(match.id, {
      homeTeam: match.homeTeam, awayTeam: match.awayTeam,
      homeScore: parseInt(editScores.homeScore), awayScore: parseInt(editScores.awayScore),
      stage: match.stage || 'group', group: match.group || null, played: true,
    });
    setEditingMatch(null);
    setEditScores({ homeScore: '', awayScore: '' });
  };

  const handleExport = () => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `beeri-worldcup-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { importAllData(JSON.parse(ev.target.result)); alert('Data imported!'); }
      catch { alert('Invalid file'); }
    };
    reader.readAsText(file);
  };

  const renderResultsTab = () => (
    <>
      <StageSelector selectedStage={selectedStage} onSelect={setSelectedStage} />
      {selectedStage === 'group' && (
        <GroupSelector groups={Object.keys(GROUPS)} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
      )}
      <div className="space-y-2">
        {filteredMatches.map((match) => {
          const homeTeam = getTeamByCode(match.homeTeam);
          const awayTeam = getTeamByCode(match.awayTeam);
          const result = results[match.id];
          const isEditing = editingMatch === match.id;
          return (
            <div key={match.id} className={`bg-white rounded-xl p-3 border ${result ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span>{homeTeam?.flag || '🏳️'}</span>
                    <span className="font-medium">{homeTeam?.name || match.homeTeam || 'TBD'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <span>{awayTeam?.flag || '🏳️'}</span>
                    <span className="font-medium">{awayTeam?.name || match.awayTeam || 'TBD'}</span>
                  </div>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <input type="number" min="0" value={editScores.homeScore}
                        onChange={(e) => setEditScores((s) => ({ ...s, homeScore: e.target.value }))}
                        className="w-12 h-8 text-center border rounded text-sm" placeholder="0" />
                      <input type="number" min="0" value={editScores.awayScore}
                        onChange={(e) => setEditScores((s) => ({ ...s, awayScore: e.target.value }))}
                        className="w-12 h-8 text-center border rounded text-sm" placeholder="0" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => handleSaveResult(match)} className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600">✓</button>
                      <button onClick={() => setEditingMatch(null)} className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300">✕</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {result ? (
                      <span className="font-bold text-primary text-lg">{result.homeScore} - {result.awayScore}</span>
                    ) : (
                      <span className="text-gray-400 text-sm">Not played</span>
                    )}
                    <button onClick={() => { setEditingMatch(match.id); setEditScores({ homeScore: result?.homeScore ?? '', awayScore: result?.awayScore ?? '' }); }}
                      className="text-xs bg-primary text-white px-2 py-1.5 rounded hover:bg-primary-light">
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

  const renderAdvancingTab = () => {
    const rounds = [
      { id: 'R32', label: 'Teams in Round of 32', count: 32 },
      { id: 'R16', label: 'Teams in Round of 16', count: 16 },
      { id: 'QF', label: 'Teams in Quarter-Finals', count: 8 },
      { id: 'SF', label: 'Teams in Semi-Finals', count: 4 },
      { id: 'F', label: 'Teams in Final', count: 2 },
    ];

    return (
      <div className="space-y-4">
        <p className="text-xs text-gray-400">Select teams that actually advanced to each round.</p>
        {rounds.map((round) => {
          const selected = actualAdvancing[round.id] || [];
          return (
            <div key={round.id} className="bg-white rounded-xl p-4 border border-gray-100">
              <h3 className="font-bold text-sm text-primary mb-2">
                {round.label} ({selected.length}/{round.count})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TEAMS.map((team) => {
                  const isSelected = selected.includes(team.code);
                  return (
                    <button key={team.code} onClick={() => {
                      const newSelected = isSelected
                        ? selected.filter(t => t !== team.code)
                        : selected.length < round.count ? [...selected, team.code] : selected;
                      saveActualAdvancing(round.id, newSelected);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                      isSelected ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                      {team.flag} {team.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBonusesTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-2">🏆 Champion</h3>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TEAMS.map((team) => (
            <button key={team.code} onClick={() => saveActualBonuses({ ...actualBonuses, champion: team.code })}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                actualBonuses.champion === team.code ? 'bg-yellow-400 text-yellow-900 font-bold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {team.flag} {team.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-2">⚽ Top Scorers</h3>
        <p className="text-xs text-gray-400 mb-2">Add all players tied for top scorer.</p>
        <div className="flex gap-2 mb-2">
          <input type="text" value={topScorerInput} onChange={(e) => setTopScorerInput(e.target.value)}
            placeholder="Player name..." className="flex-1 px-3 py-2 border rounded-lg text-sm" />
          <button onClick={() => {
            if (!topScorerInput.trim()) return;
            const current = actualBonuses.topScorers || [];
            saveActualBonuses({ ...actualBonuses, topScorers: [...current, topScorerInput.trim()] });
            setTopScorerInput('');
          }} className="bg-primary text-white px-3 py-2 rounded-lg text-sm">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(actualBonuses.topScorers || []).map((name, i) => (
            <span key={i} className="bg-green-100 text-green-700 px-2 py-1 rounded-lg text-xs flex items-center gap-1">
              {name}
              <button onClick={() => {
                const updated = [...(actualBonuses.topScorers || [])];
                updated.splice(i, 1);
                saveActualBonuses({ ...actualBonuses, topScorers: updated });
              }} className="text-green-500 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">Tournament Controls</h3>
        <div className="flex items-center justify-between py-3 border-b border-gray-50">
          <div>
            <div className="text-sm font-medium">Lock Predictions</div>
            <div className="text-xs text-gray-400">Prevent changes</div>
          </div>
          <button onClick={() => updateSettings({ predictionsLocked: !settings.predictionsLocked })}
            className={`relative w-12 h-6 rounded-full transition-colors ${settings.predictionsLocked ? 'bg-red-400' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.predictionsLocked ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="py-3">
          <div className="text-sm font-medium mb-2">Admin PIN</div>
          <input type="text" defaultValue={settings.adminPin || '1234'}
            onBlur={(e) => updateSettings({ adminPin: e.target.value })}
            className="w-32 px-3 py-1.5 border rounded text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-2">Stats</h3>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">{Object.keys(users).length}</div>
            <div className="text-xs text-gray-500">Players</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">{Object.keys(results).length}</div>
            <div className="text-xs text-gray-500">Results</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">Data Backup</h3>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex-1 bg-primary text-white text-sm py-2 rounded-lg hover:bg-primary-light transition">Export</button>
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white text-primary text-sm py-2 rounded-lg border-2 border-primary hover:bg-gray-50 transition">Import</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </div>
    </div>
  );

  const renderUsersTab = () => (
    <div className="space-y-2">
      {Object.entries(users).map(([uid, u]) => {
        const predCount = Object.keys(allPredictions[uid]?.matches || {}).length;
        return (
          <div key={uid} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
              {(u.displayName || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.displayName}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-primary">{predCount}</div>
              <div className="text-xs text-gray-400">predictions</div>
            </div>
            {u.isAdmin && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Admin</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">⚙️ Admin Panel</h1>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[
          { id: 'results', label: 'Results' },
          { id: 'advancing', label: 'Advancing' },
          { id: 'bonuses', label: 'Bonuses' },
          { id: 'settings', label: 'Settings' },
          { id: 'users', label: 'Users' },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition ${
              activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'results' && renderResultsTab()}
      {activeTab === 'advancing' && renderAdvancingTab()}
      {activeTab === 'bonuses' && renderBonusesTab()}
      {activeTab === 'settings' && renderSettingsTab()}
      {activeTab === 'users' && renderUsersTab()}
    </div>
  );
}
