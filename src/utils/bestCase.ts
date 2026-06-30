/**
 * Best-case scenario computation for a single prediction form.
 *
 * Pure functions — no React, no side effects, safe for Web Workers.
 *
 * Design principle: ALL scoring/standings/bracket logic is delegated to
 * the existing utilities (scoring.ts, bracket.ts). This file contains
 * search/optimization only — never reimplements outcome/exact-score/
 * advancing/champion arithmetic. Every score that drives a decision is
 * produced by `calculateFullScore`, exactly the same call path the
 * leaderboard uses.
 */

import {
  calculateFullScore,
  compareTiebreaker,
  getOutcome,
  POINTS,
  BONUSES,
} from "./scoring";
import {
  calcBracketTeams,
  deriveAdvancingTeams,
  deriveActualAdvancing,
  deriveChampion,
} from "./bracket";
import { groupMatches, knockoutMatches } from "../data/matches";
import { GROUPS } from "../data/teams";
import { isScoreValid } from "./helpers";

// ─── Public types ─────────────────────────────────────────────────

export type BestCaseResult = {
  projectedRank: number;
  projectedScore: number;
  totalForms: number;
  bestResults: Record<string, any>;
};

export type ProgressCallback = (phase: string, percent: number) => void;

// ─── Availability gate ────────────────────────────────────────────
// The optimizer is only offered once the group stage is fully played:
// all 32 R32 qualifiers (winners, runners-up, best thirds) are determined
// only when ALL 12 groups are complete — best-third qualification compares
// across groups, so partial completion is not enough. Before that point the
// search space (72 group matches × refine) is also prohibitively large
// (minutes of worker time with a real form population).

export function isBestCaseAvailable(
  playedResults: Record<string, any> | null | undefined,
): boolean {
  return groupMatches.every((m) => isScoreValid(playedResults?.[m.id]));
}

// ─── Per-form precomputed predictions (stable across all trials) ──
// Computing each form's bracket / advancing / champion is the heaviest
// derivation in the inner loop. They depend ONLY on the form's own
// match predictions, so we compute once per form per top-level call
// and reuse for every trial result-set we evaluate.

type FormPreds = {
  bracket: Record<string, any>;
  advancing: Record<string, string[]>;
  champion: string | null;
};

function buildFormPreds(form: any): FormPreds {
  const matches = form?.matches || {};
  const bracket = calcBracketTeams(matches);
  return {
    bracket,
    advancing: deriveAdvancingTeams(bracket),
    champion: deriveChampion(matches, bracket),
  };
}

// ─── Score forms against a trial result-set ───────────────────────
// Single source of truth for scoring. Every comparison in the optimizer
// goes through this function → `calculateFullScore`. Top-scorer bonus is
// intentionally excluded from the projection (passed as []).

const STAGE_BY_ID: Record<string, string> = Object.fromEntries([
  ...groupMatches.map((m) => [m.id, "group"]),
  ...knockoutMatches.map((m) => [m.id, m.stage]),
]);

function withStage(trialResults: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [mid, r] of Object.entries(trialResults)) {
    out[mid] = (r as any)?.stage ? r : { ...(r as any), stage: STAGE_BY_ID[mid] || "group" };
  }
  return out;
}

function scoreForms(
  forms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  rawTrialResults: Record<string, any>,
): Record<string, any> {
  const trialResults = withStage(rawTrialResults);
  const actualBracket = calcBracketTeams(trialResults);
  const actualAdvancing = deriveActualAdvancing(actualBracket, trialResults);
  const actualChampion = deriveChampion(trialResults, actualBracket);
  const bonuses = { champion: actualChampion, topScorers: [] as string[] };

  const scores: Record<string, any> = {};
  for (const [formId, formData] of Object.entries(forms)) {
    const preds = formPreds[formId];
    if (!preds) continue;
    const enriched = {
      ...(formData as any),
      advancing: preds.advancing,
      champion: preds.champion,
    };
    scores[formId] = calculateFullScore(
      enriched,
      trialResults,
      actualAdvancing,
      bonuses,
      preds.bracket,
      actualBracket,
    );
  }
  return scores;
}

