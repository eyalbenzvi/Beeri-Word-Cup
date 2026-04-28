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
// Top scorer is excluded (topScorers: []). Champion is derived from
// the simulated match results, so best-case choices propagate naturally.

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
    const enriched = { ...d, advancing: deriveAdvancingTeams(predBracket) };
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
    if (s.totalPoints > t.totalPoints) n++;
    else if (
      s.totalPoints === t.totalPoints &&
      compareTiebreaker(s, t) < 0
    )
      n++;
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
  max += 9; // champion bonus
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
    // Reachable above: we might overtake them
    if (cur > tBase) return tMax >= cur;
    // Threat below: they might overtake us
    return cur + maxG >= tBase;
  });
}

// ─── Candidate match results ──────────────────────────────────────
// For a given match, collect all distinct (homeScore, awayScore) pairs
// predicted by any submitted form, plus one fallback per outcome type.

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
  // Ensure at least one candidate per outcome type
  for (const [dh, da] of OUTCOME_DEFAULTS) {
    const k = `${dh}:${da}`;
    if (!seen.has(k)) {
      seen.add(k);
      list.push({ homeScore: dh, awayScore: da });
    }
  }
  return list;
}

// For a knockout tie, attach an advancingTeam so calcBracketTeams can
// resolve the bracket. Prefer the target form's choice if valid.
function withAdvancing(
  cand: { homeScore: number; awayScore: number },
  matchId: string,
  forms: Record<string, any>,
  targetId: string,
  actualTeams: { home: string; away: string },
): any {
  if (cand.homeScore !== cand.awayScore) return cand;
  const pred = forms[targetId]?.matches?.[matchId];
  const at = pred?.advancingTeam;
  if (at && (at === actualTeams.home || at === actualTeams.away))
    return { ...cand, advancingTeam: at };
  return { ...cand, advancingTeam: actualTeams.home };
}

// ─── Single-match delta (lightweight, no full-score recompute) ────
// Returns outcome + exact points for one form on one match.
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

  const ph = +p.homeScore,
    pa = +p.awayScore;
  const rh = result.homeScore,
    ra = result.awayScore;
  const predO = ph > pa ? "H" : ph < pa ? "A" : "D";
  const actO = rh > ra ? "H" : rh < ra ? "A" : "D";
  if (predO !== actO) return 0;

  const pts = (POINTS as any)[stage] || POINTS.group;
  return pts.outcome + (ph === rh && pa === ra ? pts.exactScore : 0);
}

// ─── Group stage optimizer ────────────────────────────────────────
// Enumerates all 3^k outcome combinations for the remaining matches of
// one group, picks the one that minimises "forms above target".
// Uses calcGroupStandings (delegated) for standings + advancing points.

function bestGroupCombo(
  group: string,
  remainingMatches: any[],
  targetId: string,
  relevantIds: string[],
  baseScores: Record<string, any>,
  forms: Record<string, any>,
  playedResults: Record<string, any>,
): Record<string, any> {
  const k = remainingMatches.length;
  const tBase = baseScores[targetId]?.totalPoints ?? 0;

  // Build the already-played results for this group (needed for standings)
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

      // Prefer target's exact prediction if it matches the required outcome
      const pred = forms[targetId]?.matches?.[m.id];
      let ch: [number, number] = OUTCOME_DEFAULTS[outcomeIdx];
      if (isScoreValid(pred)) {
        const ph = +pred.homeScore,
          pa = +pred.awayScore;
        const ok =
          outcomeIdx === 0 ? ph > pa : outcomeIdx === 1 ? ph === pa : pa > ph;
        if (ok) ch = [ph, pa];
      }
      combo[m.id] = { homeScore: ch[0], awayScore: ch[1] };
    }

    // Compute standings for this group using delegated function
    const standings =
      calcGroupStandings({ ...playedInGroup, ...combo })[group] || [];
    const top2 = standings.slice(0, 2).map((t: any) => t.code);

    // Lightweight objective: match pts + this group's advancing pts
    const delta = (formData: any): number => {
      let pts = 0;
      const mp = formData?.matches || {};
      for (const [mid, res] of Object.entries(combo) as [
        string,
        { homeScore: number; awayScore: number },
      ][]) {
        const p = mp[mid];
        if (!isScoreValid(p)) continue;
        const ph = +p.homeScore,
          pa = +p.awayScore;
        const rh = res.homeScore,
          ra = res.awayScore;
        const predO = ph > pa ? "H" : ph < pa ? "A" : "D";
        const actO = rh > ra ? "H" : rh < ra ? "A" : "D";
        if (predO !== actO) continue;
        pts += POINTS.group.outcome + (ph === rh && pa === ra ? POINTS.group.exactScore : 0);
      }
      const formR32 = formData?.advancing?.R32 || [];
      for (const code of top2) {
        if (formR32.includes(code)) pts += POINTS.group.advancing;
      }
      return pts;
    };

    const tTotal = tBase + delta(forms[targetId]);
    let formsAbove = 0;
    for (const id of relevantIds) {
      const base = baseScores[id]?.totalPoints ?? 0;
      if (base + delta(forms[id]) > tTotal) formsAbove++;
    }

    if (formsAbove < bestObj) {
      bestObj = formsAbove;
      bestCombo = combo;
    }
  }

  return bestCombo;
}

