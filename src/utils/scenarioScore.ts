/**
 * Lean per-simulation scorer for the Monte-Carlo scenario engine.
 *
 * `calculateFullScore` (scoring.ts) is the canonical engine, but it iterates
 * all 104 matches per form and builds breakdown strings + result objects on
 * every call — far too slow when run 250 forms × tens-of-thousands of sims.
 *
 * This module produces NUMERICALLY IDENTICAL totals via two ideas:
 *   1. Pre-compute each form's FIXED points (already-played group matches +
 *      top-scorer bonus) ONCE — they never change across sims.
 *   2. Per sim, score only the VARIABLE matches (the few remaining group games
 *      + the knockout) with plain integer comparisons, no strings/allocations.
 *
 * Equivalence with `calculateFullScore` is locked by scenarioScore.test.ts.
 * If you change scoring.ts, that test will catch any drift here.
 */

import { POINTS, BONUSES } from "./scoring";
import { isSamePlayer } from "./playerSearch.js";
import { isScoreValid } from "./helpers";
import { groupMatches, knockoutMatches } from "../data/matches";

// Advancing points are paid at the stage that FEEDS a round (see
// scoring.ts §2): reaching R32 pays group.advancing, R16 pays R32.advancing…
const ADV_STAGE_POINTS: Record<string, number> = {
  R32: POINTS.group.advancing,
  R16: POINTS.R32.advancing,
  QF: POINTS.R16.advancing,
  SF: POINTS.QF.advancing,
  F: POINTS.SF.advancing,
};

const GROUP_MATCH_IDS = groupMatches.map((m) => m.id);
const KNOCKOUT_MATCH_IDS = knockoutMatches.map((m) => ({ id: m.id, stage: m.stage }));

const outcomeCode = (h: number, a: number) => (h > a ? 0 : a > h ? 2 : 1);

export type FormFast = {
  formId: string;
  userId: string;
  formName: string;
  base: { total: number; exact: number; outcome: number };
  topScorerHit: boolean;
  varGroup: { id: string; ph: number; pa: number; pOut: number }[];
  knock: { id: string; stage: string; ph: number; pa: number; pOut: number; ptHome: string; ptAway: string }[];
  advancing: { round: string; teams: string[] }[];
  champion: string | null;
};

export type FastScore = {
  formId: string;
  totalPoints: number;
  exactScoreCount: number;
  outcomeCount: number;
  correctChampion: boolean;
  correctTopScorer: boolean;
  advancingPoints: Record<string, number>;
};

// Build the per-form precompute. `fixedResults` = the real results so far; any
// group match present+valid there is folded into `base`. `formBracketMap` is
// the leaderboardCore output (predBracket + advancing + champion per form).
export function precomputeForms(
  allPredictions: Record<string, any>,
  formBracketMap: Record<string, any>,
  fixedResults: Record<string, any>,
  fixedTopScorers: string[],
): FormFast[] {
  const out: FormFast[] = [];
  const fixedGroupIds = new Set(
    GROUP_MATCH_IDS.filter((id) => isScoreValid(fixedResults[id])),
  );

  for (const formId of Object.keys(formBracketMap)) {
    const fb = formBracketMap[formId];
    const predData = allPredictions[formId];
    const matches = predData.matches || {};

    let baseTotal = 0;
    let baseExact = 0;
    let baseOutcome = 0;

    // Fixed (already-played) group matches → constant base.
    for (const id of fixedGroupIds) {
      const pred = matches[id];
      const actual = fixedResults[id];
      if (!isScoreValid(pred)) continue;
      const ph = Number(pred.homeScore);
      const pa = Number(pred.awayScore);
      const ah = Number(actual.homeScore);
      const aa = Number(actual.awayScore);
      if (!Number.isFinite(ph) || !Number.isFinite(pa)) continue;
      if (outcomeCode(ph, pa) === outcomeCode(ah, aa)) {
        baseTotal += POINTS.group.outcome;
        baseOutcome += 1;
        if (ph === ah && pa === aa) {
          baseTotal += POINTS.group.exactScore;
          baseExact += 1;
        }
      }
    }

    // Top-scorer bonus is fixed (cannot be simulated from match scores).
    let topScorerHit = false;
    if (fixedTopScorers.length > 0 && predData.topScorer) {
      if (fixedTopScorers.some((s) => isSamePlayer(predData.topScorer, s))) {
        topScorerHit = true;
        baseTotal += BONUSES.topScorer;
      }
    }

    // Variable group matches (still to be played).
    const varGroup: FormFast["varGroup"] = [];
    for (const id of GROUP_MATCH_IDS) {
      if (fixedGroupIds.has(id)) continue;
      const pred = matches[id];
      if (!isScoreValid(pred)) continue;
      const ph = Number(pred.homeScore);
      const pa = Number(pred.awayScore);
      if (!Number.isFinite(ph) || !Number.isFinite(pa)) continue;
      varGroup.push({ id, ph, pa, pOut: outcomeCode(ph, pa) });
    }

    // Knockout matches the form predicted, with its predicted matchup teams
    // (for the wrong-matchup gate).
    const knock: FormFast["knock"] = [];
    const predBracket = fb.predBracket || {};
    for (const { id, stage } of KNOCKOUT_MATCH_IDS) {
      const pred = matches[id];
      if (!isScoreValid(pred)) continue;
      const ph = Number(pred.homeScore);
      const pa = Number(pred.awayScore);
      if (!Number.isFinite(ph) || !Number.isFinite(pa)) continue;
      const pt = predBracket[id] || {};
      knock.push({
        id,
        stage,
        ph,
        pa,
        pOut: outcomeCode(ph, pa),
        ptHome: pt.home || "",
        ptAway: pt.away || "",
      });
    }

    const advancing: FormFast["advancing"] = [];
    const formAdv = fb.advancing || {};
    for (const round of Object.keys(ADV_STAGE_POINTS)) {
      const teams = formAdv[round];
      if (Array.isArray(teams) && teams.length) advancing.push({ round, teams });
    }

    out.push({
      formId,
      userId: predData.userId,
      formName: predData.formName || "טופס ללא שם",
      base: { total: baseTotal, exact: baseExact, outcome: baseOutcome },
      topScorerHit,
      varGroup,
      knock,
      advancing,
      champion: fb.champion || null,
    });
  }

  return out;
}

