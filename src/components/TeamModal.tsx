import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { getTeamByCode } from "../data/teams";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { r32SlotLabel } from "../utils/matchSlot";
import { getCachedBracket, getCachedChampion } from "../utils/bracketCache";
import { calcGroupStandings } from "../utils/bracket";
import { normalizeStatus } from "../utils/helpers";
import { formatMatchDateShort, formatMatchClock } from "../utils/userTime";
import { useAllPredictions, useMatchResults } from "../hooks/useStore";
import Score from "./Score";

// ---- Context ----------------------------------------------------------------
// A single global team-detail dialog, opened imperatively from anywhere a team
// name is shown (match cards, group tables, results). Mirrors the
// Toast/Confirm provider pattern so callers stay decoupled from rendering and
// the page that triggered the open is unaffected (no URL navigation, no scroll
// jump). Ephemeral by design — closes on Esc / backdrop tap, like ConfirmModal.
type TeamModalFn = (teamCode: string) => void;
const TeamModalContext = createContext<TeamModalFn | null>(null);

function TeamFixtureRow({ match, result, derived }: { match: any; result: any; derived: { home: string | null; away: string | null } }) {
  const home = derived.home ? getTeamByCode(derived.home) : null;
  const away = derived.away ? getTeamByCode(derived.away) : null;
  const hasResult = result && result.homeScore != null;
  const stageLabel = match.stage === "group" ? `בית ${match.group}` : STAGES[match.stage] || match.stage;
  const meta = [formatMatchDateShort(match), formatMatchClock(match)].filter(Boolean).join(" · ");
  return (
    <div className={`rounded-xl p-3 border-2 ${hasResult ? "border-primary/60" : "border-border"} bg-bg-soft`}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-bold text-secondary">{stageLabel}</span>
        <span className="text-xs text-ink-muted">{meta}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold flex-1 text-right ${home ? "text-ink" : "text-ink-light italic"}`}>
          <bdi>{home?.name || r32SlotLabel(match, "home") || "טרם נקבע"}</bdi>
        </span>
        <span className="min-w-[52px] text-center font-extrabold tabular-nums">
          {hasResult ? (
            <Score home={result.homeScore} away={result.awayScore} />
          ) : (
            <span className="text-ink-light">– : –</span>
          )}
        </span>
        <span className={`text-sm font-bold flex-1 text-left ${away ? "text-ink" : "text-ink-light italic"}`}>
          <bdi>{away?.name || r32SlotLabel(match, "away") || "טרם נקבע"}</bdi>
        </span>
      </div>
    </div>
  );
}

function TeamModalBody({ teamCode, onClose }: { teamCode: string; onClose: () => void }) {
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  const team = getTeamByCode(teamCode);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bracket = useMemo(() => getCachedBracket(results), [results]);

  // Group fixtures: direct team-code match. Knockout fixtures: resolved via the
  // ACTUAL bracket (derived from results), so a team only shows the knockout
  // games it genuinely reached, in schedule order.
  const fixtures = useMemo(() => {
    if (!team) return [];
    const group = groupMatches
      .filter((m) => m.homeTeam === teamCode || m.awayTeam === teamCode)
      .map((m) => ({ match: m, result: results[m.id], derived: { home: m.homeTeam, away: m.awayTeam } }));
    const ko = knockoutMatches
      .filter((m) => {
        const bt = bracket[m.id];
        return bt && (bt.home === teamCode || bt.away === teamCode);
      })
      .map((m) => ({
        match: m,
        result: results[m.id],
        derived: {
          home: results[m.id]?.homeTeam || bracket[m.id]?.home || null,
          away: results[m.id]?.awayTeam || bracket[m.id]?.away || null,
        },
      }));
    return [...group, ...ko];
  }, [team, teamCode, results, bracket]);

  // Current group standing position (live, from actual results).
  const standingLine = useMemo(() => {
    if (!team?.group) return null;
    const standings = calcGroupStandings(results)[team.group];
    if (!standings) return null;
    const idx = standings.findIndex((t) => t.code === teamCode);
    const row = idx >= 0 ? standings[idx] : null;
    if (!row || row.played === 0) return null;
    return { pos: idx + 1, pts: row.pts, played: row.played };
  }, [team, teamCode, results]);

  // How many submitted forms predicted this team as champion.
  const championPicks = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const f of Object.values(allPredictions) as any[]) {
      if (normalizeStatus(f.status) !== "submitted") continue;
      total++;
      if (getCachedChampion(f.matches || {}) === teamCode) count++;
    }
    return { count, total };
  }, [allPredictions, teamCode]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-card rounded-3xl border-2 border-border max-w-md w-full max-h-[85vh] flex flex-col animate-pop-in"
      >
        <div className="flex items-center justify-between p-5 pb-3 border-b-2 border-border">
          <h2 id="team-modal-title" className="text-xl font-extrabold text-ink flex items-center gap-2">
            <span aria-hidden="true" className="text-2xl">{team?.flag || "🏳️"}</span>
            <bdi>{team?.name || teamCode}</bdi>
            {team?.group && (
              <span className="text-xs font-bold text-ink-muted">· בית {team.group}</span>
            )}
          </h2>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="tap-44 text-ink-muted hover:text-ink bg-transparent border-none cursor-pointer rounded-full inline-flex items-center justify-center text-xl font-bold w-8 h-8"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-5 pt-3 space-y-3">
          {(standingLine || championPicks.total > 0) && (
            <div className="grid grid-cols-2 gap-2 text-center">
              {standingLine && (
                <div className="bg-bg-soft rounded-xl p-3 border-2 border-border">
                  <div className="text-2xl font-extrabold text-primary tabular-nums">#{standingLine.pos}</div>
                  <div className="text-xs text-ink-muted font-bold">בבית · {standingLine.pts} נק׳</div>
                </div>
              )}
              {championPicks.total > 0 && (
                <div className="bg-bg-soft rounded-xl p-3 border-2 border-border">
                  <div className="text-2xl font-extrabold text-accent-text tabular-nums">{championPicks.count}</div>
                  <div className="text-xs text-ink-muted font-bold">🏆 ניחשו לאליפות</div>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-extrabold text-ink mb-2">משחקים</h3>
            <div className="space-y-2">
              {fixtures.length === 0 ? (
                <p className="text-sm text-ink-muted font-bold text-center py-4">אין משחקים להצגה</p>
              ) : (
                fixtures.map((f) => (
                  <TeamFixtureRow key={f.match.id} match={f.match} result={f.result} derived={f.derived} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamModalProvider({ children }: { children: any }) {
  const [teamCode, setTeamCode] = useState<string | null>(null);
  const openTeam = useCallback((code: string) => {
    if (code) setTeamCode(code);
  }, []);
  const close = useCallback(() => setTeamCode(null), []);

  return (
    <TeamModalContext.Provider value={openTeam}>
      {children}
      {teamCode && <TeamModalBody teamCode={teamCode} onClose={close} />}
    </TeamModalContext.Provider>
  );
}

// Returns a function `openTeam(code)`. Safe no-op when no provider is mounted
// (e.g. isolated component tests) so callers never need to null-check.
export function useTeamModal(): TeamModalFn {
  const ctx = useContext(TeamModalContext);
  return ctx || (() => {});
}