// ─── Knockout optimizer ───────────────────────────────────────────
// Greedy round-by-round. For each match uses per-form predicted brackets
// (precomputed once) to detect wrongMatchup without recomputing brackets.

function optimizeKnockout(
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  relevantIds: string[],
  currentScores: Record<string, any>,
  forms: Record<string, any>,
): Record<string, any> {
  if (remKO.length === 0) return {};

  // Precompute per-form predicted brackets once
  const predBrackets: Record<string, Record<string, any>> = {};
  for (const id of [targetId, ...relevantIds]) {
    predBrackets[id] = calcBracketTeams(forms[id]?.matches || {});
  }

  const koRes: Record<string, any> = {};
  const tBase = currentScores[targetId]?.totalPoints ?? 0;

  for (const round of ["R32", "R16", "QF", "SF", "3RD", "F"]) {
    const roundMatches = remKO.filter((m) => m.stage === round);
    if (!roundMatches.length) continue;

    // Compute actual bracket for this round using all decided results so far
    const actualBracket = calcBracketTeams({ ...workingResults, ...koRes });

    for (const match of roundMatches) {
      const actualTeams = actualBracket[match.id];
      if (!actualTeams?.home || !actualTeams?.away) continue;

      const candidates = getCandidates(match.id, forms).map((c) =>
        withAdvancing(c, match.id, forms, targetId, actualTeams),
      );

      let bestObj = Infinity;
      let bestCand = candidates[0];

      for (const cand of candidates) {
        const tDelta = singleMatchDelta(
          forms[targetId],
          match.id,
          cand,
          match.stage,
          predBrackets[targetId]?.[match.id],
          actualTeams,
        );
        const tTotal = tBase + tDelta;

        let formsAbove = 0;
        for (const id of relevantIds) {
          const fBase = currentScores[id]?.totalPoints ?? 0;
          const fDelta = singleMatchDelta(
            forms[id],
            match.id,
            cand,
            match.stage,
            predBrackets[id]?.[match.id],
            actualTeams,
          );
          if (fBase + fDelta > tTotal) formsAbove++;
        }

        if (formsAbove < bestObj) {
          bestObj = formsAbove;
          bestCand = cand;
        }
      }

      koRes[match.id] = bestCand;
    }
  }

  return koRes;
}

// ─── Iterative refinement ─────────────────────────────────────────
// For each group, tries the top-K bracket shapes (by direct-score objective)
// and re-optimises knockout for each. Uses full scoreAllForms to compare
// global rank — this is the expensive step, so K is kept small.