// How many of the given formIds rank strictly above targetId.
// Mirrors useLeaderboardComputed.rankedLeaderboard exactly:
// dense ranking on (totalPoints, compareTiebreaker). Forms tied on both
// share a rank — they are NOT counted as "above". `formId.localeCompare`
// is only a sort key inside a tied bucket; it does not break the rank.
function countAbove(
  targetId: string,
  formIds: string[],
  scores: Record<string, any>,
): number {
  const t = scores[targetId];
  if (!t) return formIds.length;
  let n = 0;
  for (const id of formIds) {
    if (id === targetId) continue;
    const s = scores[id];
    if (!s) continue;
    if (s.totalPoints > t.totalPoints) {
      n++;
    } else if (s.totalPoints === t.totalPoints) {
      if (compareTiebreaker(s, t) < 0) n++;
    }
  }
  return n;
}

// ─── Relevant-forms filter ────────────────────────────────────────
// Upper bound on how many points a form can still earn in remaining matches.
// Loose overestimate — used only for pruning, so false positives are fine.

function getStagePoints(stage: string): typeof POINTS.group {
  return (POINTS as Record<string, typeof POINTS.group>)[stage] ?? POINTS.group;
}

function maxRemainingPts(
  formData: any,
  remGroup: any[],
  remKO: any[],
): number {
  let max = 0;
  const m = formData?.matches || {};

  for (const gm of remGroup) {
    if (isScoreValid(m[gm.id]))
      max += POINTS.group.outcome + POINTS.group.exactScore;
  }
  // Upper bound on R32-advancing pts from remaining groups. In the 48-team
  // format up to 3 teams per group can advance to R32 (top-2 always + best
  // third-place teams cover 8 of 12). Per group the form's R32 prediction
  // may newly match up to 3 of those, so 3 × 2 pts is the safe bound.
  const groupsRem = new Set(remGroup.map((gm: any) => gm.group));
  max += groupsRem.size * 3 * POINTS.group.advancing;

  for (const km of remKO) {
    if (!isScoreValid(m[km.id])) continue;
    const p = getStagePoints(km.stage);
    max += p.outcome + p.exactScore + p.advancing;
  }
  // Champion bonus only possible if the Final hasn't been played yet.
  if (remKO.some((km: any) => km.stage === "F")) {
    max += BONUSES.champion;
  }
  return max;
}

function identifyRelevant(
  targetId: string,
  forms: Record<string, any>,
  baseScores: Record<string, any>,
  remGroup: any[],
  remKO: any[],
): string[] {
  const tBase = baseScores[targetId]?.totalPoints ?? 0;
  const tMax = tBase + maxRemainingPts(forms[targetId], remGroup, remKO);

  return Object.keys(forms).filter((id) => {
    if (id === targetId) return false;
    const cur = baseScores[id]?.totalPoints ?? 0;
    const maxG = maxRemainingPts(forms[id], remGroup, remKO);
    if (cur > tBase) return tMax >= cur;   // reachable above
    return cur + maxG >= tBase;            // threat below
  });
}

// ─── Candidate match results ──────────────────────────────────────
// Collects all distinct (homeScore, awayScore) pairs predicted by any form,
// plus one fallback per outcome type to ensure coverage. Per-outcome
// fallbacks make the search exhaustive over outcomes (H/D/A) even when
// no form predicted that outcome.

const OUTCOME_DEFAULTS: [number, number][] = [
  [1, 0], // home win
  [0, 0], // draw
  [0, 1], // away win
];

function getCandidates(
  matchId: string,
  forms: Record<string, any>,
): Array<{ homeScore: number; awayScore: number }> {
  const seen = new Set<string>();
  const list: Array<{ homeScore: number; awayScore: number }> = [];

  for (const fd of Object.values(forms)) {
    const p = (fd as any).matches?.[matchId];
    if (!isScoreValid(p)) continue;
    const k = `${p.homeScore}:${p.awayScore}`;
    if (!seen.has(k)) {
      seen.add(k);
      list.push({ homeScore: +p.homeScore, awayScore: +p.awayScore });
    }
  }
  for (const [dh, da] of OUTCOME_DEFAULTS) {
    const k = `${dh}:${da}`;
    if (!seen.has(k)) {
      seen.add(k);
      list.push({ homeScore: dh, awayScore: da });
    }
  }
  return list;
}

