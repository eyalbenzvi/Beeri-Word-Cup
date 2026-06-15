import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  useAllPredictions,
  useMatchResults,
  useUserDirectory,
  useActualBonuses,
  useCurrentUser,
  useSettings,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { getTeamByCode } from "../data/teams";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";
import Score from "./Score";

const allMatchesMap = Object.fromEntries(
  [...groupMatches, ...knockoutMatches].map((m) => [m.id, m]),
);

// Head-to-head comparison of two forms (#3): top-line stats plus a per-played-
// match breakdown showing each form's prediction and points, with a running
// "who's ahead per match" tally. The opponent defaults to the current leader
// (or #2 if the viewed form IS the leader); the user can switch it to their
// own best form when relevant.
function StatCell({ label, a, b }: { label: string; a: any; b: any }) {
  const aWins = typeof a === "number" && typeof b === "number" && a > b;
  const bWins = typeof a === "number" && typeof b === "number" && b > a;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 border-b border-border text-sm">
      <div className={`text-right font-extrabold tabular-nums ${aWins ? "text-primary" : "text-ink"}`}>{a}</div>
      <div className="text-[10px] text-ink-muted font-bold whitespace-nowrap">{label}</div>
      <div className={`text-left font-extrabold tabular-nums ${bWins ? "text-secondary" : "text-ink"}`}>{b}</div>
    </div>
  );
}