function getTopKShapes(
  group: string,
  remainingMatches: any[],
  targetId: string,
  relevantIds: string[],
  baseScores: Record<string, any>,
  forms: Record<string, any>,
  playedResults: Record<string, any>,
  K: number,
): Array<Record<string, any>> {
  const k = remainingMatches.length;
  const tBase = baseScores[targetId]?.totalPoints ?? 0;

  const playedInGroup: Record<string, any> = {};
  for (const gm of groupMatches) {
    if (gm.group === group && playedResults[gm.id])
      playedInGroup[gm.id] = playedResults[gm.id];
  }

  // Map: shapeKey → { combo, objective }
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
        const ph = +pred.homeScore,
          pa = +pred.awayScore;
        const ok =
          outcomeIdx === 0 ? ph > pa : outcomeIdx === 1 ? ph === pa : pa > ph;
        if (ok) ch = [ph, pa];
      }
      combo[m.id] = { homeScore: ch[0], awayScore: ch[1] };
    }

    const standings =
      calcGroupStandings({ ...playedInGroup, ...combo })[group] || [];
    const top2 = standings.slice(0, 2).map((t: any) => t.code);
    const shapeKey = top2.join(":");

    const delta = (formData: any): number => {
      let pts = 0;
      const mp = formData?.matches || {};
      for (const [mid, res] of Object.entries(combo) as [
        string,
        { homeScore: number; awayScore: number },
      ][]) {
        const p = mp[mid];
        if (!isScoreValid(p)) continue;
        const ph = +p.homeScore,
          pa = +p.awayScore;
        const rh = res.homeScore,
          ra = res.awayScore;
        const predO = ph > pa ? "H" : ph < pa ? "A" : "D";
        const actO = rh > ra ? "H" : rh < ra ? "A" : "D";
        if (predO !== actO) continue;
        pts += POINTS.group.outcome + (ph === rh && pa === ra ? POINTS.group.exactScore : 0);
      }
      const formR32 = formData?.advancing?.R32 || [];
      for (const code of top2) {
        if (formR32.includes(code)) pts += POINTS.group.advancing;
      }
      return pts;
    };

    const tTotal = tBase + delta(forms[targetId]);
    let formsAbove = 0;
    for (const id of relevantIds) {
      const base = baseScores[id]?.totalPoints ?? 0;
      if (base + delta(forms[id]) > tTotal) formsAbove++;
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
): Record<string, any> {
  let best = { ...workingResults };

  const initScores = scoreAllForms(
    Object.fromEntries(allIds.map((id) => [id, forms[id]])),
    best,
  );
  let bestRank = countAbove(targetId, allIds, initScores);

  for (let iter = 0; iter < 4; iter++) {
    let improved = false;

    for (const group of Object.keys(GROUPS)) {
      const groupRem = remGroup.filter((m) => m.group === group);
      if (!groupRem.length) continue;

      const shapes = getTopKShapes(
        group,
        groupRem,
        targetId,
        relevantIds,
        baseScores,
        forms,
        playedResults,
        5,
      );

      for (const shape of shapes) {
        const trial = { ...best };
        Object.assign(trial, shape);
        // Remove stale knockout results so they are re-optimised
        for (const km of remKO) delete trial[km.id];

        const afterGroup = scoreAllForms(
          Object.fromEntries(allIds.map((id) => [id, forms[id]])),
          trial,
        );
        const newKO = optimizeKnockout(
          remKO,
          trial,
          targetId,
          relevantIds,
          afterGroup,
          forms,
        );
        Object.assign(trial, newKO);

        const trialScores = scoreAllForms(
          Object.fromEntries(allIds.map((id) => [id, forms[id]])),
          trial,
        );
        const trialRank = countAbove(targetId, allIds, trialScores);

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
  // Only work with submitted / approved forms
  const submittedForms = Object.fromEntries(
    Object.entries(allForms).filter(([, f]) => {
      const s = (f as any).status;
      return s === "submitted" || s === "approved";
    }),
  );
  if (!submittedForms[targetFormId]) return null;

  const remGroup = groupMatches.filter((m) => !playedResults[m.id]);
  const remKO = knockoutMatches.filter((m) => !playedResults[m.id]);

  // ── Phase 0: base scores from already-played matches ──
  onProgress?.("prep", 5);
  const baseScores = scoreAllForms(submittedForms, playedResults);
  const relevantIds = identifyRelevant(
    targetFormId,
    submittedForms,
    baseScores,
    remGroup,
    remKO,
  );
  const allIds = Object.keys(submittedForms);

  // ── Phase 1: greedy group stage ──
  onProgress?.("group", 15);
  const workingResults = { ...playedResults };
  for (const group of Object.keys(GROUPS)) {
    const groupRem = remGroup.filter((m) => m.group === group);
    if (!groupRem.length) continue;
    const combo = bestGroupCombo(
      group,
      groupRem,
      targetFormId,
      relevantIds,
      baseScores,
      submittedForms,
      playedResults,
    );
    Object.assign(workingResults, combo);
  }

  // ── Phase 2: greedy knockout ──
  onProgress?.("knockout", 50);
  const afterGroupScores = scoreAllForms(submittedForms, workingResults);
  const koRes = optimizeKnockout(
    remKO,
    workingResults,
    targetFormId,
    relevantIds,
    afterGroupScores,
    submittedForms,
  );
  Object.assign(workingResults, koRes);

  // ── Phase 3: iterative refinement ──
  onProgress?.("refine", 65);
  const refined = refineGroups(
    remGroup,
    remKO,
    workingResults,
    targetFormId,
    relevantIds,
    submittedForms,
    baseScores,
    playedResults,
    allIds,
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
