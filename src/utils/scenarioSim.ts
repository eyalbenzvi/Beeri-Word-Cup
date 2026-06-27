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
// Storage-friendly: a single run is small enough for one Firestore doc
// (~250 forms × a handful of fields + trimmed scenario lists). The big raw
// conditional maps stay internal to the reducer; only per-form "root for" +
// rival, and top-N contenders per scenario, are emitted.
export type RootForEvent = { type: "champion" | "finalist"; code: string; lift: number; condWinProb: number };
export type TopForm = { formId: string; withinWinProb: number };

export type ScenarioFormStat = {
  formId: string;
  userId: string;
  formName: string;
  winProb: number;
  podiumProb: number;
  medianRank: number;
  q25: number;
  q75: number;
  meanRank: number;
  rival: { formId: string; count: number } | null;
  rootFor: RootForEvent[];
};

export type ScenarioRunResult = {
  meta: {
    seed: number;
    simCount: number;
    generatedAt: number;
    formCount: number;
    minScenarioSamples: number; // below this a scenario is "indicative only"
  };
  forms: Record<string, ScenarioFormStat>;
  champions: { code: string; prob: number; samples: number; topForms: TopForm[] }[];
  finalPairs: { teams: [string, string]; prob: number; samples: number; topForms: TopForm[] }[];
};

// Scenarios with fewer supporting sims than this are flagged "indicative only"
// (their per-form tables are noise). See expert review.
const MIN_SCENARIO_SAMPLES = 200;
// Minimum positive lift to surface a "root for" event (avoid trivia).
const MIN_ROOTFOR_LIFT = 0.01;
// Cap on stored finalist pairs (the long tail is irrelevant + bloats the doc).
const MAX_FINAL_PAIRS = 40;

function statsFromHist(hist: Int32Array, total: number) {
  // median / q25 / q75 from a rank histogram (index = rank, 1-based).
  const pick = (frac: number) => {
    const target = frac * total;
    let cum = 0;
    for (let r = 1; r < hist.length; r++) {
      cum += hist[r];
      if (cum >= target) return r;
    }
    return hist.length - 1;
  };
  return { median: pick(0.5), q25: pick(0.25), q75: pick(0.75) };
}

export type ProgressFn = (done: number, total: number) => void;

