import { useState } from 'react';
import { useMatchResults } from '../hooks/useStore';
import { generateGroupMatches, generateKnockoutMatches, STAGES } from '../data/matches';
import { GROUPS, getTeamByCode } from '../data/teams';
import GroupTable from '../components/GroupTable';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();

export default function Results() {
  const results = useMatchResults();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');

  const filteredMatches = selectedStage === 'group'
    ? groupMatches.filter((m) => m.group === selectedGroup)
    : knockoutMatches.filter((m) => m.stage === selectedStage);

  const playedCount = Object.keys(results).length;
  const totalMatches = groupMatches.length + knockoutMatches.length;

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">⚽ תוצאות אמת</h1>

      <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100">
        <div className="text-xs text-gray-500 text-center">
          {playedCount} / {totalMatches} משחקים שוחקו
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 mt-1.5">
          <div className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${(playedCount / totalMatches) * 100}%` }} />
        </div>
      </div>

      <StageSelector selectedStage={selectedStage} onSelect={setSelectedStage} />

      {selectedStage === 'group' && (
        <GroupSelector groups={Object.keys(GROUPS)} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
      )}

      {selectedStage === 'group' && (
        <GroupTable matchData={results} group={selectedGroup} />
      )}

      <div className="space-y-2">
        {filteredMatches.map((match) => {
          const isKnockout = match.stage !== 'group';
          const result = results[match.id];
          // For knockout, only show team names if the match has a result
          const derived = isKnockout && result
            ? { home: result.homeTeam, away: result.awayTeam }
            : isKnockout
            ? { home: null, away: null }
            : { home: match.homeTeam, away: match.awayTeam };
          const homeTeam = derived.home ? getTeamByCode(derived.home) : null;
          const awayTeam = derived.away ? getTeamByCode(derived.away) : null;

          return (
            <div key={match.id} className={`bg-white rounded-xl p-3 border ${
              result ? 'border-green-200 bg-green-50/30' : 'border-gray-100'
            }`}>
              {isKnockout && match.label && (
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-gray-400 font-medium">{match.label}</span>
                  {match.date && <span className="text-xs text-gray-300">{match.date}</span>}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium">{homeTeam?.name || 'טרם נקבע'}</div>
                  <div className="text-sm font-medium mt-1">{awayTeam?.name || 'טרם נקבע'}</div>
                </div>
                {result ? (
                  <div className="text-center">
                    <span className="font-bold text-primary text-lg">{result.homeScore} - {result.awayScore}</span>
                    {isKnockout && result.homeScore === result.awayScore && result.advancingTeam && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        פנדלים: {getTeamByCode(result.advancingTeam)?.name || result.advancingTeam}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-300 text-sm">טרם שוחק</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {playedCount === 0 && (
        <div className="text-center py-8 text-gray-400 mt-4">
          <div className="text-4xl mb-2">🏟️</div>
          <p>עדיין לא הוזנו תוצאות</p>
        </div>
      )}
    </div>
  );
}
