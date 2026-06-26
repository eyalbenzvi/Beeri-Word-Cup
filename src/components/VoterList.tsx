import { useState } from "react";
import { useNavigation } from "../hooks/useNavigation";
import ClickableName from "./ClickableName";
import { getTeamByCode } from "../data/teams";
import type { Voter } from "../utils/matchPredictionStats";

// Compact "advances on penalties" chip shown next to a voter whose knockout
// prediction was a tie. Without it a level score (e.g. 1-1) leaves the reader
// guessing which team the form sent through. The ⬆ + flag keeps it glanceable
// inside the scrollable voter list; the team name is the source of truth.
function AdvancingChip({ teamCode }: { teamCode: string }) {
  const team = getTeamByCode(teamCode);
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 text-3xs font-extrabold rounded-full px-2 py-0.5 border border-secondary/40 text-secondary"
      style={{ background: "var(--color-secondary-soft)" }}
      title="עולה בבעיטות הכרעה"
    >
      <span aria-hidden="true">⬆</span>
      {team?.flag} {team?.name || teamCode}
    </span>
  );
}

// Shared "who predicted this?" primitives. Extracted from Stats.tsx so the
// admin "מידע ונתונים" tab can reuse the exact same clickable-bar + voter-list
// UX without duplicating it. Stats and AdminInsightsTab both import from here.

// A single distribution bar: label · filled track · percentage.
export function Bar({
  label,
  count,
  total,
  color = "bg-primary",
}: {
  label: React.ReactNode;
  count: number;
  total: number;
  color?: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const width = count > 0 ? Math.max(pct, 8) : 0;
  // A narrow fill can't contain the count label without clipping it —
  // below this width the count renders on the track, past the fill's tip.
  const countFitsInside = width >= 25;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-right text-ink font-bold truncate">
        {label}
      </span>
      <div className="relative flex-1 bg-bg-soft rounded-full h-6 overflow-hidden border border-border">
        <div
          className={`${color} h-full rounded-full transition-all duration-500 flex items-center justify-end px-2`}
          style={{ width: `${width}%` }}
        >
          {countFitsInside && (
            <span className="text-white text-xs font-extrabold">{count}</span>
          )}
        </div>
        {!countFitsInside && count > 0 && (
          <span
            className="absolute inset-y-0 flex items-center px-2 text-ink text-xs font-extrabold"
            style={{ insetInlineStart: `${width}%` }}
          >
            {count}
          </span>
        )}
      </div>
      <span className="w-10 text-left text-ink-muted text-xs font-bold">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// Scrollable list of the forms behind a given result/outcome/parameter. Each
// form name deep-links to its full view in the leaderboard.
export function VoterList({ voters }: { voters: Voter[] }) {
  const { navigate } = useNavigation();
  if (!voters || voters.length === 0) {
    return (
      <p className="text-xs text-ink-muted text-center py-2 font-bold">
        אין נתונים
      </p>
    );
  }
  return (
    <div className="mt-2 max-h-48 overflow-y-auto space-y-1 pl-1">
      {voters.map((v, i) => (
        <div
          key={`${v.formId}-${i}`}
          className="text-xs rounded-lg px-3 py-1.5 border border-border text-right font-bold text-ink flex items-center justify-between gap-2"
          style={{ background: "var(--color-bg-soft)" }}
        >
          <span className="min-w-0 truncate">
            {v.formId ? (
              <ClickableName onClick={() => navigate("leaderboard", { form: v.formId })}>
                {v.name || "טופס ללא שם"}
              </ClickableName>
            ) : (
              v.name || "טופס ללא שם"
            )}
          </span>
          {v.advancingTeam && <AdvancingChip teamCode={v.advancingTeam} />}
        </div>
      ))}
    </div>
  );
}

// A list of clickable distribution bars; tapping one expands an accordion
// listing the form names behind it. Shared by the champion/top-scorer
// breakdowns and the admin team/match insights so "who predicted this?" works
// identically across the app. `items` is pre-sorted: [{ key, label, voters, color }, ...].
export function VoterBarList({
  items,
  total,
}: {
  items: { key: string; label: React.ReactNode; voters: Voter[]; color?: string }[];
  total: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const open = expanded === item.key;
        return (
          <div key={item.key}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : item.key)}
              aria-expanded={open}
              className="w-full flex items-center gap-1.5 cursor-pointer"
            >
              <span
                className={`text-ink-muted text-xs transition-transform ${open ? "rotate-180" : ""}`}
              >
                ▾
              </span>
              <div className="flex-1">
                <Bar
                  label={item.label}
                  count={item.voters.length}
                  total={total}
                  color={item.color}
                />
              </div>
            </button>
            {open && <VoterList voters={item.voters} />}
          </div>
        );
      })}
    </div>
  );
}
