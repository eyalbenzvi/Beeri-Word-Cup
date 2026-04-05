import { useState, useRef, useMemo } from 'react';
import {
  useCurrentUser, useMatchResults, useAllPredictions, useUsers,
  useSettings, useActualBonuses,
} from '../hooks/useStore';
import {
  saveMatchResult, updateSettings, exportAllData, importAllData, clearAllData,
  saveActualBonuses, approvePredictions, rejectPredictions,
} from '../store';
import { generateGroupMatches, generateKnockoutMatches } from '../data/matches';
import { GROUPS, getTeamByCode } from '../data/teams';
import { calcBracketTeams } from '../utils/bracket';
import GroupTable from '../components/GroupTable';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();

function randomScore() {
  const weights = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5];
  return weights[Math.floor(Math.random() * weights.length)];
}

export default function Admin() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const settings = useSettings();
  const actualBonuses = useActualBonuses();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [editingMatch, setEditingMatch] = useState(null);
  const [editScores, setEditScores] = useState({ homeScore: '', awayScore: '' });
  const [activeTab, setActiveTab] = useState('approvals');
  const [adminPin, setAdminPin] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [topScorerInput, setTopScorerInput] = useState('');
  const fileInputRef = useRef(null);

  // Compute bracket from actual results (same as Predict does for predictions)
  const bracketTeams = useMemo(() => calcBracketTeams(results), [results]);

  if (!user?.isAdmin) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-lg font-bold text-gray-700">נדרשת גישת מנהל</h2>
        <p className="text-gray-500 text-sm mt-2">השחקן הראשון שמצטרף הופך למנהל.</p>
      </div>
    );
  }

  if (!pinVerified && activeTab === 'settings') {
    const currentPin = settings.adminPin || '1234';
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔑</div>
        <h2 className="text-lg font-bold text-gray-700 mb-4">הכנס קוד מנהל</h2>
        <p className="text-xs text-gray-400 mb-3">קוד ברירת מחדל: 1234</p>
        <form onSubmit={(e) => { e.preventDefault(); if (adminPin === currentPin) setPinVerified(true); }}>
          <input type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)}
            placeholder="PIN" className="w-32 px-4 py-2 border-2 border-gray-200 rounded-xl text-center text-lg tracking-widest focus:border-primary focus:outline-none mb-3" autoFocus />
          <br />
          <button type="submit" className="bg-primary text-white font-semibold px-6 py-2 rounded-xl hover:bg-primary-light transition">אימות</button>
        </form>
        <button onClick={() => setActiveTab('results')} className="mt-3 text-sm text-gray-400 hover:text-primary">← חזרה</button>
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
      try { importAllData(JSON.parse(ev.target.result)); alert('הנתונים יובאו בהצלחה!'); }
      catch { alert('קובץ לא תקין'); }
    };
    reader.readAsText(file);
  };

  const handleRandomizeResults = () => {
    if (!window.confirm('פעולה זו תדרוס את כל התוצאות בתוצאות אקראיות. להמשיך?')) return;

    const allResults = {};

    // Group matches
    groupMatches.forEach((match) => {
      const r = {
        homeTeam: match.homeTeam, awayTeam: match.awayTeam,
        homeScore: randomScore(), awayScore: randomScore(),
        stage: 'group', group: match.group, played: true,
      };
      allResults[match.id] = r;
      saveMatchResult(match.id, r);
    });

    // Knockout matches
    knockoutMatches.forEach((match) => {
      const r = {
        homeTeam: match.homeTeam, awayTeam: match.awayTeam,
        homeScore: randomScore(), awayScore: randomScore(),
        stage: match.stage || 'group', group: null, played: true,
      };
      allResults[match.id] = r;
      saveMatchResult(match.id, r);
    });

    // Resolve ties stage-by-stage with real team codes
    const knockoutStageOrder = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];
    for (const stage of knockoutStageOrder) {
      const bracket = calcBracketTeams(allResults);
      for (const match of knockoutMatches.filter((m) => m.stage === stage)) {
        const r = allResults[match.id];
        if (r.homeScore === r.awayScore) {
          const teams = bracket[match.id];
          if (teams?.home && teams?.away) {
            r.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
            saveMatchResult(match.id, r);
          }
        }
      }
    }
  };

  const renderResultsTab = () => (
    <>
      <button
        onClick={handleRandomizeResults}
        className="w-full mb-3 bg-white text-primary font-semibold py-2.5 rounded-xl border-2 border-primary shadow-sm hover:bg-gray-50 active:bg-gray-100 transition text-sm"
      >
        🎲 הגרלת כל התוצאות
      </button>
      <StageSelector selectedStage={selectedStage} onSelect={setSelectedStage} />
      {selectedStage === 'group' && (
        <GroupSelector groups={Object.keys(GROUPS)} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
      )}
      {selectedStage === 'group' && (
        <GroupTable matchData={results} group={selectedGroup} />
      )}
      <div className="space-y-2">
        {filteredMatches.map((match) => {
          // For knockout, derive teams from bracket
          const derived = match.stage !== 'group' && bracketTeams[match.id]
            ? { home: bracketTeams[match.id].home, away: bracketTeams[match.id].away }
            : { home: match.homeTeam, away: match.awayTeam };
          const homeTeam = getTeamByCode(derived.home);
          const awayTeam = getTeamByCode(derived.away);
          const result = results[match.id];
          const isEditing = editingMatch === match.id;
          const isKnockout = match.stage !== 'group';
          const isTie = result && result.homeScore === result.awayScore;
          return (
            <div key={match.id} className={`bg-white rounded-xl p-3 border ${result ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}>
              {/* Bracket label for knockout */}
              {isKnockout && match.label && (
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-gray-400 font-medium">{match.label}</span>
                  {match.date && <span className="text-xs text-gray-300">{match.date}</span>}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span>{homeTeam?.flag || '🏳️'}</span>
                    <span className="font-medium">{homeTeam?.name || derived.home || 'TBD'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <span>{awayTeam?.flag || '🏳️'}</span>
                    <span className="font-medium">{awayTeam?.name || derived.away || 'TBD'}</span>
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
                      <span className="text-gray-400 text-sm">לא שוחק</span>
                    )}
                    <button onClick={() => { setEditingMatch(match.id); setEditScores({ homeScore: result?.homeScore ?? '', awayScore: result?.awayScore ?? '' }); }}
                      className="text-xs bg-primary text-white px-2 py-1.5 rounded hover:bg-primary-light">
                      {result ? 'ערוך' : 'הכנס'}
                    </button>
                  </div>
                )}
              </div>
              {/* Knockout tie — who advances */}
              {isKnockout && isTie && derived.home && derived.away && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500 text-center mb-1.5">מי עולה? (פנדלים)</div>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => saveMatchResult(match.id, { ...result, advancingTeam: derived.home })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        result?.advancingTeam === derived.home
                          ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {homeTeam?.flag || '🏳️'} {homeTeam?.name || derived.home}
                    </button>
                    <button
                      onClick={() => saveMatchResult(match.id, { ...result, advancingTeam: derived.away })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        result?.advancingTeam === derived.away
                          ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {awayTeam?.flag || '🏳️'} {awayTeam?.name || derived.away}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  const renderTopScorerTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-2">⚽ מלך השערים</h3>
        <p className="text-xs text-gray-400 mb-2">הוסף את כל השחקנים שנמצאים בראש טבלת הכובשים (במקרה של שוויון).</p>
        <div className="flex gap-2 mb-2">
          <input type="text" value={topScorerInput} onChange={(e) => setTopScorerInput(e.target.value)}
            placeholder="שם שחקן..." className="flex-1 px-3 py-2 border rounded-lg text-sm" />
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
        <h3 className="font-semibold text-sm mb-3">בקרת טורניר</h3>
        <div className="flex items-center justify-between py-3 border-b border-gray-50">
          <div>
            <div className="text-sm font-medium">נעילת ניחושים</div>
            <div className="text-xs text-gray-400">מונע שינויים</div>
          </div>
          <button onClick={() => updateSettings({ predictionsLocked: !settings.predictionsLocked })}
            className={`relative w-12 h-6 rounded-full transition-colors ${settings.predictionsLocked ? 'bg-red-400' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.predictionsLocked ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="py-3">
          <div className="text-sm font-medium mb-2">קוד מנהל</div>
          <input type="text" defaultValue={settings.adminPin || '1234'}
            onBlur={(e) => updateSettings({ adminPin: e.target.value })}
            className="w-32 px-3 py-1.5 border rounded text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-2">סטטיסטיקות</h3>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">{Object.keys(users).length}</div>
            <div className="text-xs text-gray-500">שחקנים</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-primary">{Object.keys(results).length}</div>
            <div className="text-xs text-gray-500">תוצאות</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">גיבוי נתונים</h3>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex-1 bg-primary text-white text-sm py-2 rounded-lg hover:bg-primary-light transition">ייצוא</button>
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white text-primary text-sm py-2 rounded-lg border-2 border-primary hover:bg-gray-50 transition">ייבוא</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-red-200">
        <h3 className="font-semibold text-sm text-red-600 mb-2">אזור מסוכן</h3>
        <p className="text-xs text-gray-400 mb-3">מחיקת כל הנתונים: משתמשים, ניחושים, תוצאות. לא ניתן לבטל.</p>
        <button
          onClick={() => {
            if (window.confirm('בטוח? פעולה זו תמחק את כל הנתונים — משתמשים, ניחושים ותוצאות.')) {
              clearAllData();
              window.location.href = '/';
            }
          }}
          className="w-full bg-red-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-red-600 transition"
        >
          מחק את כל הנתונים
        </button>
      </div>
    </div>
  );

  // Count pending approvals
  const pendingUsers = Object.entries(allPredictions).filter(([, p]) => p.status === 'pending');
  const pendingCount = pendingUsers.length;

  const renderApprovalsTab = () => {
    const allEntries = Object.entries(allPredictions)
      .map(([userId, pred]) => ({
        userId,
        displayName: users[userId]?.formName || users[userId]?.displayName || userId,
        status: pred.status || 'draft',
        matchCount: Object.keys(pred.matches || {}).length,
        topScorer: pred.topScorer || '',
        submittedAt: pred.submittedAt,
        approvedAt: pred.approvedAt,
      }))
      .sort((a, b) => {
        const order = { pending: 0, draft: 1, approved: 2 };
        return (order[a.status] ?? 1) - (order[b.status] ?? 1);
      });

    return (
      <div className="space-y-2">
        {allEntries.length === 0 && (
          <div className="text-center py-8 text-gray-400">עדיין לא הוגשו ניחושים</div>
        )}
        {allEntries.map((entry) => (
          <div key={entry.userId} className={`bg-white rounded-xl p-4 border ${
            entry.status === 'pending' ? 'border-yellow-300 bg-yellow-50/30' :
            entry.status === 'approved' ? 'border-green-200 bg-green-50/30' :
            'border-gray-100'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                {entry.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{entry.displayName}</div>
                <div className="text-xs text-gray-400">
                  {entry.matchCount} משחקים •
                  {entry.topScorer ? ` מלך: ${entry.topScorer}` : ' ללא מלך שערים'}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                entry.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                entry.status === 'approved' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {entry.status === 'pending' ? '⏳ ממתין' :
                 entry.status === 'approved' ? '✅ אושר' : 'טיוטה'}
              </span>
            </div>

            {entry.status === 'pending' && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => approvePredictions(entry.userId)}
                  className="flex-1 bg-green-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-green-600 transition">
                  ✓ אשר
                </button>
                <button onClick={() => rejectPredictions(entry.userId)}
                  className="flex-1 bg-red-100 text-red-600 text-sm font-semibold py-2 rounded-lg hover:bg-red-200 transition">
                  ✕ החזר
                </button>
              </div>
            )}

            {entry.status === 'approved' && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => rejectPredictions(entry.userId)}
                  className="w-full bg-gray-100 text-gray-500 text-xs py-1.5 rounded-lg hover:bg-gray-200 transition">
                  בטל אישור (אפשר עריכה)
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderUsersTab = () => (
    <div className="space-y-2">
      {Object.entries(users).map(([uid, u]) => {
        const predCount = Object.keys(allPredictions[uid]?.matches || {}).length;
        const predStatus = allPredictions[uid]?.status || 'draft';
        return (
          <div key={uid} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
              {(u.displayName || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.displayName}</div>
              <div className="text-xs text-gray-400">
                {u.formName ? `טופס: ${u.formName}` : ''}{u.budgetNumber ? ` • תקציב: ${u.budgetNumber}` : ''}{!u.formName && !u.budgetNumber ? predStatus : ` • ${predStatus}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-primary">{predCount}</div>
              <div className="text-xs text-gray-400">ניחושים</div>
            </div>
            {u.isAdmin && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Admin</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">⚙️ לוח ניהול</h1>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {[
          { id: 'approvals', label: pendingCount > 0 ? `אישור (${pendingCount})` : 'אישור' },
          { id: 'results', label: 'תוצאות' },
          { id: 'topscorer', label: 'מלך שערים' },
          { id: 'settings', label: 'הגדרות' },
          { id: 'users', label: 'משתמשים' },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-2 py-2 text-xs font-medium rounded-md transition ${
              activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            } ${tab.id === 'approvals' && pendingCount > 0 ? 'text-yellow-700' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'approvals' && renderApprovalsTab()}
      {activeTab === 'results' && renderResultsTab()}
      {activeTab === 'topscorer' && renderTopScorerTab()}
      {activeTab === 'settings' && renderSettingsTab()}
      {activeTab === 'users' && renderUsersTab()}
    </div>
  );
}
