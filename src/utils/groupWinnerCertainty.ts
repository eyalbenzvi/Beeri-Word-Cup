// Early certainty of the GROUP WINNER (1st place).
//
// In the 48-team / 12-group format every group is a 4-team round-robin (6
// matches over 3 matchdays). A team can mathematically clinch 1st place before
// the group finishes — typically after matchday 2, when 4 of 6 matches are
// played and every team has one game left. This module detects, from partial
// actual results, which groups have a winner whose 1st-place finish is already
// guaranteed, so the bracket can show that team in its R32 "1X" slot early
// (see calcBracketTeams in bracket.ts).
//
// FIFA 2026 GROUP TIEBREAKERS (this is a CHANGE from earlier tournaments):
//   1. points
//   2. HEAD-TO-HEAD points  ┐ among the teams level on (1)
//   3. head-to-head GD       │  ← head-to-head now ranks ABOVE overall GD
//   4. head-to-head GF       ┘
//   5. overall GD
//   6. overall GF
//   7. disciplinary (fair-play) points
//   8. FIFA/Coca-Cola World Ranking, then drawing of lots  (this codebase uses
//      the deterministic FIFA ranking, mirroring calcGroupStandings — see
//      bracket.ts sortTiedGroup)
//
// Because head-to-head POINTS now outrank overall goal difference, a winner can
// be clinched early even while a rival could still draw LEVEL on points — as long
// as the leader has already beaten, head-to-head, every rival that can still
// reach its total. (Real example: 2026 Group J — Argentina beat Algeria and
// Austria, so after matchday 2 it had 6 pts; Jordan could not reach 6, and
// whichever of Algeria/Austria might reach 6 had already lost to Argentina
// head-to-head, so Argentina had clinched 1st before matchday 3.)
//
// SOUNDNESS IS THE CONTRACT: never declare a winner that some valid completion
// of the unplayed matches could overturn.
//
// HOW WE STAY SOUND OVER UNBOUNDED MARGINS. Goal counts in the remaining matches
// are unbounded, so any tiebreaker that depends on goals (head-to-head GD/GF,
// overall GD/GF) cannot be relied on while a match is unplayed. We therefore only
// ever decide 1st place by the two MARGIN-INDEPENDENT criteria — POINTS and
// HEAD-TO-HEAD POINTS — both of which depend only on match OUTCOMES (W/D/L), not
// scorelines. We enumerate every outcome-completion of the unplayed matches
// (3^k, k ≤ 6 ⇒ ≤ 729) and, in each, identify the winner ONLY when it is decided
// by points or head-to-head points:
//   • unique most points                                  → that team wins, OR
//   • tied on most points but UNIQUE most head-to-head     → that team wins, ELSE
//   • the top is still level on head-to-head points        → undecided here
//     (a goal-based criterion would decide it, and goals are unbounded).
// A group's winner is certain iff EVERY outcome-completion yields the SAME such
// winner. If any completion is undecided or names a different team, we declare
// nothing — conservative: at worst a true clinch surfaces a match late, never a
// wrong one. The winner we return is always the team calcGroupStandings (same
// tiebreaker order) will rank 1st once the group completes, in every completion.

import { GROUPS } from "../data/teams";
import { groupMatches } from "../data/matches";
import { isScoreValid } from "./helpers";

const GROUP_NAMES = Object.keys(GROUPS);

// Pre-grouped match list so the hot path doesn't re-filter the 72-match array.
const GROUP_MATCHES: Record<string, Array<{ id: string; homeTeam: string; awayTeam: string }>> = {};
for (const g of GROUP_NAMES) GROUP_MATCHES[g] = [];
for (const m of groupMatches) {
  if (GROUP_MATCHES[m.group]) GROUP_MATCHES[m.group].push(m);
}

// A match reduced to its OUTCOME (margins are deliberately discarded — see the
// soundness note above): result ∈ { "H" home win, "A" away win, "D" draw }.
type OutcomeMatch = { home: string; away: string; result: "H" | "A" | "D" };