// For knockout draws, expand into two candidates — one with each team
// advancing on penalties — so the optimizer evaluates both choices
// instead of an arbitrary bias. Non-draw candidates are returned as-is.
function expandKnockoutCandidates(
  base: Array<{ homeScore: number; awayScore: number }>,
  actualTeams: { home: string; away: string },
): any[] {
  const expanded: any[] = [];
  for (const c of base) {
    if (c.homeScore !== c.awayScore) {
      expanded.push(c);
    } else {
      expanded.push({ ...c, advancingTeam: actualTeams.home });
      expanded.push({ ...c, advancingTeam: actualTeams.away });
    }
  }
  return expanded;
}

// ─── Group-stage enumeration ──────────────────────────────────────
// Enumerate all 3^k outcome combinations for a group's remaining matches.
// For each combo, build the full trial result-set, score every tracked
// form via calculateFullScore, and keep the combo that minimises rank.

type GroupCombo = Record<string, { homeScore: number; awayScore: number }>;

// Outcomes for a base-3 enumeration index → name used by `getOutcome`.
const OUTCOME_NAMES: ReadonlyArray<"home" | "draw" | "away"> = [
  "home",
  "draw",
  "away",
];

function enumerateGroupCombos(
  remainingMatches: any[],
  targetForm: any,
): GroupCombo[] {
  const k = remainingMatches.length;
  const combos: GroupCombo[] = [];

  for (let mask = 0; mask < 3 ** k; mask++) {
    const combo: GroupCombo = {};
    let tmp = mask;
    for (const m of remainingMatches) {
      const outcomeIdx = tmp % 3;
      tmp = Math.floor(tmp / 3);
      // If the target form's score-prediction has the same outcome we're
      // enumerating, prefer the form's exact score (so target earns the
      // exactScore bonus too). Otherwise fall back to a canonical
      // representative score for that outcome.
      const pred = targetForm?.matches?.[m.id];
      let ch: [number, number] = OUTCOME_DEFAULTS[outcomeIdx];
      if (isScoreValid(pred)) {
        const predOutcome = getOutcome(+pred.homeScore, +pred.awayScore);
        if (predOutcome === OUTCOME_NAMES[outcomeIdx]) {
          ch = [+pred.homeScore, +pred.awayScore];
        }
      }
      combo[m.id] = { homeScore: ch[0], awayScore: ch[1] };
    }
    combos.push(combo);
  }
  return combos;
}

function bestGroupCombo(
  groupRem: any[],
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  workingResults: Record<string, any>,
): GroupCombo {
  const combos = enumerateGroupCombos(groupRem, trackedForms[targetId]);
  let bestAbove = Infinity;
  let bestScore = -Infinity;
  let bestCombo: GroupCombo = combos[0] ?? {};

  for (const combo of combos) {
    const trial = { ...workingResults, ...combo };
    const scores = scoreForms(trackedForms, formPreds, trial);
    const above = countAbove(targetId, trackedIds, scores);
    const score = scores[targetId]?.totalPoints ?? 0;
    // Lexicographic objective: minimize (above, -targetScore). Many trials
    // tie on `above` (especially when few results are locked), so without
    // the score tiebreak the optimizer would settle on the first combo it
    // visited (typically all-home-wins) — a scenario unrelated to the
    // target's predictions. Tiebreaking on target score guarantees the
    // displayed scenario reflects the form whenever doing so achieves the
    // best rank.
    if (above < bestAbove || (above === bestAbove && score > bestScore)) {
      bestAbove = above;
      bestScore = score;
      bestCombo = combo;
    }
  }
  return bestCombo;
}

