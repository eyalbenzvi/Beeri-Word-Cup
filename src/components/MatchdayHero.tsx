// Hero banner on Home for days when there's an actual match today.
// Replaces the countdown card in that case with a live, present-tense moment.
import { useMemo } from "react";
import { getTeamByCode } from "../data/teams";
import { groupMatches, knockoutMatches } from "../data/matches";
import { getMatchKickoffUTC, getMatchIsraelDateKey } from "../utils/matchTime";

function getTodayIsraelKey() {
  // Format today's date as YYYY-MM-DD in Israel time
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
}

export default function MatchdayHero({ results }) {
  const todaysMatches = useMemo(() => {
    const todayKey = getTodayIsraelKey();
    const all = [...groupMatches, ...knockoutMatches];
    return all
      .filter((m) => getMatchIsraelDateKey(m) === todayKey)
      .sort((a, b) => {
        const au = getMatchKickoffUTC(a);
        const bu = getMatchKickoffUTC(b);
        return new Date(au).getTime() - new Date(bu).getTime();
      });
  }, []);

  if (todaysMatches.length === 0) return null;

  // Find the next upcoming match today (not yet played), else show "today's matches"
  const unplayed = todaysMatches.find((m) => !results?.[m.id]);
  const featured = unplayed || todaysMatches[0];
  const home = getTeamByCode(featured.homeTeam);
  const away = getTeamByCode(featured.awayTeam);

  return (
    <div
      className="rounded-2xl p-5 mb-4 border-2"
      style={{
        background: "linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-accent-soft-2) 100%)",
        borderColor: "var(--color-primary)",
      }}
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <span
          className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse"
          aria-hidden="true"
        />
        <span className="text-xs font-extrabold text-danger uppercase tracking-wider">
          היום
        </span>
      </div>
      <div className="text-center font-heading font-extrabold text-2xl md:text-3xl text-ink">
        <bdi>{home?.name || "טרם נקבע"}</bdi>
        {" "}<span className="text-ink-muted">נגד</span>{" "}
        <bdi>{away?.name || "טרם נקבע"}</bdi>
      </div>
      {featured.time && (
        <div className="text-center text-sm font-bold text-ink-muted mt-1">
          <bdi>{featured.time}</bdi>
          {featured.venue ? ` · ${featured.venue}` : ""}
        </div>
      )}
      {todaysMatches.length > 1 && (
        <div className="text-center text-xs font-bold text-ink-muted mt-2">
          ועוד {todaysMatches.length - 1} משחקים היום
        </div>
      )}
    </div>
  );
}
