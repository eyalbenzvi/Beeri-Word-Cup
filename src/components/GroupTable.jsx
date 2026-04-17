import { useMemo, useRef, useEffect } from "react";
import { getTeamByCode } from "../data/teams";
import { calcGroupStandings } from "../utils/bracket";

export default function GroupTable({ matchData, group }) {
  const standings = useMemo(() => calcGroupStandings(matchData), [matchData]);
  const groupStandings = standings[group];

  const hasData = groupStandings?.some((t) => t.played > 0) ?? false;
  const prevHasData = useRef(false);

  useEffect(() => {
    if (hasData && !prevHasData.current) {
      // Table just appeared for the first time — scroll the focused match back into view
      requestAnimationFrame(() => {
        const activeEl = document.activeElement;
        const card = activeEl?.closest?.("[data-match-card]");
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
    prevHasData.current = hasData;
  }, [hasData]);

  if (!groupStandings || !hasData) return null;

  return (
    <div className="bg-white rounded-2xl border border-border p-4 mb-3">
      <h4 className="text-xs font-bold text-primary mb-2">טבלת בית {group}</h4>
      <div className="overflow-x-auto scroll-smooth -mx-1">
      <table className="w-full text-xs min-w-[400px]">
        <thead>
          <tr className="text-gray-400 border-b-2 border-gray-100">
            <th scope="col" className="text-right py-1.5 pr-1 w-5 font-semibold">#</th>
            <th scope="col" className="text-right py-1.5 font-semibold">קבוצה</th>
            <th scope="col" className="text-center py-1.5 w-6 font-semibold" title="משחקים">מש׳</th>
            <th scope="col" className="text-center py-1.5 w-8 font-bold" title="נקודות">נק׳</th>
            <th scope="col" className="text-center py-1.5 w-6 font-semibold" title="ניצחונות">נ</th>
            <th scope="col" className="text-center py-1.5 w-6 font-semibold" title="תיקו">ת</th>
            <th scope="col" className="text-center py-1.5 w-6 font-semibold" title="הפסדים">ה</th>
            <th scope="col" className="text-center py-1.5 w-8 font-semibold" title="שערים בעד">שע+</th>
            <th scope="col" className="text-center py-1.5 w-8 font-semibold" title="שערים נגד">שע-</th>
            <th scope="col" className="text-center py-1.5 w-8 font-semibold" title="הפרש שערים">הפ</th>
          </tr>
        </thead>
        <tbody>
          {groupStandings.map((team, i) => {
            const info = getTeamByCode(team.code);
            const qualifies = i < 2;
            const thirdPlace = i === 2;
            return (
              <tr
                key={team.code}
                className={`border-b border-gray-50 ${
                  qualifies
                    ? "bg-green-50/60"
                    : thirdPlace
                      ? "bg-amber-50/60"
                      : ""
                }`}
              >
                <td className="py-1.5 pr-1 text-gray-400 font-bold text-[11px]">
                  {i + 1}
                </td>
                <td className="py-1.5">
                  <span className="font-semibold text-gray-700">
                    {info?.name || "טרם נקבע"}
                  </span>
                </td>
                <td className="text-center py-1.5 text-gray-500">
                  {team.played}
                </td>
                <td className="text-center py-1.5 font-bold text-primary">
                  {team.pts}
                </td>
                <td className="text-center py-1.5 text-gray-500">{team.won}</td>
                <td className="text-center py-1.5 text-gray-500">
                  {team.drawn}
                </td>
                <td className="text-center py-1.5 text-gray-500">
                  {team.lost}
                </td>
                <td className="text-center py-1.5 text-gray-500">{team.gf}</td>
                <td className="text-center py-1.5 text-gray-500">{team.ga}</td>
                <td className="text-center py-1.5 font-semibold text-gray-600">
                  {team.gd > 0 ? `+${team.gd}` : team.gd}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-100" /> עולה
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-100" /> מקום 3
          (אפשרי)
        </span>
      </div>
    </div>
  );
}