// Top-K distinct group bracket shapes (defined by the set of teams that
// advance to R32 from this group). For each shape we keep the combo that
// scored best within that shape. Used by refineGroups to try different
// downstream bracket structures.
function getTopKShapes(
  groupRem: any[],
  group: string,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  workingResults: Record<string, any>,
  K: number,
): GroupCombo[] {
  const combos = enumerateGroupCombos(groupRem, trackedForms[targetId]);
  // GROUPS holds team objects; shapeKey compares against team CODES (the
  // values deriveAdvancingTeams returns), so index by code — otherwise
  // `groupTeams.has(code)` is always false and every combo collapses into a
  // single empty shapeKey, defeating the per-shape dedup below.
  const groupTeams = new Set(
    (GROUPS[group as keyof typeof GROUPS] || []).map((team) => team.code),
  );

  // Two combos that produce the same set of R32 entrants from this group
  // are merged — they yield the same downstream bracket structure for
  // this group, so refining over them is redundant. The R32 entrants
  // are derived via deriveAdvancingTeams (the canonical source).
  const shapeBest = new Map<
    string,
    { combo: GroupCombo; above: number; score: number }
  >();

  for (const combo of combos) {
    const trial = { ...workingResults, ...combo };
    const trialBracket = calcBracketTeams(trial);
    const allR32 = deriveAdvancingTeams(trialBracket).R32 || [];
    const shapeKey = allR32
      .filter((t: string) => groupTeams.has(t))
      .sort()
      .join(":");

    const scores = scoreForms(trackedForms, formPreds, trial);
    const above = countAbove(targetId, trackedIds, scores);
    const score = scores[targetId]?.totalPoints ?? 0;

    const existing = shapeBest.get(shapeKey);
    if (
      !existing ||
      above < existing.above ||
      (above === existing.above && score > existing.score)
    ) {
      shapeBest.set(shapeKey, { combo, above, score });
    }
  }

  return Array.from(shapeBest.values())
    .sort((a, b) => a.above - b.above || b.score - a.score)
    .slice(0, K)
    .map((s) => s.combo);
}

// ─── Knockout optimizer (greedy round-by-round) ───────────────────
// For each remaining KO match, try every candidate result, score the
// target + relevant forms via calculateFullScore against the cumulative
// trial, keep the candidate that minimises forms-above-target.

function optimizeKnockout(
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
): Record<string, any> {
  if (remKO.length === 0) return {};

  const koRes: Record<string, any> = {};

  for (const round of ["R32", "R16", "QF", "SF", "3RD", "F"]) {
    const roundMatches = remKO.filter((m) => m.stage === round);
    if (!roundMatches.length) continue;

    for (const match of roundMatches) {
      // Bracket may shift with each prior choice → recompute per match.
      const actualBracket = calcBracketTeams({ ...workingResults, ...koRes });
      const actualTeams = actualBracket[match.id];
      if (!actualTeams?.home || !actualTeams?.away) continue;

      const candidates = expandKnockoutCandidates(
        getCandidates(match.id, trackedForms),
        actualTeams,
      );

      let bestAbove = Infinity;
      let bestScore = -Infinity;
      let bestCand = candidates[0];

      for (const cand of candidates) {
        const trial = { ...workingResults, ...koRes, [match.id]: cand };
        const scores = scoreForms(trackedForms, formPreds, trial);
        const above = countAbove(targetId, trackedIds, scores);
        const score = scores[targetId]?.totalPoints ?? 0;
        if (above < bestAbove || (above === bestAbove && score > bestScore)) {
          bestAbove = above;
          bestScore = score;
          bestCand = cand;
        }
      }

      koRes[match.id] = bestCand;
    }
  }

  return koRes;
}

// ─── Iterative refinement ─────────────────────────────────────────
// Group choices propagate into KO matchups, so a locally-optimal group
// combo may be globally worse once the resulting bracket is filled in.
// We retry top-K distinct bracket shapes per group, re-running the full
// KO optimizer for each, accepting any trial that improves overall rank.

