import { useState, useMemo, useRef, useEffect } from "react";
import { getTeamByCode } from "../data/teams";
import { STAGES } from "../data/matches";

export default function MatchSearch({
  groupMatches,
  knockoutMatches,
  matchPredictions,
  bracketTeams,
  onJump,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allMatches = useMemo(
    () => [...groupMatches, ...knockoutMatches],
    [groupMatches, knockoutMatches],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return allMatches.filter((match) => {
      const isKO = match.stage !== "group";
      const teams =
        isKO && bracketTeams[match.id]
          ? bracketTeams[match.id]
          : { home: match.homeTeam, away: match.awayTeam };
      const homeInfo = getTeamByCode(teams.home);
      const awayInfo = getTeamByCode(teams.away);
      const searchable = [
        homeInfo?.name,
        awayInfo?.name,
        match.label,
        match.group ? `בית ${match.group}` : "",
        STAGES[match.stage],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(q);
    });
  }, [query, allMatches, bracketTeams]);

  const isMissing = (m) => {
    const p = matchPredictions[m.id];
    return (
      !p ||
      p.homeScore === undefined ||
      p.homeScore === null ||
      p.awayScore === undefined ||
      p.awayScore === null
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-16 px-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl max-h-[70vh] flex flex-col">
        <div className="p-4 pb-2 flex items-center gap-3 border-b border-gray-100">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש קבוצה או שלב..."
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-gray-400 text-lg bg-transparent border-none cursor-pointer p-1 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3">
          {query.trim() && results.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              לא נמצאו תוצאות
            </div>
          )}
          {!query.trim() && (
            <div className="text-center py-8 text-gray-400 text-sm">
              הקלד שם קבוצה כדי לחפש
            </div>
          )}
          <div className="space-y-1">
            {results.slice(0, 20).map((match) => {
              const isKO = match.stage !== "group";
              const teams =
                isKO && bracketTeams[match.id]
                  ? bracketTeams[match.id]
                  : { home: match.homeTeam, away: match.awayTeam };
              const homeInfo = getTeamByCode(teams.home);
              const awayInfo = getTeamByCode(teams.away);
              const missing = isMissing(match);

              return (
                <button
                  key={match.id}
                  onClick={() => {
                    onJump(match);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition cursor-pointer active:scale-[0.98] text-right bg-transparent border-none"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      missing ? "bg-red-400" : "bg-green-400"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      isKO
                        ? "bg-purple-50 text-purple-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {match.stage === "group"
                      ? `בית ${match.group}`
                      : STAGES[match.stage]}
                  </span>
                  <span className="text-xs text-gray-700 font-medium flex-1 truncate">
                    {homeInfo?.name || "טרם נקבע"} —{" "}
                    {awayInfo?.name || "טרם נקבע"}
                  </span>
                  <span className="text-gray-300 text-xs">←</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