export default function FormComparison({ formAId, onClose }: { formAId: string; onClose: () => void }) {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUserDirectory();
  const actualBonuses = useActualBonuses();
  const settings = useSettings();
  const playerList = useMemo(() => resolvePlayerList(settings.topScorerPlayers), [settings.topScorerPlayers]);

  const { rankedLeaderboard, scoredForms, formBracketMap, actualBracket } =
    useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  // Candidate opponents: the leader (skipping self) and the user's own best
  // form (skipping self). De-duplicated, in that order.
  const opponents = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const leader = rankedLeaderboard.find((e) => e.formId !== formAId);
    if (leader) out.push({ id: leader.formId, label: `המוביל (#${leader.rank})` });
    if (user?.id) {
      const myBest = rankedLeaderboard.find((e) => e.userId === user.id && e.formId !== formAId);
      if (myBest && !out.some((o) => o.id === myBest.formId)) {
        out.push({ id: myBest.formId, label: `הטופס שלי (#${myBest.rank})` });
      }
    }
    return out;
  }, [rankedLeaderboard, formAId, user?.id]);

  const [formBId, setFormBId] = useState<string | null>(opponents[0]?.id || null);
  const effectiveBId = formBId && opponents.some((o) => o.id === formBId) ? formBId : opponents[0]?.id || null;

  const scoredA = scoredForms.find((e) => e.formId === formAId);
  const scoredB = scoredForms.find((e) => e.formId === effectiveBId);
  const rankA = rankedLeaderboard.find((e) => e.formId === formAId)?.rank;
  const rankB = rankedLeaderboard.find((e) => e.formId === effectiveBId)?.rank;
  const predA = allPredictions[formAId];
  const predB = effectiveBId ? allPredictions[effectiveBId] : null;

  // Per-played-match breakdown + tally.
  const { rows, tally } = useMemo(() => {
    const playedIds = Object.keys(results);
    const rowsOut: any[] = [];
    let aWins = 0, bWins = 0, ties = 0;
    for (const id of playedIds) {
      const match = allMatchesMap[id];
      const result = results[id];
      const aPts = scoredA?.matchScores?.[id]?.points || 0;
      const bPts = scoredB?.matchScores?.[id]?.points || 0;
      const aPred = predA?.matches?.[id];
      const bPred = predB?.matches?.[id];
      if (aPred == null && bPred == null) continue;
      if (aPts > bPts) aWins++;
      else if (bPts > aPts) bWins++;
      else ties++;
      // Resolve teams (group from data, knockout from the actual bracket).
      const isKo = match?.stage && match.stage !== "group";
      const homeCode = isKo ? (result.homeTeam || actualBracket[id]?.home) : match?.homeTeam;
      const awayCode = isKo ? (result.awayTeam || actualBracket[id]?.away) : match?.awayTeam;
      rowsOut.push({
        id,
        stage: match?.stage || "group",
        home: getTeamByCode(homeCode)?.name || "?",
        away: getTeamByCode(awayCode)?.name || "?",
        result,
        aPred, bPred, aPts, bPts,
      });
    }
    return { rows: rowsOut, tally: { aWins, bWins, ties } };
  }, [results, scoredA, scoredB, predA, predB, actualBracket]);

  if (!effectiveBId || !scoredB) {
    return (
      <div className="card-duo mb-4">
        <button onClick={onClose} className="text-sm text-secondary mb-2 flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0">
          <ArrowRight size={16} aria-hidden="true" /> סגור השוואה
        </button>
        <p className="text-sm text-ink-muted font-bold text-center py-4">אין טופס נוסף להשוואה</p>
      </div>
    );
  }

  const nameA = predA?.formName || "טופס א׳";
  const nameB = predB?.formName || "טופס ב׳";
  const champA = formBracketMap[formAId]?.champion;
  const champB = formBracketMap[effectiveBId]?.champion;

  return (
    <div className="card-duo mb-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-sm text-secondary flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0 hover:text-secondary-dark">
          <ArrowRight size={16} aria-hidden="true" /> סגור השוואה
        </button>
        {opponents.length > 1 && (
          <div className="flex gap-1.5">
            {opponents.map((o) => (
              <button
                key={o.id}
                onClick={() => setFormBId(o.id)}
                aria-pressed={effectiveBId === o.id}
                className={`chip-duo ${effectiveBId === o.id ? "active-blue" : ""}`}
                style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Names header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-2 text-sm font-extrabold">
        <div className="text-right text-primary truncate">{nameA}{rankA ? ` · #${rankA}` : ""}</div>
        <div className="text-[10px] text-ink-muted">מול</div>
        <div className="text-left text-secondary truncate">{nameB}{rankB ? ` · #${rankB}` : ""}</div>
      </div>

      <StatCell label="נקודות" a={scoredA?.totalPoints || 0} b={scoredB?.totalPoints || 0} />
      <StatCell label="מדויקות" a={scoredA?.exactScoreCount || 0} b={scoredB?.exactScoreCount || 0} />
      <StatCell label="תוצאה" a={scoredA?.outcomeCount || 0} b={scoredB?.outcomeCount || 0} />
      <StatCell
        label="אלופה"
        a={champA ? getTeamByCode(champA)?.name || "—" : "—"}
        b={champB ? getTeamByCode(champB)?.name || "—" : "—"}
      />
      <StatCell
        label="מלך שערים"
        a={predA?.topScorer ? getPlayerDisplayName(predA.topScorer, playerList) : "—"}
        b={predB?.topScorer ? getPlayerDisplayName(predB.topScorer, playerList) : "—"}
      />

      {/* Per-match tally */}
      {rows.length > 0 && (
        <>
          <div className="text-xs font-bold text-ink-muted mt-3 mb-2 text-center">
            ניצח במשחק: <span className="text-primary font-extrabold">{tally.aWins}</span>
            {" · "}תיקו: <span className="font-extrabold">{tally.ties}</span>
            {" · "}<span className="text-secondary font-extrabold">{tally.bWins}</span>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-2 text-xs bg-bg-soft">
                <div className="flex justify-between items-center text-ink-muted mb-1">
                  <span className="font-bold truncate">{r.home} נגד {r.away}</span>
                  <span className="font-extrabold text-ink whitespace-nowrap">
                    <Score home={r.result.homeScore} away={r.result.awayScore} />
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className={`text-right ${r.aPts > r.bPts ? "text-primary font-extrabold" : "text-ink-muted"}`}>
                    {r.aPred ? <Score home={r.aPred.homeScore} away={r.aPred.awayScore} /> : "—"} ({r.aPts})
                  </div>
                  <div className="text-[10px] text-ink-light">נק׳</div>
                  <div className={`text-left ${r.bPts > r.aPts ? "text-secondary font-extrabold" : "text-ink-muted"}`}>
                    {r.bPred ? <Score home={r.bPred.homeScore} away={r.bPred.awayScore} /> : "—"} ({r.bPts})
                  </div>
                </div>
                {r.stage !== "group" && (
                  <div className="text-[10px] text-ink-light text-center mt-1">{STAGES[r.stage] || r.stage}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
