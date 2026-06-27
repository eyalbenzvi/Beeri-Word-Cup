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
// SOUNDNESS IS THE CONTRACT: never declare a winner that some valid completion
// of the unplayed matches could overturn. Where information is missing we stay
// conservative — at worst a true clinch is surfaced a match or two late, never a
// wrong one.
//
// THE CRITERION — strict points domination:
//   Team X is the certain group winner ⇔ X.currentPoints > Y.currentPoints +
//   3 × Y.remainingMatches  for EVERY other team Y in the group.
//
// Why this is the right (and only sound) early test while matches remain:
//   • A team's own points depend only on its own results, so Y.maxPoints =
//     Y.current + 3·Y.remaining is an exact, independent upper bound and
//     X.minPoints = X.current (X may lose its remaining game). If X.current
//     beats every rival's max, X finishes strictly top on POINTS ALONE in every
//     completion — tiebreakers never even engage, so no false positive. This
//     holds even when X and Y still meet (X losing that game IS Y winning it,
//     already inside Y.max).
//   • Strict ">" is required: a possible POINTS TIE throws the group to FIFA
//     tiebreakers — overall goal difference, then overall goals for — both
//     UNBOUNDED while any match is unplayed (a remaining game can be won by any
//     margin). So a team that can merely draw level on points cannot be
//     separated with certainty and must not be declared a winner.
//
// DELIBERATELY NOT DETECTED: a winner could in rare cases be secured early via a
// head-to-head result even while a rival can still draw level on points. We do
// NOT detect these — proving them requires sweeping every completion against the
// full tiebreaker chain (overall GD/GF first, then H2H), and this game records
// no fair-play/disciplinary data (a real FIFA tiebreaker step), so a knife-edge
// case may be genuinely unresolvable. Conservative-by-design: such clinches are
// simply surfaced once the group completes, never declared wrong.
//
// (For reference, FIFA 2026 group tiebreakers in order: points → overall GD →
// overall GF → head-to-head pts/GD/GF → fair-play points → drawing of lots. This
// codebase substitutes the deterministic FIFA ranking for the final lots draw,
// but the winner-clinch test above never reaches any tiebreaker by construction.)

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

/**
 * Groups whose 1st-place team is mathematically guaranteed from partial results.
 *
 * @param results match-id → { homeScore, awayScore, ... } (any subset played).
 * @returns map of group letter → certain winner's team code. A group is absent
 *          unless its winner is clinched. Soundness: every returned team finishes
 *          1st in EVERY completion of that group's unplayed matches.
 */
export function computeCertainGroupWinners(
  results: Record<string, any>,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const g of GROUP_NAMES) {
    const matches = GROUP_MATCHES[g];
    if (!matches || matches.length === 0) continue;

    const codes = GROUPS[g as keyof typeof GROUPS].map((t) => t.code);
    const pts: Record<string, number> = {};
    const remaining: Record<string, number> = {};
    for (const c of codes) {
      pts[c] = 0;
      remaining[c] = 0;
    }

    let anyPlayed = false;
    for (const m of matches) {
      const pred = results[m.id];
      if (isScoreValid(pred)) {
        anyPlayed = true;
        const h = Number(pred.homeScore);
        const a = Number(pred.awayScore);
        if (h > a) pts[m.homeTeam] += 3;
        else if (a > h) pts[m.awayTeam] += 3;
        else {
          pts[m.homeTeam] += 1;
          pts[m.awayTeam] += 1;
        }
      } else {
        remaining[m.homeTeam] += 1;
        remaining[m.awayTeam] += 1;
      }
    }
    if (!anyPlayed) continue; // nothing decided yet

    // Unique points leader is the only possible certain winner.
    let leader: string | null = null;
    let uniqueMax = false;
    for (const c of codes) {
      if (leader === null || pts[c] > pts[leader]) {
        leader = c;
        uniqueMax = true;
      } else if (pts[c] === pts[leader]) {
        uniqueMax = false;
      }
    }
    if (!leader || !uniqueMax) continue;

    // Strict points domination: leader's current points exceed every rival's
    // best reachable points (current + 3 per remaining match).
    let clinched = true;
    for (const c of codes) {
      if (c === leader) continue;
      if (pts[leader] <= pts[c] + 3 * remaining[c]) {
        clinched = false;
        break;
      }
    }
    if (clinched) out[g] = leader;
  }

  return out;
}
