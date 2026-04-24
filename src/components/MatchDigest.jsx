import { computeMatchStats } from "../utils/summaryStats";
import { getTeamByCode } from "../data/teams";
import { STAGES } from "../data/matches";

function TeamRow({ team, score, isWinner, placeholder }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-2xl flex-shrink-0" aria-hidden="true">
          {team?.flag || "🏳️"}
        </span>
        <span className={`text-base font-bold ${team ? "text-ink" : "text-ink-light italic"} truncate`}>
          {team?.name || placeholder || "טרם נקבע"}
        </span>
      </div>
      <span
        className={`text-3xl font-extrabold tabular-nums ${
          isWinner ? "text-primary" : "text-ink-muted"
        }`}
      >
        {Number.isFinite(score) ? score : "–"}
      </span>
    </div>
  );
}

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
      <div className="w-full bg-bg-soft rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${safePct}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * Renders a single match block inside a daily summary.
 * Computes per-match stats on the fly from allPredictions, so any later
 * result correction is reflected automatically on the next render.
 */
export default function MatchDigest({
  match,
  result,
  note,
  allPredictions,
  users,
}) {
  if (!match) return null;

  const home = match.homeTeam ? getTeamByCode(match.homeTeam) : null;
  const away = match.awayTeam ? getTeamByCode(match.awayTeam) : null;
  const stats = computeMatchStats({
    matchId: match.id,
    result,
    allPredictions,
    users,
  });

  const homeWin = !!result && result.homeScore > result.awayScore;
  const awayWin = !!result && result.awayScore > result.homeScore;

  // Stage tag is useful when a summary mixes group + knockout matches
  const stageLabel = STAGES[match.stage] || match.stage;

  return (
    <div className="card-duo space-y-3">
      {/* Header: stage, venue, date */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-extrabold text-secondary uppercase tracking-wider">
          {stageLabel}
          {match.group ? ` · בית ${match.group}` : ""}
        </span>
        <span className="text-[11px] text-ink-muted font-medium">
          {[match.date, match.time, match.venue].filter(Boolean).join(" · ")}
        </span>
      </div>

      {/* Scoreline */}
      <div>
        <TeamRow
          team={home}
          score={result?.homeScore}
          isWinner={homeWin}
          placeholder={match.homeFrom || match.thirdFrom}
        />
        <div className="h-px bg-border" />
        <TeamRow
          team={away}
          score={result?.awayScore}
          isWinner={awayWin}
          placeholder={match.awayFrom}
        />
        {result && result.homeScore === result.awayScore && result.advancingTeam && (
          <div className="text-xs text-ink-muted text-center mt-2 pt-2 border-t border-border font-bold">
            בעיטות הכרעה: {getTeamByCode(result.advancingTeam)?.name || result.advancingTeam}
          </div>
        )}
      </div>

      {/* Admin's commentary */}
      {note && note.trim() && (
        <div
          className="rounded-2xl p-3 text-sm leading-relaxed text-ink whitespace-pre-wrap border-2"
          style={{
            background: "var(--color-primary-soft)",
            borderColor: "var(--color-primary)",
          }}
        >
          {note}
        </div>
      )}

      {/* Stats breakdown */}
      {stats.totalForms > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-extrabold text-ink">
            איך ניחשנו ({stats.totalForms} טפסים):
          </p>
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

          {result && (
            <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
              <span
                className="font-extrabold px-2 py-1 rounded-full"
                style={{
                  background: "var(--color-primary-soft)",
                  color: "var(--color-primary-dark)",
                }}
              >
                {stats.outcomeHitCount} קלעו את ההכרעה
              </span>
              <span
                className="font-extrabold px-2 py-1 rounded-full"
                style={{
                  background: "var(--color-accent-soft-2)",
                  color: "var(--color-accent-text)",
                }}
              >
                {stats.exactHitCount} קלעו תוצאה מדויקת
              </span>
            </div>
          )}

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

          {stats.exactHitForms.length > 0 && stats.exactHitForms.length <= 8 && (
            <div className="pt-1">
              <p className="text-xs font-extrabold text-ink-muted mb-1">
                מי קלע בדיוק:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stats.exactHitForms.map((f) => (
                  <span
                    key={f.formId}
                    className="text-xs font-bold bg-primary/10 text-primary-dark px-2 py-1 rounded-full truncate max-w-[180px]"
                  >
                    {f.userName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