// The team that 1st place is decided to belong to in a single fully-determined
// (outcome-wise) group, using ONLY points then head-to-head points. Returns the
// winner's code, or null when the top is still level on both (a goal-based
// tiebreaker — unbounded while matches remain — would be needed).
function pointsHeadToHeadWinner(codes: string[], matches: OutcomeMatch[]): string | null {
  const award = (acc: Record<string, number>, m: OutcomeMatch) => {
    if (m.result === "H") acc[m.home] += 3;
    else if (m.result === "A") acc[m.away] += 3;
    else {
      acc[m.home] += 1;
      acc[m.away] += 1;
    }
  };

  const pts: Record<string, number> = {};
  for (const c of codes) pts[c] = 0;
  for (const m of matches) award(pts, m);

  let maxPts = -1;
  for (const c of codes) if (pts[c] > maxPts) maxPts = pts[c];
  const topSet = codes.filter((c) => pts[c] === maxPts);
  if (topSet.length === 1) return topSet[0];

  // Tied on points → head-to-head POINTS among exactly the tied set.
  const set = new Set(topSet);
  const h2h: Record<string, number> = {};
  for (const c of topSet) h2h[c] = 0;
  for (const m of matches) {
    if (!set.has(m.home) || !set.has(m.away)) continue;
    award(h2h, m);
  }
  let maxH2H = -1;
  for (const c of topSet) if (h2h[c] > maxH2H) maxH2H = h2h[c];
  const h2hLeaders = topSet.filter((c) => h2h[c] === maxH2H);
  if (h2hLeaders.length === 1) return h2hLeaders[0];

  return null; // undecided without a goal-based tiebreaker
}

/**
 * Groups whose 1st-place team is mathematically guaranteed from partial results.
 *
 * @param results match-id → { homeScore, awayScore, ... } (any subset played).
 * @returns map of group letter → certain winner's team code. A group is absent
 *          unless its winner is clinched. Soundness: every returned team is the
 *          1st-placed team in EVERY outcome-completion of that group's unplayed
 *          matches, decided by points / head-to-head points alone.
 */
export function computeCertainGroupWinners(
  results: Record<string, any>,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const g of GROUP_NAMES) {
    const matches = GROUP_MATCHES[g];
    if (!matches || matches.length === 0) continue;

    const codes = GROUPS[g as keyof typeof GROUPS].map((t) => t.code);
    const played: OutcomeMatch[] = [];
    const remaining: Array<{ home: string; away: string }> = [];

    for (const m of matches) {
      const pred = results[m.id];
      const h = pred ? Number(pred.homeScore) : NaN;
      const a = pred ? Number(pred.awayScore) : NaN;
      if (isScoreValid(pred) && Number.isFinite(h) && Number.isFinite(a)) {
        played.push({
          home: m.homeTeam,
          away: m.awayTeam,
          result: h > a ? "H" : a > h ? "A" : "D",
        });
      } else {
        remaining.push({ home: m.homeTeam, away: m.awayTeam });
      }
    }
    if (played.length === 0) continue; // nothing decided yet

    // Enumerate every outcome-completion of the unplayed matches (3^k). The
    // winner is certain iff all completions agree on a points/H2H-decided team.
    const k = remaining.length;
    const total = 3 ** k;
    let winner: string | null | undefined = undefined;
    let certain = true;
    const RESULTS: Array<"H" | "A" | "D"> = ["H", "A", "D"];

    for (let mask = 0; mask < total; mask++) {
      const all = played.slice();
      let tmp = mask;
      for (const r of remaining) {
        const o = tmp % 3;
        tmp = Math.floor(tmp / 3);
        all.push({ home: r.home, away: r.away, result: RESULTS[o] });
      }
      const w = pointsHeadToHeadWinner(codes, all);
      if (w === null) {
        certain = false;
        break;
      }
      if (winner === undefined) winner = w;
      else if (winner !== w) {
        certain = false;
        break;
      }
    }

    if (certain && winner) out[g] = winner;
  }

  return out;
}
