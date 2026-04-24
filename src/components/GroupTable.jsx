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
    <div data-group-table className="mb-3">
      <h4 className="text-xs font-extrabold text-ink-muted mb-2 uppercase tracking-wider">טבלת בית {group}</h4>
      <div className="overflow-x-auto scroll-smooth -mx-1">
      <table className="w-full text-[11px] sm:text-xs min-w-[340px]">
        <thead>
          <tr className="text-ink-muted border-b-2 border-border">
            <th scope="col" className="text-right py-1.5 pr-1 w-5 font-bold">#</th>
            <th scope="col" className="text-right py-1.5 font-bold">קבוצה</th>
            <th scope="col" className="text-center py-1.5 w-6 font-bold" title="משחקים">מש׳</th>
            <th scope="col" className="text-center py-1.5 w-8 font-extrabold" title="נקודות">נק׳</th>
            <th scope="col" className="text-center py-1.5 w-6 font-bold" title="ניצחונות">נ</th>
            <th scope="col" className="text-center py-1.5 w-6 font-bold" title="תיקו">ת</th>
            <th scope="col" className="text-center py-1.5 w-6 font-bold" title="הפסדים">ה</th>
            <th scope="col" className="text-center py-1.5 w-8 font-bold" title="שערים בעד">שע+</th>
            <th scope="col" className="text-center py-1.5 w-8 font-bold" title="שערים נגד">שע-</th>
            <th scope="col" className="text-center py-1.5 w-8 font-bold" title="הפרש שערים">הפ</th>
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
                className="border-b border-border"
                style={qualifies
                  ? { background: "var(--color-primary-soft)" }
                  : thirdPlace
                    ? { background: "var(--color-accent-soft-2)" }
                    : undefined}
              >
                <td className="py-1.5 pr-1 text-ink-light font-extrabold text-xs">
                  {i + 1}
                </td>
                <td className="py-1.5">
                  <span className="font-bold text-ink">
                    {info?.name || "טרם נקבע"}
                  </span>
                </td>
                <td className="text-center py-1.5 text-ink-muted">
                  {team.played}
                </td>
                <td className="text-center py-1.5 font-extrabold text-primary">
                  {team.pts}
                </td>
                <td className="text-center py-1.5 text-ink-muted">{team.won}</td>
                <td className="text-center py-1.5 text-ink-muted">
                  {team.drawn}
                </td>
                <td className="text-center py-1.5 text-ink-muted">
                  {team.lost}
                </td>
                <td className="text-center py-1.5 text-ink-muted">{team.gf}</td>
                <td className="text-center py-1.5 text-ink-muted">{team.ga}</td>
                <td className="text-center py-1.5 font-bold text-ink">
                  {team.gd > 0 ? `+${team.gd}` : team.gd}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] text-ink-muted font-bold">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--color-primary-soft)", border: "1px solid var(--color-primary)" }} /> עולה
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--color-accent-soft-2)", border: "1px solid var(--color-accent)" }} /> מקום 3
          (אפשרי)
        </span>
      </div>
    </div>
  );
}
