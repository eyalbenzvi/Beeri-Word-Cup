import { useState, useRef, useEffect, useMemo } from "react";
import { useSettings } from "../hooks/useStore";
import { getTeamByCode } from "../data/teams";
import {
  filterPlayers,
  resolvePlayerList,
  getPlayerDisplayName,
  getPlayerByEitherName,
} from "../utils/playerSearch";

// Strict autocomplete: user must pick from the list.
// Stored value is the Hebrew name (`nameHe`) of the chosen player.
// Free-typed text that doesn't resolve to a list item is rejected on blur
// (the input reverts to the last-stored value).
export default function PlayerAutocomplete({ value, onChange, disabled = false, compact = false }: { value: string; onChange: (val: string) => void; disabled?: boolean; compact?: boolean }) {
  const settings = useSettings();
  const players = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );

  const storedDisplay = useMemo(
    () => getPlayerDisplayName(value, players),
    [value, players],
  );

  const [query, setQuery] = useState(storedDisplay);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setQuery(storedDisplay);
  }, [storedDisplay, editing]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        commitOrRevert();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, players, value]);

  const filtered = useMemo(() => filterPlayers(query, players), [query, players]);

  function selectPlayer(p) {
    onChange(p.nameHe || p.name);
    setQuery(p.nameHe || p.name);
    setEditing(false);
    setOpen(false);
    setHint("");
  }

  function commitOrRevert() {
    setOpen(false);
    if (!editing) return;
    const typed = query.trim();
    if (!typed) {
      // cleared on purpose
      onChange("");
      setEditing(false);
      setHint("");
      return;
    }
    // exact match?
    const exact = getPlayerByEitherName(typed, players);
    if (exact) {
      selectPlayer(exact);
      return;
    }
    // narrows to a single candidate?
    const candidates = filterPlayers(typed, players, 2);
    if (candidates.length === 1) {
      selectPlayer(candidates[0]);
      return;
    }
    // reject: revert to last-stored display
    setQuery(storedDisplay);
    setEditing(false);
    setHint("יש לבחור שחקן מהרשימה");
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        value={query}
        dir="auto"
        onChange={(e) => {
          setQuery(e.target.value);
          setEditing(true);
          setOpen(true);
          setHint("");
        }}
        onFocus={() => setOpen(true)}
        placeholder={compact ? "שם שחקן..." : "הקלד שם שחקן (עברית/אנגלית)"}
        className="input-duo"
        style={compact ? { padding: "0.5rem 0.75rem", fontSize: "0.85rem" } : undefined}
        disabled={disabled}
      />
      {hint && (
        <div className="absolute top-full left-0 right-0 mt-0.5 text-xs text-danger font-bold pointer-events-none">
          {hint}
        </div>
      )}
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-30 top-full right-0 mt-1 bg-white border-2 border-border rounded-2xl max-h-72 overflow-y-auto w-max min-w-full max-w-[calc(100vw-24px)]" style={{ boxShadow: "0 6px 16px rgba(0,0,0,0.08)" }}>
          {filtered.map((p, i) => {
            const team = getTeamByCode(p.team);
            const selected = value && (value === p.nameHe || value === p.name);
            return (
              <button
                key={`${p.team}-${p.name}-${i}`}
                type="button"
                className={`w-full text-right px-3 py-2.5 text-sm hover:bg-bg-soft transition border-none bg-transparent cursor-pointer flex items-center justify-between gap-3 whitespace-nowrap ${
                  selected ? "bg-primary/5 font-extrabold text-ink" : "text-ink"
                }`}
                onMouseDown={(e) => {
                  // prevent input blur before click fires
                  e.preventDefault();
                }}
                onClick={() => selectPlayer(p)}
              >
                <span className="text-sm">{p.nameHe || p.name}</span>
                <span className="text-xs text-ink-muted font-bold flex-shrink-0">
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
