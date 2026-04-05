import { getTeamByCode } from '../data/teams';
import { calcGroupStandings } from '../utils/bracket';

export default function GroupTable({ matchData, group }) {
  const standings = calcGroupStandings(matchData);
  const groupStandings = standings[group];
  if (!groupStandings) return null;

  const hasData = groupStandings.some((t) => t.played > 0);
  if (!hasData) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 mb-3 overflow-x-auto">
      <h4 className="text-xs font-bold text-primary mb-2">בית {group}</h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th className="text-right py-1 pr-1 w-5">#</th>
            <th className="text-right py-1">קבוצה</th>
            <th className="text-center py-1 w-6">מש׳</th>
            <th className="text-center py-1 w-6">נ</th>
            <th className="text-center py-1 w-6">ת</th>
            <th className="text-center py-1 w-6">ה</th>
            <th className="text-center py-1 w-8">שע+</th>
            <th className="text-center py-1 w-8">שע-</th>
            <th className="text-center py-1 w-8">הפ</th>
            <th className="text-center py-1 w-8 font-bold">נק׳</th>
          </tr>
        </thead>
        <tbody>
          {groupStandings.map((team, i) => {
            const info = getTeamByCode(team.code);
            const qualifies = i < 2; // top 2 qualify directly
            const thirdPlace = i === 2; // 3rd might qualify
            return (
              <tr
                key={team.code}
                className={`border-b border-gray-50 ${
                  qualifies ? 'bg-green-50/50' : thirdPlace ? 'bg-yellow-50/50' : ''
                }`}
              >
                <td className="py-1.5 pr-1 text-gray-400 font-medium">{i + 1}</td>
                <td className="py-1.5">
                  <span className="mr-1">{info?.flag || '🏳️'}</span>
                  <span className="font-medium">{info?.name || team.code}</span>
                </td>
                <td className="text-center py-1.5">{team.played}</td>
                <td className="text-center py-1.5">{team.won}</td>
                <td className="text-center py-1.5">{team.drawn}</td>
                <td className="text-center py-1.5">{team.lost}</td>
                <td className="text-center py-1.5">{team.gf}</td>
                <td className="text-center py-1.5">{team.ga}</td>
                <td className="text-center py-1.5 font-medium">{team.gd > 0 ? `+${team.gd}` : team.gd}</td>
                <td className="text-center py-1.5 font-bold text-primary">{team.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-green-100 mr-0.5" /> עולה</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-yellow-100 mr-0.5" /> מקום 3 (אפשרי)</span>
      </div>
    </div>
  );
}
