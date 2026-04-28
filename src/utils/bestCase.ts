/**
 * Best-case scenario computation for a single prediction form.
 *
 * Pure functions — no React, no side effects, safe for Web Workers.
 * All scoring / bracket / standings logic is delegated to the existing
 * utilities (scoring.ts, bracket.ts). Nothing here reimplements those.
 */

import { calculateFullScore, compareTiebreaker, POINTS } from "./scoring";
import {
  calcBracketTeams,
  calcGroupStandings,
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

// ─── Score all submitted forms ────────────────────────────────────
// Computes full scores for every form against a given results set.
// Top scorer is excluded (topScorers: []). Champion and advancing are
// derived from each form's predicted bracket — matching useLeaderboardComputed.

function scoreAllForms(
  submittedForms: Record<string, any>,
  allResults: Record<string, any>,
): Record<string, any> {
  const actualBracket = calcBracketTeams(allResults);
  const actualAdvancing = deriveActualAdvancing(actualBracket, allResults);
  const derivedChampion = deriveChampion(allResults, actualBracket);
  const bonuses = { champion: derivedChampion, topScorers: [] as string[] };

  const scores: Record<string, any> = {};
  for (const [formId, formData] of Object.entries(submittedForms)) {
    const d = formData as any;
    const predBracket = calcBracketTeams(d.matches || {});
    // BUG #1 FIX: derive champion from form's predicted bracket, same as
    // useLeaderboardComputed does — the stored `champion` field is null.
    const formChampion = deriveChampion(d.matches || {}, predBracket);
    const enriched = {
      ...d,
      advancing: deriveAdvancingTeams(predBracket),
      champion: formChampion,
    };
    scores[formId] = calculateFullScore(
      enriched,
      allResults,
      actualAdvancing,
      bonuses,
      predBracket,
      actualBracket,
    );
  }
  return scores;
}

// How many of the given formIds score strictly above targetId.
// BUG #5 FIX: mirror the three-level tiebreaker used by rankedLeaderboard
// (points → compareTiebreaker → formId.localeCompare).
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
      const tb = compareTiebreaker(s, t);
      if (tb < 0) n++;
      else if (tb === 0 && id.localeCompare(targetId) < 0) n++;
    }
  }
  return n;
}

