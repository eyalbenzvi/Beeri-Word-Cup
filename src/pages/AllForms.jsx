import { useState, useMemo } from 'react';
import { useAllPredictions, useUsers } from '../hooks/useStore';
import { generateGroupMatches, generateKnockoutMatches, STAGES } from '../data/matches';
import { GROUPS, getTeamByCode } from '../data/teams';
import { calcBracketTeams, deriveChampion } from '../utils/bracket';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();

function normalizeStatus(s) {
  return (s === 'pending' || s === 'approved') ? 'submitted' : (s || 'draft');
}

function MatchRow({ match, prediction }) {
  const home = getTeamByCode(match.homeTeam);
  const away = getTeamByCode(match.awayTeam);
  const homeName = home?.name || 'טרם נקבע';
  const awayName = away?.name || 'טרם נקבע';
  const hasScore = prediction?.homeScore !== undefined && prediction?.homeScore !== null;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs">
      <span className="flex-1 text-right truncate">{homeName}</span>
      <span className="w-16 text-center font-bold text-gray-700">
        {hasScore ? `${prediction.homeScore} - ${prediction.awayScore}` : '-'}
      </span>
      <span className="flex-1 text-left truncate">{awayName}</span>
      {match.stage !== 'group' && hasScore &&
        prediction.homeScore === prediction.awayScore && prediction.advancingTeam && (
        <span className="text-[10px] text-gray-400 mr-1">
          (פנ: {getTeamByCode(prediction.advancingTeam)?.name})
        </span>
      )}
    </div>
  );
}

function FormCard({ form, userName, championDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const predictions = form.matches || {};
  const bracketTeams = useMemo(() => calcBracketTeams(predictions), [predictions]);

  const filledCount = Object.values(predictions).filter(
    p => p?.homeScore !== undefined && p?.homeScore !== null
  ).length;
  const totalCount = groupMatches.length + knockoutMatches.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-right bg-transparent border-none cursor-pointer"
      >
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
          {(form.formName || '?')[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{form.formName || 'טופס ללא שם'}</div>
          <div className="text-xs text-gray-400">{userName} • {filledCount}/{totalCount} משחקים</div>
          {championDisplay && (
            <div className="text-xs text-yellow-600 mt-0.5">🏆 {championDisplay}</div>
          )}
        </div>
        <span className="text-gray-400 text-sm">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Group stage */}
          {Object.keys(GROUPS).map(group => {
            const matches = groupMatches.filter(m => m.group === group);
            return (
              <div key={group}>
                <div className="text-xs font-bold text-gray-500 mb-1">בית {group}</div>
                {matches.map(m => (
                  <MatchRow key={m.id} match={m} prediction={predictions[m.id]} />
                ))}
              </div>
            );
          })}

          {/* Knockout stages */}
          {['R32', 'R16', 'QF', 'SF', '3RD', 'F'].map(stage => {
            const matches = knockoutMatches.filter(m => m.stage === stage);
            if (matches.length === 0) return null;
            return (
              <div key={stage}>
                <div className="text-xs font-bold text-gray-500 mb-1">{STAGES[stage]}</div>
                {matches.map(m => {
                  const derived = bracketTeams[m.id]
                    ? { ...m, homeTeam: bracketTeams[m.id].home, awayTeam: bracketTeams[m.id].away }
                    : m;
                  return <MatchRow key={m.id} match={derived} prediction={predictions[m.id]} />;
                })}
              </div>
            );
          })}

          {/* Top Scorer */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">⚽ מלך שערים</span>
              <span className="font-semibold">{form.topScorer || 'לא הוכנס'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AllFormsView({ onBack }) {
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const [filterText, setFilterText] = useState('');
  const [filterBy, setFilterBy] = useState('form'); // 'form', 'user', or 'champion'

  const submittedForms = useMemo(() => {
    return Object.entries(allPredictions)
      .filter(([, form]) => normalizeStatus(form.status) === 'submitted')
      .map(([formId, form]) => {
        const predictions = form.matches || {};
        const bracketTeams = calcBracketTeams(predictions);
        const championCode = deriveChampion(predictions, bracketTeams);
        const championTeam = championCode ? getTeamByCode(championCode) : null;
        return { formId, ...form, championCode, championName: championTeam?.name || null };
      })
      .sort((a, b) => (a.formName || '').localeCompare(b.formName || ''));
  }, [allPredictions]);

  const filteredForms = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return submittedForms;
    return submittedForms.filter(form => {
      if (filterBy === 'form') {
        return (form.formName || '').toLowerCase().includes(query);
      }
      if (filterBy === 'user') {
        const userName = users[form.userId]?.displayName || form.userId;
        return userName.toLowerCase().includes(query);
      }
      // champion
      return (form.championName || '').toLowerCase().includes(query);
    });
  }, [submittedForms, filterText, filterBy, users]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold text-primary tracking-tight">כל הטפסים</h1>
        <button
          onClick={onBack}
          className="text-xs text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-xl border-none cursor-pointer"
        >
          חזרה →
        </button>
      </div>

      {submittedForms.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-gray-500">אין טפסים שהוגשו עדיין</p>
        </div>
      ) : (
        <>
          {/* Filter controls */}
          <div className="bg-white rounded-2xl border border-gray-100 p-3.5 mb-3 shadow-sm">
            <div className="flex gap-1 mb-2.5 bg-gray-100 rounded-xl p-1">
              {[
                { id: 'form', label: 'לפי טופס' },
                { id: 'user', label: 'לפי משתמש' },
                { id: 'champion', label: 'לפי אלופה' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setFilterBy(tab.id); setFilterText(''); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition border-none cursor-pointer ${
                    filterBy === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={
                filterBy === 'form' ? 'חפש לפי שם טופס...' :
                filterBy === 'user' ? 'חפש לפי שם משתמש...' :
                'חפש לפי שם אלופה...'
              }
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <p className="text-xs text-gray-400 mb-3">
            {filteredForms.length === submittedForms.length
              ? `${submittedForms.length} טפסים הוגשו • לחץ על טופס לצפייה`
              : `מציג ${filteredForms.length} מתוך ${submittedForms.length} טפסים`}
          </p>
          <div className="space-y-2">
            {filteredForms.map(form => (
              <FormCard
                key={form.formId}
                form={form}
                userName={users[form.userId]?.displayName || form.userId}
                championDisplay={form.championName}
              />
            ))}
            {filteredForms.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-sm">לא נמצאו טפסים תואמים</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
