/**
 * Monte-Carlo scenario engine for the prediction pool.
 *
 * Pure + side-effect-free → safe for Web Workers and the node test harness.
 * ALL scoring / standings / bracket / champion arithmetic is delegated to the
 * existing canonical utilities (scoring.ts, bracket.ts, fifaPredictor.ts), so
 * a simulated tournament is scored through the EXACT same call path as the
 * live leaderboard. This file only adds: a seeded RNG, an in-tournament form
 * blend for match probabilities, the sampling loop, and aggregation.
 *
 * Concept: real results so far are FIXED. The remaining matches (the 6 group
 * games still to play + the whole knockout) are sampled thousands of times.
 * Every simulated tournament ranks all forms; we aggregate per-form win/podium
 * probabilities and bucket the runs by CHAMPION and by FINALIST PAIR (the two
 * scenario anchors the product asked for).
 */

import { groupMatches, knockoutMatches } from "../data/matches";
import { GROUPS } from "../data/teams";
import { FIFA_RANK_DENSE } from "../data/fifaRanking";
import {
  predictScoreline,
  DEFAULT_RANK,
  KNOCKOUT_DRAW_UPSET_CHANCE,
} from "./fifaPredictor";
import { calcGroupStandings, calcBracketTeams, deriveActualAdvancing, deriveChampion } from "./bracket";
import { compareTiebreaker } from "./scoring";
import { buildFormBracketMap } from "./leaderboardCore";
import { isScoreValid } from "./helpers";
import { precomputeForms, scoreFormFast, makeScratchScore, FormFast, FastScore } from "./scenarioScore";

// ─── Seeded RNG ────────────────────────────────────────────────────
// mulberry32: tiny, fast, deterministic. A stored seed makes any run fully
// reproducible/auditable (vs. bare Math.random).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── In-tournament form blend ──────────────────────────────────────
// A team's match probability is driven by an EFFECTIVE rank: its static FIFA
// rank, nudged by how it ACTUALLY performed in the group stage (points/game
// and goal difference/game). Better-than-its-rank form → lower (=stronger)
// effective rank, and vice-versa. Bounded to [1,48] so it always feeds the
// validated OUTCOME_TIERS without producing out-of-range probabilities.
const BASELINE_PPG = 1.35; // ≈ average points-per-game across group play
const BLEND_K_PPG = 4.0; // rank-units shifted per point-per-game above baseline
const BLEND_K_GD = 1.5; // rank-units shifted per goal-difference-per-game

export function computeEffectiveRanks(
  fixedResults: Record<string, any>,
): Record<string, number> {
  const standings = calcGroupStandings(fixedResults);
  const eff: Record<string, number> = {};
  for (const teams of Object.values(GROUPS)) {
    for (const team of teams) {
      eff[team.code] = FIFA_RANK_DENSE[team.code] || DEFAULT_RANK;
    }
  }
  for (const sorted of Object.values(standings)) {
    for (const t of sorted as any[]) {
      const base = FIFA_RANK_DENSE[t.code] || DEFAULT_RANK;
      if (!t.played) {
        eff[t.code] = base;
        continue;
      }
      const ppg = t.pts / t.played;
      const gdpg = (t.gf - t.ga) / t.played;
      const delta = BLEND_K_PPG * (ppg - BASELINE_PPG) + BLEND_K_GD * gdpg;
      // delta>0 → stronger form → LOWER effective rank.
      eff[t.code] = Math.min(48, Math.max(1, base - delta));
    }
  }
  return eff;
}

// ─── One simulated tournament ──────────────────────────────────────
// Returns a full results map (real results kept verbatim, the rest sampled).
const KNOCKOUT_STAGES = ["R32", "R16", "QF", "SF", "3RD", "F"];

export function simulateTournament(
  rng: () => number,
  fixedResults: Record<string, any>,
  effRanks: Record<string, number>,
): Record<string, any> {
  const sim: Record<string, any> = {};

  // Group stage: keep real played matches, sample the rest.
  for (const m of groupMatches) {
    const fixed = fixedResults[m.id];
    if (isScoreValid(fixed)) {
      sim[m.id] = fixed;
      continue;
    }
    const rh = effRanks[m.homeTeam] ?? DEFAULT_RANK;
    const ra = effRanks[m.awayTeam] ?? DEFAULT_RANK;
    const { homeScore, awayScore } = predictScoreline(rh, ra, rng);
    sim[m.id] = {
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore,
      awayScore,
      stage: "group",
      group: m.group,
      played: true,
    };
  }

  // Knockout cascade: resolve matchups round-by-round from the evolving map.
  for (const stage of KNOCKOUT_STAGES) {
    const bracket = calcBracketTeams(sim); // direct (no cache: every sim unique)
    for (const m of knockoutMatches) {
      if (m.stage !== stage) continue;
      const fixed = fixedResults[m.id];
      if (isScoreValid(fixed)) {
        sim[m.id] = fixed;
        continue;
      }
      const teams = bracket[m.id];
      if (!teams?.home || !teams?.away) continue;
      const rh = effRanks[teams.home] ?? DEFAULT_RANK;
      const ra = effRanks[teams.away] ?? DEFAULT_RANK;
      const { homeScore, awayScore } = predictScoreline(rh, ra, rng);
      const entry: any = {
        homeTeam: teams.home,
        awayTeam: teams.away,
        homeScore,
        awayScore,
        stage: m.stage,
        played: true,
      };
      if (homeScore === awayScore) {
        const favored = rh <= ra ? teams.home : teams.away;
        const underdog = favored === teams.home ? teams.away : teams.home;
        entry.advancingTeam =
          rng() < KNOCKOUT_DRAW_UPSET_CHANCE ? underdog : favored;
      }
      sim[m.id] = entry;
    }
  }

  return sim;
}