// ─── Relevant-forms filter ────────────────────────────────────────
// Upper bound on how many points a form can still earn in remaining matches.
// Loose overestimate — used only for pruning, so false positives are fine.

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
  // Upper bound: 2 advancing teams per remaining group × 2 pts each
  const groupsRem = new Set(remGroup.map((gm: any) => gm.group));
  max += groupsRem.size * 2 * POINTS.group.advancing;

  for (const km of remKO) {
    if (!isScoreValid(m[km.id])) continue;
    const p = (POINTS as any)[km.stage] || POINTS.group;
    max += p.outcome + p.exactScore + p.advancing;
  }
  // BUG #6 FIX: champion bonus only possible if the Final hasn't been played.
  if (remKO.some((km: any) => km.stage === "F")) {
    max += 9;
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
// plus one fallback per outcome type to ensure coverage.

const OUTCOME_DEFAULTS: [number, number][] = [
  [1, 0], // H-win
  [0, 0], // draw
  [0, 1], // A-win
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

// BUG #3 FIX: for knockout draw candidates, expand into two candidates —
// one advancing home, one advancing away — so the optimizer can evaluate
// which choice minimises forms above target, rather than falling back to
// an arbitrary bias. Non-draw candidates are returned as-is.
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

// ─── Single-match delta (lightweight, no full-score recompute) ────
// Returns outcome + exact-score points for one form on one match.
// Respects wrongMatchup logic for knockout stages.

function singleMatchDelta(
  formData: any,
  matchId: string,
  result: { homeScore: number; awayScore: number },
  stage: string,
  predTeams: any,
  actualTeams: any,
): number {
  const p = formData?.matches?.[matchId];
  if (!isScoreValid(p)) return 0;

  if (stage !== "group" && predTeams && actualTeams) {
    if (
      !predTeams.home ||
      !predTeams.away ||
      !actualTeams.home ||
      !actualTeams.away ||
      predTeams.home !== actualTeams.home ||
      predTeams.away !== actualTeams.away
    )
      return 0;
  }

  const ph = +p.homeScore, pa = +p.awayScore;
  const rh = result.homeScore, ra = result.awayScore;
  const predO = ph > pa ? "H" : ph < pa ? "A" : "D";
  const actO  = rh > ra ? "H" : rh < ra ? "A" : "D";
  if (predO !== actO) return 0;

  const pts = (POINTS as any)[stage] || POINTS.group;
  return pts.outcome + (ph === rh && pa === ra ? pts.exactScore : 0);
}

// ─── Group stage optimizer ────────────────────────────────────────
// Enumerates all 3^k outcome combinations for a group's remaining matches
// and picks the one minimising "forms above target".
// Standings are delegated to calcGroupStandings; advancing predictions are
// looked up from the precomputed formR32Preds map (Bug #2 fix).

function buildGroupDelta(
  combo: Record<string, { homeScore: number; awayScore: number }>,
  top2: string[],
  forms: Record<string, any>,
  formR32Preds: Record<string, string[]>,
) {
  // Returns the lightweight score delta for formId from this group combo.
  return (formId: string): number => {
    const formData = forms[formId];
    let pts = 0;
    const mp = formData?.matches || {};
    for (const [mid, res] of Object.entries(combo) as [
      string,
      { homeScore: number; awayScore: number },
    ][]) {
      const p = mp[mid];
      if (!isScoreValid(p)) continue;
      const ph = +p.homeScore, pa = +p.awayScore;
      const rh = res.homeScore, ra = res.awayScore;
      const predO = ph > pa ? "H" : ph < pa ? "A" : "D";
      const actO  = rh > ra ? "H" : rh < ra ? "A" : "D";
      if (predO !== actO) continue;
      pts += POINTS.group.outcome + (ph === rh && pa === ra ? POINTS.group.exactScore : 0);
    }
    // BUG #2 FIX: use precomputed R32 predictions derived from the form's
    // bracket, not the raw advancing field (which is always {} in Firestore).
    const formR32 = formR32Preds[formId] || [];
    for (const code of top2) {
      if (formR32.includes(code)) pts += POINTS.group.advancing;
    }
    return pts;
  };
}

function bestGroupCombo(
  group: string,
  remainingMatches: any[],
  targetId: string,
  relevantIds: string[],
  baseScores: Record<string, any>,
  forms: Record<string, any>,
  playedResults: Record<string, any>,
  formR32Preds: Record<string, string[]>,
): Record<string, any> {
  const k = remainingMatches.length;
  const tBase = baseScores[targetId]?.totalPoints ?? 0;

  const playedInGroup: Record<string, any> = {};
  for (const gm of groupMatches) {
    if (gm.group === group && playedResults[gm.id])
      playedInGroup[gm.id] = playedResults[gm.id];
  }

  let bestObj = Infinity;
  let bestCombo: Record<string, any> = {};

  for (let mask = 0; mask < 3 ** k; mask++) {
    const combo: Record<string, { homeScore: number; awayScore: number }> = {};
    let tmp = mask;

    for (const m of remainingMatches) {
      const outcomeIdx = tmp % 3;
      tmp = Math.floor(tmp / 3);
      const pred = forms[targetId]?.matches?.[m.id];
      let ch: [number, number] = OUTCOME_DEFAULTS[outcomeIdx];
      if (isScoreValid(pred)) {
        const ph = +pred.homeScore, pa = +pred.awayScore;
        const ok = outcomeIdx === 0 ? ph > pa : outcomeIdx === 1 ? ph === pa : pa > ph;
        if (ok) ch = [ph, pa];
      }
      combo[m.id] = { homeScore: ch[0], awayScore: ch[1] };
    }

    const standings =
      calcGroupStandings({ ...playedInGroup, ...combo })[group] || [];
    const top2 = standings.slice(0, 2).map((t: any) => t.code);
    const delta = buildGroupDelta(combo, top2, forms, formR32Preds);

    const tTotal = tBase + delta(targetId);
    let formsAbove = 0;
    for (const id of relevantIds) {
      if ((baseScores[id]?.totalPoints ?? 0) + delta(id) > tTotal) formsAbove++;
    }

    if (formsAbove < bestObj) {
      bestObj = formsAbove;
      bestCombo = combo;
    }
  }

  return bestCombo;
}

// ─── Knockout optimizer ───────────────────────────────────────────
// Greedy round-by-round. Per-form predicted brackets are precomputed once.
// BUG #3 FIX: draw candidates are expanded to both advancing options.
// BUG #7 FIX: cumulative delta tracks points earned in earlier KO rounds
//             so the comparison baseline is always current, not frozen at
//             the post-group-stage snapshot.

function optimizeKnockout(
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  relevantIds: string[],
  currentScores: Record<string, any>,
  forms: Record<string, any>,
): Record<string, any> {
  if (remKO.length === 0) return {};

  // Precompute predicted brackets for target + relevant forms (once per call).
  const predBrackets: Record<string, Record<string, any>> = {};
  for (const id of [targetId, ...relevantIds]) {
    predBrackets[id] = calcBracketTeams(forms[id]?.matches || {});
  }

  const koRes: Record<string, any> = {};

  // BUG #7 FIX: accumulate match-level deltas so comparisons in later rounds
  // reflect points already earned in earlier KO rounds of this same call.
  const cumulativeDelta: Record<string, number> = {};
  for (const id of [targetId, ...relevantIds]) cumulativeDelta[id] = 0;

  const effectiveBase = (id: string) =>
    (currentScores[id]?.totalPoints ?? 0) + cumulativeDelta[id];

  for (const round of ["R32", "R16", "QF", "SF", "3RD", "F"]) {
    const roundMatches = remKO.filter((m) => m.stage === round);
    if (!roundMatches.length) continue;

    const actualBracket = calcBracketTeams({ ...workingResults, ...koRes });

    for (const match of roundMatches) {
      const actualTeams = actualBracket[match.id];
      if (!actualTeams?.home || !actualTeams?.away) continue;

      const candidates = expandKnockoutCandidates(
        getCandidates(match.id, forms),
        actualTeams,
      );

      let bestObj = Infinity;
      let bestCand = candidates[0];

      for (const cand of candidates) {
        const tDelta = singleMatchDelta(
          forms[targetId], match.id, cand, match.stage,
          predBrackets[targetId]?.[match.id], actualTeams,
        );
        const tTotal = effectiveBase(targetId) + tDelta;

        let formsAbove = 0;
        for (const id of relevantIds) {
          const fDelta = singleMatchDelta(
            forms[id], match.id, cand, match.stage,
            predBrackets[id]?.[match.id], actualTeams,
          );
          if (effectiveBase(id) + fDelta > tTotal) formsAbove++;
        }

        if (formsAbove < bestObj) {
          bestObj = formsAbove;
          bestCand = cand;
        }
      }

      koRes[match.id] = bestCand;

      // Update cumulative delta for all tracked forms after choosing this result.
      for (const id of [targetId, ...relevantIds]) {
        cumulativeDelta[id] += singleMatchDelta(
          forms[id], match.id, bestCand, match.stage,
          predBrackets[id]?.[match.id], actualTeams,
        );
      }
    }
  }

  return koRes;
}

// ─── Iterative refinement ─────────────────────────────────────────
// For each group, tries top-K distinct bracket shapes and re-optimises
// knockout for each, using full scoreAllForms for the final comparison.

function getTopKShapes(
  group: string,
  remainingMatches: any[],
  targetId: string,
  relevantIds: string[],
  baseScores: Record<string, any>,
  forms: Record<string, any>,
  playedResults: Record<string, any>,
  K: number,
  formR32Preds: Record<string, string[]>,
): Array<Record<string, any>> {
  const k = remainingMatches.length;
  const tBase = baseScores[targetId]?.totalPoints ?? 0;

  const playedInGroup: Record<string, any> = {};
  for (const gm of groupMatches) {
    if (gm.group === group && playedResults[gm.id])
      playedInGroup[gm.id] = playedResults[gm.id];
  }

  const shapeMap = new Map<string, { combo: Record<string, any>; obj: number }>();

  for (let mask = 0; mask < 3 ** k; mask++) {
    const combo: Record<string, { homeScore: number; awayScore: number }> = {};
    let tmp = mask;
    for (const m of remainingMatches) {
      const outcomeIdx = tmp % 3;
      tmp = Math.floor(tmp / 3);
      const pred = forms[targetId]?.matches?.[m.id];
      let ch: [number, number] = OUTCOME_DEFAULTS[outcomeIdx];
      if (isScoreValid(pred)) {
        const ph = +pred.homeScore, pa = +pred.awayScore;
        const ok = outcomeIdx === 0 ? ph > pa : outcomeIdx === 1 ? ph === pa : pa > ph;
        if (ok) ch = [ph, pa];
      }
      combo[m.id] = { homeScore: ch[0], awayScore: ch[1] };
    }

    const standings =
      calcGroupStandings({ ...playedInGroup, ...combo })[group] || [];
    const top2 = standings.slice(0, 2).map((t: any) => t.code);
    const shapeKey = top2.join(":");
    const delta = buildGroupDelta(combo, top2, forms, formR32Preds);

    const tTotal = tBase + delta(targetId);
    let formsAbove = 0;
    for (const id of relevantIds) {
      if ((baseScores[id]?.totalPoints ?? 0) + delta(id) > tTotal) formsAbove++;
    }

    const existing = shapeMap.get(shapeKey);
    if (!existing || formsAbove < existing.obj) {
      shapeMap.set(shapeKey, { combo, obj: formsAbove });
    }
  }

  return Array.from(shapeMap.values())
    .sort((a, b) => a.obj - b.obj)
    .slice(0, K)
    .map((s) => s.combo);
}

function refineGroups(
  remGroup: any[],
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  relevantIds: string[],
  forms: Record<string, any>,
  baseScores: Record<string, any>,
  playedResults: Record<string, any>,
  allIds: string[],
  formR32Preds: Record<string, string[]>,
): Record<string, any> {
  let best = { ...workingResults };

  const allFormsSubset = Object.fromEntries(allIds.map((id) => [id, forms[id]]));
  let bestRank = countAbove(targetId, allIds, scoreAllForms(allFormsSubset, best));

  for (let iter = 0; iter < 4; iter++) {
    let improved = false;

    for (const group of Object.keys(GROUPS)) {
      const groupRem = remGroup.filter((m) => m.group === group);
      if (!groupRem.length) continue;

      const shapes = getTopKShapes(
        group, groupRem, targetId, relevantIds,
        baseScores, forms, playedResults, 5, formR32Preds,
      );

      for (const shape of shapes) {
        const trial = { ...best };
        Object.assign(trial, shape);
        for (const km of remKO) delete trial[km.id];

        const afterGroup = scoreAllForms(allFormsSubset, trial);
        const newKO = optimizeKnockout(
          remKO, trial, targetId, relevantIds, afterGroup, forms,
        );
        Object.assign(trial, newKO);

        const trialRank = countAbove(
          targetId, allIds, scoreAllForms(allFormsSubset, trial),
        );

        if (trialRank < bestRank) {
          bestRank = trialRank;
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

  // ── Phase 0: base scores + relevant competitors ──
  onProgress?.("prep", 5);
  const baseScores = scoreAllForms(submittedForms, playedResults);
  const relevantIds = identifyRelevant(
    targetFormId, submittedForms, baseScores, remGroup, remKO,
  );
  const allIds = Object.keys(submittedForms);

  // BUG #2 FIX: precompute R32 advancing predictions for every form once,
  // derived from each form's predicted bracket (the stored advancing field
  // is always {} — only the bracket-derived value is meaningful).
  const formR32Preds: Record<string, string[]> = {};
  for (const id of allIds) {
    const predBracket = calcBracketTeams(submittedForms[id]?.matches || {});
    formR32Preds[id] = deriveAdvancingTeams(predBracket).R32 || [];
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
        group, groupRem, targetFormId, relevantIds,
        baseScores, submittedForms, playedResults, formR32Preds,
      ),
    );
  }

  // ── Phase 2: greedy knockout ──
  onProgress?.("knockout", 50);
  const afterGroupScores = scoreAllForms(submittedForms, workingResults);
  Object.assign(
    workingResults,
    optimizeKnockout(
      remKO, workingResults, targetFormId, relevantIds,
      afterGroupScores, submittedForms,
    ),
  );

  // ── Phase 3: iterative refinement ──
  onProgress?.("refine", 65);
  const refined = refineGroups(
    remGroup, remKO, workingResults,
    targetFormId, relevantIds, submittedForms,
    baseScores, playedResults, allIds, formR32Preds,
  );

  // ── Phase 4: final rank ──
  onProgress?.("rank", 93);
  const finalScores = scoreAllForms(submittedForms, refined);
  const projectedRank = 1 + countAbove(targetFormId, allIds, finalScores);
  const projectedScore = finalScores[targetFormId]?.totalPoints ?? 0;

  onProgress?.("done", 100);
  return {
    projectedRank,
    projectedScore,
    totalForms: allIds.length,
    bestResults: refined,
  };
}
