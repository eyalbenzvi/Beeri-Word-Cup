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

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
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
      <div className="bg-white rounded-3xl max-w-md w-full border-2 border-border max-h-[70vh] flex flex-col">
        <div className="p-4 pb-2 flex items-center gap-3 border-b-2 border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש קבוצה או שלב..."
            className="input-duo flex-1"
          />
          <button
            onClick={onClose}
            className="text-ink-muted text-xl bg-transparent border-none cursor-pointer p-1 hover:text-ink font-bold"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3">
          {query.trim() && results.length === 0 && (
            <div className="text-center py-8 text-ink-muted text-sm font-medium">
              לא נמצאו תוצאות
            </div>
          )}
          {!query.trim() && (
            <div className="text-center py-8 text-ink-muted text-sm font-medium">
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-soft transition cursor-pointer text-right bg-transparent border-none"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: missing ? "var(--color-danger)" : "var(--color-primary)" }}
                  />
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap text-white ${
                      isKO ? "bg-purple" : "bg-secondary"
                    }`}
                  >
                    {match.stage === "group"
                      ? `בית ${match.group}`
                      : STAGES[match.stage]}
                  </span>
                  <span className="text-sm text-ink font-bold flex-1 truncate">
                    {homeInfo?.name || "טרם נקבע"} —{" "}
                    {awayInfo?.name || "טרם נקבע"}
                  </span>
                  <span className="text-ink-light text-xs">←</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