// ─── Score every form for one simulated tournament ─────────────────
// Same ranking as the live leaderboard (totalPoints → compareTiebreaker →
// formId), via the lean scorer (scenarioScore.ts) whose totals are locked
// equal to calculateFullScore by test. Returns the ordered forms + the sim's
// champion + finalists.
export type SimRanked = {
  ranked: FastScore[]; // index 0 = winner, fully ordered (reused buffer refs)
  champion: string | null;
  finalists: [string | null, string | null];
};

// `scratch`/`order` are reused buffers owned by the caller — scoreFormFast
// writes into scratch[i] (stable by form index) and `order` holds the sorted
// refs, so the hot loop allocates nothing per form.
function scoreSim(
  sim: Record<string, any>,
  fastForms: FormFast[],
  scratch: FastScore[],
  order: FastScore[],
): SimRanked {
  const simBracket = calcBracketTeams(sim);
  const actualAdvancing = deriveActualAdvancing(simBracket, sim);
  const champion = deriveChampion(sim, simBracket);

  const advSets: Record<string, Set<string>> = {};
  for (const round of Object.keys(actualAdvancing)) {
    advSets[round] = new Set(actualAdvancing[round]);
  }

  for (let i = 0; i < fastForms.length; i++) {
    scoreFormFast(fastForms[i], sim, simBracket, advSets, champion, scratch[i]);
    order[i] = scratch[i];
  }

  order.sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    const tb = compareTiebreaker(a, b);
    if (tb !== 0) return tb;
    return a.formId.localeCompare(b.formId);
  });

  const finalTeams = simBracket["F-1"] || {};
  return {
    ranked: order,
    champion,
    finalists: [finalTeams.home || null, finalTeams.away || null],
  };
}

// ─── Aggregation across N sims ─────────────────────────────────────
// The product is intentionally narrow: pick a FINAL (champion + runner-up)
// and get, for every form, its average rank, average points, and probability
// of finishing 1st in that scenario. That's all this result carries — a small
// label map for display, the champion marginals (to drive the picker), and a
// capped list of champion+runner-up tables. Fits one Firestore doc easily.
export type ScenarioFormInfo = { userId: string; formName: string };

// A "scenario" = a specific FINAL: `champion` beat `runnerUp`. The per-form
// tables are parallel arrays aligned to the run's `formOrder` (index i is the
// i-th form id). Each form's three metrics within the scenario:
//   avgRank[i]   — its average leaderboard position
//   avgPoints[i] — its average total points
//   winProb[i]   — its probability of finishing 1st (P(rank 1 | scenario))
export type Scenario = {
  champion: string;
  runnerUp: string;
  prob: number;
  samples: number;
  avgRank: number[];
  avgPoints: number[];
  winProb: number[];
};

export type ScenarioRunResult = {
  meta: {
    seed: number;
    simCount: number;
    generatedAt: number;
    formCount: number;
    minScenarioSamples: number; // below this a final is too rare to table
  };
  formOrder: string[]; // index basis for every Scenario's parallel arrays
  forms: Record<string, ScenarioFormInfo>; // display labels only
  champions: { code: string; prob: number; samples: number }[]; // for the picker
  scenarios: Scenario[]; // champion+runner-up tables (capped, sorted by prob)
};

// A final must occur in at least this many sims to be tabled (so its per-form
// averages are stable rather than noise).
const MIN_SCENARIO_SAMPLES = 200;
// Cap on stored scenario tables (the long tail is rare + bloats the doc).
const MAX_SCENARIOS = 60;

export type ProgressFn = (done: number, total: number) => void;

