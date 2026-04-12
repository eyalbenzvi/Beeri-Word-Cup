import { useState, useRef, useEffect, useMemo } from "react";
import { TOP_SCORER_PLAYERS } from "../data/players";
import { useSettings } from "../hooks/useStore";
import { getTeamByCode } from "../data/teams";

export default function PlayerAutocomplete({ value, onChange, disabled }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const settings = useSettings();

  // Use admin-provided list if available, otherwise static
  const players = useMemo(() => {
    if (settings.topScorerPlayers?.length > 0) return settings.topScorerPlayers;
    return TOP_SCORER_PLAYERS;
  }, [settings.topScorerPlayers]);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return players.slice(0, 20);
    const q = query.toLowerCase();
    return players.filter(
      (p) => p.name.toLowerCase().includes(q) || (getTeamByCode(p.team)?.name || "").includes(q)
    ).slice(0, 20);
  }, [query, players]);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        placeholder="הקלד שם שחקן"
        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        disabled={disabled}
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((p, i) => {
            const team = getTeamByCode(p.team);
            return (
              <button
                key={`${p.team}-${p.name}-${i}`}
                type="button"
                className={`w-full text-right px-2.5 py-2 text-sm hover:bg-primary/10 transition border-none bg-transparent cursor-pointer flex items-center justify-between gap-1 ${
                  value === p.name ? "bg-primary/5 font-semibold" : ""
                }`}
                onClick={() => {
                  onChange(p.name);
                  setQuery(p.name);
                  setOpen(false);
                }}
              >
                <span className="truncate">{p.name}</span>
                <span className="text-[10px] text-ink-muted/60 flex-shrink-0">
                  {team?.flag} {team?.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
