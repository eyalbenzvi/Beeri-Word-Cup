import { useState, useRef, useEffect, useMemo } from "react";
import { TOP_SCORER_PLAYERS } from "../data/players";
import { useSettings } from "../hooks/useStore";
import { getTeamByCode } from "../data/teams";
import { filterPlayers } from "../utils/playerSearch";

export default function PlayerAutocomplete({ value, onChange, disabled }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const settings = useSettings();

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

  const filtered = useMemo(() => filterPlayers(query, players), [query, players]);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={query}
        dir="auto"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        placeholder="הקלד שם שחקן (עברית/אנגלית)"
        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        disabled={disabled}
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-30 top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto w-max min-w-full max-w-[calc(100vw-24px)]">
          {filtered.map((p, i) => {
            const team = getTeamByCode(p.team);
            return (
              <button
                key={`${p.team}-${p.name}-${i}`}
                type="button"
                className={`w-full text-right px-2.5 py-2 text-sm hover:bg-primary/10 transition border-none bg-transparent cursor-pointer flex items-center justify-between gap-3 whitespace-nowrap ${
                  value === p.name ? "bg-primary/5 font-semibold" : ""
                }`}
                onClick={() => {
                  onChange(p.name);
                  setQuery(p.name);
                  setOpen(false);
                }}
              >
                <span className="flex flex-col items-end min-w-0">
                  {p.nameHe && <span className="text-sm">{p.nameHe}</span>}
                  <span className="text-[10px] text-ink-muted/70" dir="ltr">{p.name}</span>
                </span>
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