export function runScenarioSimulation(opts: {
  allPredictions: Record<string, any>;
  results: Record<string, any>;
  actualBonuses: any;
  simCount: number;
  seed?: number;
  minScenarioSamples?: number;
  onProgress?: ProgressFn;
}): ScenarioRunResult {
  const {
    allPredictions,
    results,
    actualBonuses,
    simCount,
    seed = 0x9e3779b9,
    minScenarioSamples = MIN_SCENARIO_SAMPLES,
    onProgress,
  } = opts;

  const rng = mulberry32(seed);
  const effRanks = computeEffectiveRanks(results);
  const formBracketMap = buildFormBracketMap(allPredictions);
  const fixedTopScorers = Array.isArray(actualBonuses?.topScorers)
    ? actualBonuses.topScorers
    : [];
  const fastForms = precomputeForms(allPredictions, formBracketMap, results, fixedTopScorers);
  const formIds = fastForms.map((f) => f.formId); // submitted/approved only

  const nForms = formIds.length;
  const meta = {
    seed,
    simCount,
    generatedAt: Date.now(),
    formCount: nForms,
    minScenarioSamples,
  };
  const forms: ScenarioRunResult["forms"] = {};
  for (const ff of fastForms) forms[ff.formId] = { userId: ff.userId, formName: ff.formName };

  // No eligible forms → return a valid empty run rather than crash. Avoids the
  // ranked[0] deref and 50k pointless sims when nothing is submitted yet.
  if (nForms === 0) {
    return { meta, formOrder: [], forms, champions: [], scenarios: [] };
  }

  const idx: Record<string, number> = {};
  formIds.forEach((f, i) => (idx[f] = i));

  // Reused per-sim scoring buffers (no per-form allocation in the hot loop).
  const scratch: FastScore[] = fastForms.map((f) => makeScratchScore(f.formId));
  const order: FastScore[] = new Array(nForms) as FastScore[];

  // Champion marginal (drives the picker order).
  const champSamples: Record<string, number> = {};

  // Per-scenario (champion+runner-up) accumulators, lazily allocated. Each
  // holds per-form running sums so we can emit avg rank / avg points / win %.
  type ScenAcc = { samples: number; rankSum: Float64Array; pointsSum: Float64Array; winCount: Float64Array };
  const scenAcc: Map<string, ScenAcc> = new Map();
  const getScen = (key: string): ScenAcc => {
    let a = scenAcc.get(key);
    if (!a) {
      a = {
        samples: 0,
        rankSum: new Float64Array(nForms),
        pointsSum: new Float64Array(nForms),
        winCount: new Float64Array(nForms),
      };
      scenAcc.set(key, a);
    }
    return a;
  };

  for (let s = 0; s < simCount; s++) {
    const sim = simulateTournament(rng, results, effRanks);
    const { ranked, champion, finalists } = scoreSim(sim, fastForms, scratch, order);

    if (champion) champSamples[champion] = (champSamples[champion] || 0) + 1;

    // The scenario is the final: champion beat runnerUp. Accumulate per-form
    // rank/points/win only for valid (resolved) finals.
    const [fa, fb] = finalists;
    if (champion && fa && fb) {
      const runnerUp = champion === fa ? fb : fa;
      const scen = getScen(champion + ">" + runnerUp);
      scen.samples += 1;
      for (let i = 0; i < ranked.length; i++) {
        const fi = idx[ranked[i].formId];
        scen.rankSum[fi] += i + 1;
        scen.pointsSum[fi] += ranked[i].totalPoints;
        if (i === 0) scen.winCount[fi] += 1;
      }
    }

    if (onProgress && (s % 1000 === 999 || s === simCount - 1)) {
      onProgress(s + 1, simCount);
    }
  }

  // ── Reduce to the result shape ──
  const round = (x: number, dp: number) => {
    const m = 10 ** dp;
    return Math.round(x * m) / m;
  };

  const champions = Object.entries(champSamples)
    .sort((a, b) => b[1] - a[1])
    .map(([code, samples]) => ({ code, prob: samples / simCount, samples }));

  // Champion+runner-up tables: most-frequent finals with ≥ min samples (so the
  // per-form averages are stable), each a full per-form table aligned to
  // `formOrder`.
  const scenarios: Scenario[] = [...scenAcc.entries()]
    .filter(([, a]) => a.samples >= minScenarioSamples)
    .sort((a, b) => b[1].samples - a[1].samples)
    .slice(0, MAX_SCENARIOS)
    .map(([key, a]) => {
      const [champion, runnerUp] = key.split(">");
      const avgRank: number[] = new Array(nForms);
      const avgPoints: number[] = new Array(nForms);
      const winProb: number[] = new Array(nForms);
      for (let i = 0; i < nForms; i++) {
        avgRank[i] = round(a.rankSum[i] / a.samples, 1);
        avgPoints[i] = round(a.pointsSum[i] / a.samples, 1);
        winProb[i] = round(a.winCount[i] / a.samples, 4);
      }
      return { champion, runnerUp, prob: a.samples / simCount, samples: a.samples, avgRank, avgPoints, winProb };
    });

  return { meta, formOrder: formIds, forms, champions, scenarios };
}