function refineGroups(
  remGroup: any[],
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  scoringForms: Record<string, any>,
  scoringPreds: Record<string, FormPreds>,
  allIds: string[],
): Record<string, any> {
  let best = { ...workingResults };
  const bestScores = scoreForms(scoringForms, scoringPreds, best);
  let bestRank = countAbove(targetId, allIds, bestScores);
  let bestScore = bestScores[targetId]?.totalPoints ?? 0;

  for (let iter = 0; iter < 4; iter++) {
    let improved = false;

    for (const group of Object.keys(GROUPS)) {
      const groupRem = remGroup.filter((m) => m.group === group);
      if (!groupRem.length) continue;

      const shapes = getTopKShapes(
        groupRem, group, targetId, trackedIds, trackedForms, formPreds, best, 8,
      );

      for (const shape of shapes) {
        const trial = { ...best };
        Object.assign(trial, shape);
        for (const km of remKO) delete trial[km.id];

        const newKO = optimizeKnockout(
          remKO, trial, targetId, trackedIds, trackedForms, formPreds,
        );
        Object.assign(trial, newKO);

        const trialScores = scoreForms(scoringForms, scoringPreds, trial);
        const trialRank = countAbove(targetId, allIds, trialScores);
        const trialScore = trialScores[targetId]?.totalPoints ?? 0;

        if (
          trialRank < bestRank ||
          (trialRank === bestRank && trialScore > bestScore)
        ) {
          bestRank = trialRank;
          bestScore = trialScore;
          best = trial;
          improved = true;
          break;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

// ─── Knockout local search ────────────────────────────────────────
// refineGroups only fires while group matches are still unplayed. The
// dominant real-world use of this tool, though, is "group stage finished,
// only the knockout bracket remains" — and there the round-by-round greedy
// (optimizeKnockout) is the ONLY optimization, with no lookahead: an
// advancing-team / scoreline choice in an early round can be locally optimal
// yet globally worse once its downstream matchups are filled in.
//
// This pass adds that lookahead. For each remaining KO match it re-tries every
// candidate result and, crucially, RE-OPTIMISES all strictly-downstream
// remaining KO matches for that choice (their matchups depend on it), then
// scores the FULL population. It is a strict hill-climb: a trial replaces the
// incumbent only when it improves (rank, then target score), so the result is
// never worse than the greedy/refineGroups output it starts from.

const KO_ROUND_ORDER = ["R32", "R16", "QF", "SF", "3RD", "F"];
const koRoundIndex = (stage: string) => KO_ROUND_ORDER.indexOf(stage);

// The pass re-optimises every strictly-downstream match for each candidate of
// each match, so its cost grows ~quadratically with the number of remaining KO
// matches (≈37s at 16, untenable at the full 32). It is gated to the late,
// CONSTRAINED rounds (QF onward ≈ 8 matches, a few seconds) where the greedy
// has the least room and benefits most. With many matches still open the greedy
// already has enough freedom to seat the target near the top, so the lookahead
// would add seconds for negligible gain.
const MAX_KO_REFINE = 8;

function refineKnockout(
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  scoringForms: Record<string, any>,
  scoringPreds: Record<string, FormPreds>,
  allIds: string[],
): Record<string, any> {
  if (remKO.length === 0 || remKO.length > MAX_KO_REFINE) {
    return { ...workingResults };
  }

  let best = { ...workingResults };
  const bestScores = scoreForms(scoringForms, scoringPreds, best);
  let bestRank = countAbove(targetId, allIds, bestScores);
  let bestScore = bestScores[targetId]?.totalPoints ?? 0;

  const ordered = [...remKO].sort(
    (a, b) => koRoundIndex(a.stage) - koRoundIndex(b.stage),
  );

  for (let iter = 0; iter < 3; iter++) {
    let improved = false;

    for (const m of ordered) {
      // Only matches in strictly later rounds depend on m's outcome; same-round
      // matches are independent bracket slots, so leave them fixed.
      const mIdx = koRoundIndex(m.stage);
      const downstream = remKO.filter((k) => koRoundIndex(k.stage) > mIdx);

      const bracket = calcBracketTeams(best);
      const actualTeams = bracket[m.id];
      if (!actualTeams?.home || !actualTeams?.away) continue;

      const candidates = expandKnockoutCandidates(
        getCandidates(m.id, trackedForms),
        actualTeams,
      );

      for (const cand of candidates) {
        const trial = { ...best, [m.id]: cand };
        for (const d of downstream) delete trial[d.id];
        Object.assign(
          trial,
          optimizeKnockout(
            downstream, trial, targetId, trackedIds, trackedForms, formPreds,
          ),
        );

        const trialScores = scoreForms(scoringForms, scoringPreds, trial);
        const trialRank = countAbove(targetId, allIds, trialScores);
        const trialScore = trialScores[targetId]?.totalPoints ?? 0;

        if (
          trialRank < bestRank ||
          (trialRank === bestRank && trialScore > bestScore)
        ) {
          bestRank = trialRank;
          bestScore = trialScore;
          best = trial;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

// ─── Main entry point ─────────────────────────────────────────────

export function computeBestCase(
  targetFormId: string,
  allForms: Record<string, any>,
  playedResults: Record<string, any>,
  onProgress?: ProgressCallback,
): BestCaseResult | null {
  const submittedForms = Object.fromEntries(
    Object.entries(allForms).filter(([, f]) => {
      const s = (f as any).status;
      return s === "submitted" || s === "approved";
    }),
  );
  if (!submittedForms[targetFormId]) return null;

  const remGroup = groupMatches.filter((m) => !playedResults[m.id]);
  const remKO = knockoutMatches.filter((m) => !playedResults[m.id]);

  // ── Phase 0: precompute per-form predictions (stable) + base scores ──
  onProgress?.("prep", 5);
  const allIds = Object.keys(submittedForms);

  // Per-form predictions are reused across every trial — compute once.
  const allFormPreds: Record<string, FormPreds> = {};
  for (const id of allIds) {
    allFormPreds[id] = buildFormPreds(submittedForms[id]);
  }

  const baseScores = scoreForms(submittedForms, allFormPreds, playedResults);
  const relevantIds = identifyRelevant(
    targetFormId, submittedForms, baseScores, remGroup, remKO,
  );

  // Inner-loop scoring is restricted to {target} ∪ relevant — heavy
  // optimization without paying to score irrelevant forms each time.
  const trackedIds = [targetFormId, ...relevantIds];
  const trackedForms: Record<string, any> = {};
  const trackedPreds: Record<string, FormPreds> = {};
  for (const id of trackedIds) {
    trackedForms[id] = submittedForms[id];
    trackedPreds[id] = allFormPreds[id];
  }

  // ── Phase 1: greedy group stage ──
  onProgress?.("group", 15);
  const workingResults = { ...playedResults };
  for (const group of Object.keys(GROUPS)) {
    const groupRem = remGroup.filter((m) => m.group === group);
    if (!groupRem.length) continue;
    Object.assign(
      workingResults,
      bestGroupCombo(
        groupRem, targetFormId, trackedIds, trackedForms, trackedPreds, workingResults,
      ),
    );
  }

  // ── Phase 2: greedy knockout ──
  onProgress?.("knockout", 50);
  Object.assign(
    workingResults,
    optimizeKnockout(
      remKO, workingResults, targetFormId, trackedIds, trackedForms, trackedPreds,
    ),
  );

  // ── Phase 3: iterative refinement of group shapes (full-population) ──
  onProgress?.("refine", 65);
  const refined = refineGroups(
    remGroup, remKO, workingResults,
    targetFormId, trackedIds, trackedForms, trackedPreds,
    submittedForms, allFormPreds, allIds,
  );

  // ── Phase 3b: knockout local search (lookahead over bracket choices) ──
  // The key optimization once the group stage is over and only the bracket is
  // left to play — refineGroups is a no-op then. Monotonic, so it can only
  // match or improve `refined`.
  onProgress?.("refine", 80);
  const refinedKO = refineKnockout(
    remKO, refined,
    targetFormId, trackedIds, trackedForms, trackedPreds,
    submittedForms, allFormPreds, allIds,
  );

  // ── Phase 4: final rank against the full population ──
  onProgress?.("rank", 93);
  const finalScores = scoreForms(submittedForms, allFormPreds, refinedKO);
  const projectedRank = 1 + countAbove(targetFormId, allIds, finalScores);
  const projectedScore = finalScores[targetFormId]?.totalPoints ?? 0;

  onProgress?.("done", 100);
  return {
    projectedRank,
    projectedScore,
    totalForms: allIds.length,
    // Attach `stage` so the returned scenario scores identically if it is ever
    // re-fed through the leaderboard scoring path (which keys points off it).
    bestResults: withStage(refinedKO),
  };
}
