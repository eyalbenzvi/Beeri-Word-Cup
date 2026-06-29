// The ONE place a knockout extra-time / penalty result is described, so every
// surface (results page, bracket, blog, recently-finished) tells the same story
// in the same words. Replaces the ad-hoc "(פנדלים: X)" / "בעיטות הכרעה: X"
// snippets that were duplicated — and worded differently — across files.
//
// It renders NOTHING for a plain result (group game, or a knockout decided in
// regulation): there is no extra story to tell, and a regular win must never
// sprout an empty penalties row. It only appears once a tie at 90' was carried
// to extra time or penalties.
//
// Scores render through <Score>/<bdi> (RTL correctness — a bare "4-3" string
// visually swaps the leader in a Hebrew context). Copy comes from RESULT in
// constants/messages. Points are never involved here — this is the 90' tie's
// epilogue, with zero scoring meaning.

import Score from "./Score";
import { getTeamByCode } from "../data/teams";
import { getResultDecision, DECIDED_BY } from "../utils/resultBreakdown";
import { RESULT } from "../constants/messages";

type Variant = "full" | "inline" | "badge" | "line";

function teamName(code: string | null): string | null {
  if (!code) return null;
  return getTeamByCode(code)?.name || code;
}

// One labelled "label  away–home" row (used by the full variant).
function Row({ label, home, away }: { label: string; home: number; away: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <Score home={home} away={away} className="tabular-nums font-bold text-ink" />
    </div>
  );
}

export default function ResultBreakdown({
  result,
  variant = "full",
  className = "",
}: {
  result: any;
  variant?: Variant;
  className?: string;
}) {
  const d = getResultDecision(result);
  // Only knockout ties carried beyond 90' have anything to add.
  if (!d.played || !d.isKnockoutTie) return null;

  const winnerName = teamName(d.advancingTeam);
  const isPens = d.decidedBy === DECIDED_BY.PENALTIES;
  const isET = d.decidedBy === DECIDED_BY.EXTRA_TIME;
  // Legacy / pre-feature ties carry an advancing team but no record of HOW it
  // was decided. We must NEVER guess "extra time" or "penalties" for them —
  // they show only the neutral "עלתה: X".
  const known = isPens || isET;

  // The single decisive line used by the compact variants: the shootout for
  // penalties, the aggregate for extra time. Only meaningful when we know how.
  const decisive = isPens ? d.pens : isET ? d.et : null;
  const decisiveLabel = isPens ? RESULT.penalties : RESULT.afterET;
  const tag = isPens ? RESULT.tagPens : RESULT.tagET;

  // Accessibility: a single spoken sentence summarising the whole epilogue.
  const ariaLabel = (() => {
    if (!winnerName) return undefined;
    const how = isPens ? RESULT.decidedInPens : isET ? RESULT.decidedInET : "";
    // Spoken summary uses logical home–away order (the visible <Score> handles
    // the RTL visual flip separately).
    const nums = decisive ? ` ${decisive.home}–${decisive.away}` : "";
    return `${RESULT.advanced(winnerName)}${how ? `, ${how}${nums}` : ""}`;
  })();

  // ---- BADGE: bracket cell. Tiny — tag + decisive score. For a legacy tie of
  // unknown kind we render nothing (the parent already bolds the winner), since
  // a fabricated "הארכה" tag would be a lie. ----
  if (variant === "badge") {
    if (!known) return null;
    return (
      <div
        className={`text-3xs text-ink-light text-center mt-1 ${className}`}
        aria-label={ariaLabel}
      >
        <span className="font-bold">{tag}</span>
        {decisive && (
          <>
            {" "}
            <Score home={decisive.home} away={decisive.away} className="tabular-nums" />
          </>
        )}
      </div>
    );
  }

  // ---- INLINE / LINE: blog + recently-finished. One muted sentence. ----
  if (variant === "inline" || variant === "line") {
    return (
      <span
        className={`text-ink-muted font-bold ${variant === "inline" ? "text-xs" : "text-3xs"} ${className}`}
        aria-label={ariaLabel}
      >
        {known && (
          <>
            {decisive ? (
              <>
                {decisiveLabel}{" "}
                <Score home={decisive.home} away={decisive.away} className="tabular-nums" />
              </>
            ) : (
              tag
            )}
            {winnerName && " · "}
          </>
        )}
        {winnerName && RESULT.advanced(winnerName)}
      </span>
    );
  }

  // ---- FULL: results page. Stacked rows + a prominent winner line. The 90'
  // scoreline is shown by the host card, so we don't repeat it here. ----
  return (
    <div
      className={`mt-2 pt-2 border-t border-border text-xs space-y-1 ${className}`}
      aria-label={ariaLabel}
    >
      {d.et && <Row label={RESULT.afterET} home={d.et.home} away={d.et.away} />}
      {d.pens && <Row label={RESULT.penalties} home={d.pens.home} away={d.pens.away} />}
      {winnerName && (
        <div className="text-center font-extrabold text-primary-dark pt-0.5">
          {RESULT.advanced(winnerName)}
          {/* Known kind but missing exact numbers -> show the qualifier; a
              legacy tie of UNKNOWN kind shows no qualifier (never guess). */}
          {known && d.numbersMissing && (
            <span className="text-ink-muted font-bold">
              {" "}
              ({isPens ? RESULT.tagPens : RESULT.tagET})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