export function runScenarioSimulation(opts: {
  allPredictions: Record<string, any>;
  results: Record<string, any>;
  actualBonuses: any;
  simCount: number;
  seed?: number;
  rivalTopK?: number;
  onProgress?: ProgressFn;
}): ScenarioRunResult {
  const {
    allPredictions,
    results,
    actualBonuses,
    simCount,
    seed = 0x9e3779b9,
    rivalTopK = 12,
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
  const idx: Record<string, number> = {};
  formIds.forEach((f, i) => (idx[f] = i));

  // Reused per-sim scoring buffers (no per-form allocation in the hot loop).
  const scratch: FastScore[] = fastForms.map((f) => makeScratchScore(f.formId));
  const order: FastScore[] = fastForms.slice() as unknown as FastScore[];

  // Per-form accumulators.
  const winCount = new Float64Array(nForms);
  const podiumCount = new Float64Array(nForms);
  const rankSum = new Float64Array(nForms);
  const hist: Int32Array[] = formIds.map(() => new Int32Array(nForms + 2));

  // Scenario buckets + conditional win counts.
  const champSamples: Record<string, number> = {};
  const championWin: Record<string, Record<string, number>> = {};
  const finalSamples: Record<string, number> = {};
  const finalPairWin: Record<string, Record<string, number>> = {};
  const finalistWin: Record<string, Record<string, number>> = {};
  const finalistAppear: Record<string, number> = {};
  const adjacency: Record<string, number> = {}; // "a b" -> count

  const bump = (
    obj: Record<string, Record<string, number>>,
    key: string,
    formId: string,
  ) => {
    let m = obj[key];
    if (!m) m = obj[key] = {};
    m[formId] = (m[formId] || 0) + 1;
  };

  for (let s = 0; s < simCount; s++) {
    const sim = simulateTournament(rng, results, effRanks);
    const { ranked, champion, finalists } = scoreSim(sim, fastForms, scratch, order);

    const winner = ranked[0].formId;
    winCount[idx[winner]] += 1;
    for (let i = 0; i < ranked.length; i++) {
      const fi = idx[ranked[i].formId];
      const rank = i + 1;
      rankSum[fi] += rank;
      hist[fi][rank] += 1;
      if (i < 3) podiumCount[fi] += 1;
    }

    if (champion) {
      champSamples[champion] = (champSamples[champion] || 0) + 1;
      bump(championWin, champion, winner);
    }
    const [fa, fb] = finalists;
    if (fa && fb) {
      const pairKey = [fa, fb].sort().join(" ");
      finalSamples[pairKey] = (finalSamples[pairKey] || 0) + 1;
      bump(finalPairWin, pairKey, winner);
      for (const t of [fa, fb]) {
        finalistAppear[t] = (finalistAppear[t] || 0) + 1;
        bump(finalistWin, t, winner);
      }
    }

    const kMax = Math.min(rivalTopK, ranked.length - 1);
    for (let i = 0; i < kMax; i++) {
      const a = ranked[i].formId;
      const b = ranked[i + 1].formId;
      const key = a < b ? a + " " + b : b + " " + a;
      adjacency[key] = (adjacency[key] || 0) + 1;
    }

    if (onProgress && (s % 1000 === 999 || s === simCount - 1)) {
      onProgress(s + 1, simCount);
    }
  }

  // ── Reduce to the storage-friendly result shape ──
  const topFormsFrom = (wins: Record<string, number>, samples: number, n = 10) =>
    Object.entries(wins)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([formId, w]) => ({ formId, withinWinProb: w / samples }));

  const champions = Object.entries(champSamples)
    .sort((a, b) => b[1] - a[1])
    .map(([code, samples]) => ({
      code,
      prob: samples / simCount,
      samples,
      topForms: topFormsFrom(championWin[code] || {}, samples),
    }));

  const finalPairs = Object.entries(finalSamples)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FINAL_PAIRS)
    .map(([key, samples]) => {
      const [t1, t2] = key.split(" ");
      return {
        teams: [t1, t2] as [string, string],
        prob: samples / simCount,
        samples,
        topForms: topFormsFrom(finalPairWin[key] || {}, samples),
      };
    });

  // Rival = the form most often adjacent in the standings.
  const adjBySide: Record<string, { formId: string; count: number }> = {};
  for (const [key, count] of Object.entries(adjacency)) {
    const [a, b] = key.split(" ");
    if (!adjBySide[a] || count > adjBySide[a].count) adjBySide[a] = { formId: b, count };
    if (!adjBySide[b] || count > adjBySide[b].count) adjBySide[b] = { formId: a, count };
  }

  // "Root for" per form = the champion/finalist events that most LIFT this
  // form's win probability above its baseline (filtered for sample support).
  const rootForOf = (formId: string, baseline: number): RootForEvent[] => {
    const cands: RootForEvent[] = [];
    for (const [code, samples] of Object.entries(champSamples)) {
      if (samples < MIN_SCENARIO_SAMPLES) continue;
      const wins = championWin[code]?.[formId] || 0;
      const condWinProb = wins / samples;
      const lift = condWinProb - baseline;
      if (lift >= MIN_ROOTFOR_LIFT) cands.push({ type: "champion", code, lift, condWinProb });
    }
    for (const [code, appear] of Object.entries(finalistAppear)) {
      if (appear < MIN_SCENARIO_SAMPLES) continue;
      const wins = finalistWin[code]?.[formId] || 0;
      const condWinProb = wins / appear;
      const lift = condWinProb - baseline;
      if (lift >= MIN_ROOTFOR_LIFT) cands.push({ type: "finalist", code, lift, condWinProb });
    }
    return cands.sort((a, b) => b.lift - a.lift).slice(0, 3);
  };

  const forms: ScenarioRunResult["forms"] = {};
  fastForms.forEach((ff, i) => {
    const f = ff.formId;
    const { median, q25, q75 } = statsFromHist(hist[i], simCount);
    const winProb = winCount[i] / simCount;
    forms[f] = {
      formId: f,
      userId: ff.userId,
      formName: ff.formName,
      winProb,
      podiumProb: podiumCount[i] / simCount,
      medianRank: median,
      q25,
      q75,
      meanRank: rankSum[i] / simCount,
      rival: adjBySide[f] || null,
      rootFor: rootForOf(f, winProb),
    };
  });

  return {
    meta: {
      seed,
      simCount,
      generatedAt: Date.now(),
      formCount: nForms,
      minScenarioSamples: MIN_SCENARIO_SAMPLES,
    },
    forms,
    champions,
    finalPairs,
  };
}
