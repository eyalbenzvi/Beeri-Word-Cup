import { useMemo } from "react";
import { computeMatchStats } from "../utils/summaryStats";
import { getTeamByCode } from "../data/teams";
import { STAGES } from "../data/matches";
import { r32SlotLabel } from "../utils/matchSlot";
import ResultBreakdown from "./ResultBreakdown";
import { BLOG } from "../constants/messages";

// How many exact-hit names to show inline above the fold before
// collapsing the rest behind a "+N עוד" label. The full list still
// appears inside the <details> breakdown when expanded.
const EXACT_HITS_INLINE_CAP = 3;

function OutcomeBar({ pct, label, count, color }) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-extrabold mb-1">
        <span className="text-ink">{label}</span>
        <span className="text-ink-muted tabular-nums">
          {count} · {safePct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={safePct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full bg-bg-soft rounded-full h-2 overflow-hidden"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${safePct}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * Renders a single match block inside a daily-recap blog post.
 *
 * Visual model is a journalistic section — kicker → H2 → slim scoreline →
 * pull-quote → one-line stat strip → collapsed full breakdown — rather than
 * a self-contained card. Sections are separated by a hairline rule so the
 * page reads as continuous prose.
 */
export default function MatchDigest({
  match,
  result,
  note,
  allPredictions,
  users,
  actualBracketTeams,
  getFormBracketTeams,
}) {
  // Memo MUST be called unconditionally — keep it above the early return.
  // A missing `match` becomes a null id; computeMatchStats still returns
  // empty aggregates, which are never rendered because we bail below.
  // actualBracketTeams + getFormBracketTeams let computeMatchStats restrict a
  // knockout match to forms that predicted the correct matchup.
  const stats = useMemo(
    () =>
      computeMatchStats({
        matchId: match?.id || "",
        result,
        allPredictions,
        users,
        actualBracketTeams,
        getFormBracketTeams,
      }),
    [match?.id, result, allPredictions, users, actualBracketTeams, getFormBracketTeams],
  );

  if (!match) return null;

  // Knockout fixtures ship with null teams on the schedule object — the real
  // participants are only known once earlier rounds resolve. Prefer the actual
  // results-gated bracket slot (the same source Stats/Results use), then any
  // team codes stored on the result; this keeps a published knockout digest
  // showing the real teams instead of a "מנצחת 73" slot label.
  const actualSlot = actualBracketTeams?.[match.id];
  const homeCode = match.homeTeam || actualSlot?.home || result?.homeTeam || null;
  const awayCode = match.awayTeam || actualSlot?.away || result?.awayTeam || null;
  const home = homeCode ? getTeamByCode(homeCode) : null;
  const away = awayCode ? getTeamByCode(awayCode) : null;

  const homeWin = !!result && result.homeScore > result.awayScore;
  const awayWin = !!result && result.awayScore > result.homeScore;

  const stageLabel = STAGES[match.stage] || match.stage;
  const homeName =
    home?.name || r32SlotLabel(match, "home") || match.homeFrom || match.thirdFrom || "טרם נקבע";
  const awayName = away?.name || r32SlotLabel(match, "away") || match.awayFrom || "טרם נקבע";

  return (
    <section className="mt-10 pt-8 border-t border-border first:border-t-0 first:pt-0 first:mt-6">
      {/* Stage kicker */}
      <div className="text-xs font-extrabold text-secondary uppercase tracking-wider mb-1">
        {stageLabel}
        {match.group ? ` · בית ${match.group}` : ""}
      </div>

      {/* H2 — the section anchor. Flags omitted: the kicker carries stage,
          the slim scoreline carries the visual; flags here read as a
          scoreboard widget instead of prose. */}
      <h2 className="font-heading text-xl md:text-2xl font-extrabold text-ink leading-tight tracking-tight">
        {homeName}
        <span className="text-ink-light font-bold mx-2">נגד</span>
        {awayName}
      </h2>

      {/* Scoreline (slim) */}
      <div className="flex items-baseline gap-3 mt-2 text-2xl font-extrabold tabular-nums">
        <span className={homeWin ? "text-primary" : "text-ink-muted"}>
          {Number.isFinite(result?.homeScore) ? result.homeScore : "–"}
        </span>
        <span className="text-ink-light text-lg">—</span>
        <span className={awayWin ? "text-primary" : "text-ink-muted"}>
          {Number.isFinite(result?.awayScore) ? result.awayScore : "–"}
        </span>
        {result && <ResultBreakdown result={result} variant="inline" className="ms-2" />}
      </div>

      {/* Admin commentary — soft tinted callout. Text stays in default ink;
          the background colour alone carries the "writer's voice" signal,
          so we avoid both the colored prose and the side-rule decoration. */}
      {note && note.trim() && (
        <blockquote className="mt-5 rounded-2xl bg-primary-soft px-4 py-3 md:px-5 md:py-4 text-base md:text-lg leading-relaxed text-ink whitespace-pre-wrap">
          {note}
        </blockquote>
      )}

      {/* Exact-hit names — surfaced ABOVE the fold (formerly buried inside
          the collapsed <details>). The single most engaging element of the
          page: members seeing their name. Cap at 3 inline + "+N עוד" so a
          big-hit match doesn't run a 30-name line. The full list still
          appears inside the breakdown disclosure below. */}
      {result && stats.totalForms > 0 && (
        <div className="mt-4 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
          {stats.exactHitForms.length === 0 ? (
            <span className="text-ink-muted font-medium">
              {BLOG.public.exactHitsNone}
            </span>
          ) : (
            <>
              <span className="text-ink-muted font-bold">
                {BLOG.public.exactHitsLabel(stats.exactHitForms.length)}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {stats.exactHitForms.slice(0, EXACT_HITS_INLINE_CAP).map((f) => (
                  <span
                    key={f.formId}
                    className="text-xs font-extrabold bg-primary/10 text-primary-dark px-2 py-1 rounded-full truncate max-w-[180px]"
                  >
                    {f.formName}
                  </span>
                ))}
                {stats.exactHitForms.length > EXACT_HITS_INLINE_CAP && (
                  <span className="text-xs font-bold text-ink-muted px-2 py-1 self-center">
                    {BLOG.public.exactHitsMore(stats.exactHitForms.length - EXACT_HITS_INLINE_CAP)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* One-line stat strip — always visible, quiet */}
      {stats.totalForms > 0 && (
        <p className="mt-5 text-xs font-bold text-ink-muted tabular-nums flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="me-1">איך ניחשנו:</span>
          <span className="text-primary">בית {stats.outcomePct.home}%</span>
          <span aria-hidden="true">·</span>
          <span className="text-accent-text">תיקו {stats.outcomePct.draw}%</span>
          <span aria-hidden="true">·</span>
          <span className="text-secondary">חוץ {stats.outcomePct.away}%</span>
          {result && (
            <>
              <span aria-hidden="true">·</span>
              <span>{stats.outcomeHitCount} הכרעות</span>
              <span aria-hidden="true">·</span>
              <span>{stats.exactHitCount} מדויקים</span>
            </>
          )}
          <span className="text-ink-light">({stats.totalForms} טפסים)</span>
        </p>
      )}

      {/* Full breakdown — collapsed by default for everyone */}
      {stats.totalForms > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-xs font-extrabold text-secondary inline-flex items-center gap-1 select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">כל הנתונים ›</span>
            <span className="hidden group-open:inline">סגור נתונים ‹</span>
          </summary>

          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <OutcomeBar
                label={home ? `ניצחון ${home.name}` : "בית"}
                count={stats.outcomeCounts.home}
                pct={stats.outcomePct.home}
                color="var(--color-primary)"
              />
              <OutcomeBar
                label="תיקו"
                count={stats.outcomeCounts.draw}
                pct={stats.outcomePct.draw}
                color="var(--color-accent)"
              />
              <OutcomeBar
                label={away ? `ניצחון ${away.name}` : "חוץ"}
                count={stats.outcomeCounts.away}
                pct={stats.outcomePct.away}
                color="var(--color-secondary)"
              />
            </div>

            {stats.topScores.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-extrabold text-ink-muted mb-1">
                  התוצאות הנפוצות בניחושים:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.topScores.map((ts) => (
                    <span
                      key={ts.score}
                      className="text-xs font-extrabold bg-bg-soft text-ink px-2 py-1 rounded-full tabular-nums"
                    >
                      {ts.score} · {ts.pct}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {stats.exactHitForms.length > EXACT_HITS_INLINE_CAP && (
              <div className="pt-1">
                <p className="text-xs font-extrabold text-ink-muted mb-1">
                  כל מי שקלע בדיוק:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.exactHitForms.map((f) => (
                    <span
                      key={f.formId}
                      className="text-xs font-bold bg-primary/10 text-primary-dark px-2 py-1 rounded-full truncate max-w-[180px]"
                    >
                      {f.formName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