export function makeScratchScore(formId = ""): FastScore {
  return {
    formId,
    totalPoints: 0,
    exactScoreCount: 0,
    outcomeCount: 0,
    correctChampion: false,
    correctTopScorer: false,
    advancingPoints: { R32: 0, R16: 0, QF: 0, SF: 0, F: 0 },
  };
}

// Score ONE form for one simulated tournament. `advSets` = actualAdvancing
// arrays pre-converted to Sets; `simBracket` = calcBracketTeams(sim). Pass
// `out` (a reused FastScore) to avoid per-form allocation in the hot loop.
export function scoreFormFast(
  f: FormFast,
  sim: Record<string, any>,
  simBracket: Record<string, any>,
  advSets: Record<string, Set<string>>,
  champion: string | null,
  out: FastScore = makeScratchScore(),
): FastScore {
  let total = f.base.total;
  let exact = f.base.exact;
  let outcome = f.base.outcome;
  const advancingPoints = out.advancingPoints;
  advancingPoints.R32 = 0;
  advancingPoints.R16 = 0;
  advancingPoints.QF = 0;
  advancingPoints.SF = 0;
  advancingPoints.F = 0;

  for (let i = 0; i < f.varGroup.length; i++) {
    const g = f.varGroup[i];
    const r = sim[g.id];
    if (!r) continue;
    const ah = r.homeScore;
    const aa = r.awayScore;
    if (ah == null || aa == null) continue;
    if (g.pOut === outcomeCode(ah, aa)) {
      total += POINTS.group.outcome;
      outcome += 1;
      if (g.ph === ah && g.pa === aa) {
        total += POINTS.group.exactScore;
        exact += 1;
      }
    }
  }

  for (let i = 0; i < f.knock.length; i++) {
    const k = f.knock[i];
    const r = sim[k.id];
    if (!r) continue;
    const ah = r.homeScore;
    const aa = r.awayScore;
    if (ah == null || aa == null) continue;
    const at = simBracket[k.id];
    // wrong-matchup gate: both predicted teams must equal the actual matchup.
    if (!at || k.ptHome !== at.home || k.ptAway !== at.away || !at.home || !at.away) continue;
    const sp = POINTS[k.stage] || POINTS.group;
    if (k.pOut === outcomeCode(ah, aa)) {
      total += sp.outcome;
      outcome += 1;
      if (k.ph === ah && k.pa === aa) {
        total += sp.exactScore;
        exact += 1;
      }
    }
  }

  for (let i = 0; i < f.advancing.length; i++) {
    const a = f.advancing[i];
    const set = advSets[a.round];
    if (!set || set.size === 0) continue;
    const sp = ADV_STAGE_POINTS[a.round];
    let pts = 0;
    for (let j = 0; j < a.teams.length; j++) {
      if (set.has(a.teams[j])) pts += sp;
    }
    advancingPoints[a.round] = pts;
    total += pts;
  }

  let correctChampion = false;
  if (champion && f.champion === champion) {
    total += BONUSES.champion;
    correctChampion = true;
  }

  out.formId = f.formId;
  out.totalPoints = total;
  out.exactScoreCount = exact;
  out.outcomeCount = outcome;
  out.correctChampion = correctChampion;
  out.correctTopScorer = f.topScorerHit;
  return out;
}
