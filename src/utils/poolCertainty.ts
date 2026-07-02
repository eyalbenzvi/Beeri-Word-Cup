/**
 * Deterministic certainty layer for the competition-analysis page.
 *
 * Pure — no React, no Firebase. Answers, with MATHEMATICAL soundness (never
 * a probability), three questions per form:
 *   - is rank 1 still reachable? ("עדיין בחיים במרוץ לזכייה")
 *   - is a top-N finish already guaranteed? ("מובטח")
 *   - what's the current dense rank / points?
 *
 * SOUNDNESS CONTRACT (mirrors groupWinnerCertainty.ts): never claim
 * clinched/eliminated when some valid completion of the remaining matches
 * could overturn it. We only use an UPPER BOUND on remaining points — a
 * loose OVER-estimate is sound for both claim types:
 *   - eliminated(i):  ∃j: points(j) > points(i) + maxRemaining(i)
 *     (over-estimating maxRemaining(i) only makes us less likely to claim)
 *   - clinchedTopN(i): #{j≠i: points(j) + maxRemaining(j) ≥ points(i)} ≤ N−1
 *     (over-estimating maxRemaining(j) only makes us less likely to claim;
 *      ties count AGAINST the claim because future tiebreakers are unknowable)
 *
 * Current scores come from the CANONICAL leaderboard path (computeCore /
 * computeScoredForms in leaderboardCore.ts) — never re-implemented here.
 *
 * NOTE on the bound: bestCase.ts has a module-private maxRemainingPts used
 * for search pruning. It is deliberately NOT reused here because (a) it is
 * private and bestCase.ts must not be modified, and (b) it omits the
 * top-scorer bonus and skips advancing points for unpredicted matches —
 * fine for pruning, unsound for "clinched" claims. The bound below is
 * defended by a fuzz test (poolCertainty.test.ts) asserting no completion
 * can ever exceed it.
 */

import { POINTS, BONUSES } from "./scoring";
import { computeCore, assignDenseRanks, type ScoredForm } from "./leaderboardCore";
import { groupMatches, knockoutMatches } from "../data/matches";
import { isScoreValid } from "./helpers";

export type CertaintyForm = {
  formId: string;
  userId: string;
  formName: string;
  rank: number; // dense rank, identical to the live leaderboard
  totalPoints: number;
  maxRemaining: number; // sound upper bound on points still winnable
  aliveForFirst: boolean;
};

export type PoolCertainty = {
  nForms: number;
  forms: CertaintyForm[]; // sorted by leaderboard order
  byFormId: Record<string, CertaintyForm>;
};

// Sound upper bound on the points `formData` can still earn given the played
// results. Every component is ≥ the true achievable gain:
//   - unplayed group match the form predicted: outcome + exact
//   - each group with any unplayed match: up to 3 new R32-advancing hits
//     (top-2 + possible best-third) × group.advancing
//   - each unplayed knockout match: advancing points of its stage always
//     (the winner may newly appear in the form's next-round list even when
//     the form didn't predict this exact match), plus outcome + exact when
//     the form predicted it
//   - champion bonus while the final is unplayed
//   - top-scorer bonus while no official top scorer is set
export function maxRemainingBound(
  formData: any,
  playedResults: Record<string, any>,
  actualBonuses: any,
): number {
  let max = 0;
  const preds = formData?.matches || {};

  const groupsRemaining = new Set<string>();
  for (const gm of groupMatches) {
    if (isScoreValid(playedResults?.[gm.id])) continue;
    groupsRemaining.add(gm.group);
    if (isScoreValid(preds[gm.id])) {
      max += POINTS.group.outcome + POINTS.group.exactScore;
    }
  }
  max += groupsRemaining.size * 3 * POINTS.group.advancing;

  let finalUnplayed = false;
  for (const km of knockoutMatches) {
    if (isScoreValid(playedResults?.[km.id])) continue;
    if (km.stage === "F") finalUnplayed = true;
    const sp = (POINTS as Record<string, typeof POINTS.group>)[km.stage] || POINTS.group;
    max += sp.advancing;
    if (isScoreValid(preds[km.id])) {
      max += sp.outcome + sp.exactScore;
    }
  }

  if (finalUnplayed) max += BONUSES.champion;

  const topScorerDecided =
    Array.isArray(actualBonuses?.topScorers) && actualBonuses.topScorers.length > 0;
  if (!topScorerDecided) max += BONUSES.topScorer;

  return max;
}

// Full pool sweep: canonical current scores + per-form bound + alive flags.
export function computePoolCertainty(
  results: Record<string, any>,
  allPredictions: Record<string, any>,
  actualBonuses: any,
): PoolCertainty {
  const core = computeCore(results, allPredictions, actualBonuses, results, false);
  const ranked = assignDenseRanks<ScoredForm>(core.scoredForms);

  const bounds: Record<string, number> = {};
  let maxPoints = -Infinity;
  for (const f of ranked) {
    bounds[f.formId] = maxRemainingBound(allPredictions[f.formId], results, actualBonuses);
    if (f.totalPoints > maxPoints) maxPoints = f.totalPoints;
  }

  const forms: CertaintyForm[] = ranked.map((f) => ({
    formId: f.formId,
    userId: f.userId,
    formName: f.formName,
    rank: f.rank,
    totalPoints: f.totalPoints,
    maxRemaining: bounds[f.formId],
    // Alive for rank 1 unless someone's CURRENT points already exceed this
    // form's theoretical ceiling. Ties stay alive (tiebreakers can flip).
    aliveForFirst: maxPoints <= f.totalPoints + bounds[f.formId],
  }));

  const byFormId: Record<string, CertaintyForm> = {};
  for (const f of forms) byFormId[f.formId] = f;

  return { nForms: forms.length, forms, byFormId };
}

// Is `formId` PROVABLY guaranteed to finish at dense rank ≤ N no matter how
// the remaining matches go? Ties count as "could pass me" (see contract).
export function isClinchedTopN(
  pool: PoolCertainty,
  formId: string,
  n: number,
): boolean {
  const me = pool.byFormId[formId];
  if (!me) return false;
  let couldBeAbove = 0;
  for (const f of pool.forms) {
    if (f.formId === formId) continue;
    if (f.totalPoints + f.maxRemaining >= me.totalPoints) couldBeAbove++;
    if (couldBeAbove > n - 1) return false;
  }
  return true;
}
