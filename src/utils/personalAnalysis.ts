/**
 * Personal Monte-Carlo analysis for the competition-analysis page.
 *
 * Pure + side-effect-free → runs in personalAnalysisWorker off the main
 * thread (and in the node test harness). Reuses the EXISTING canonical
 * engine end to end — simulateTournament / computeCurrentElo for sampling,
 * precomputeForms / scoreFormFast for scoring, compareTiebreaker for
 * ranking — and NEVER re-implements scoring arithmetic. The tiny
 * rank-the-pool loop mirrors scenarioSim's scoreSim(); a same-seed parity
 * test (tests/analysis) locks the two byte-equal so drift is impossible
 * to miss.
 *
 * What one run produces, aggregated over N simulated tournaments:
 *   - per TARGET form (the viewing user's forms): a dense-rank histogram
 *     (→ every target probability + the "most scenarios you finish
 *     between X and Y" range) + how often it finished last
 *   - per WATCH match (next-48h window) × outcome: sample count + per
 *     target form, how often it hit each money target (→ the root-for
 *     direction) — computed within ONE shared run, so all conditional
 *     slices use common random numbers and their differences are not
 *     cross-run sampling noise
 *   - per WATCH match: a pool-level "shake" score (expected mean absolute
 *     rank displacement across ALL forms) → "משחק המפתח"
 *
 * The run is CHUNKED: the caller gets a cumulative snapshot after every
 * chunk, so the UI can paint early (≈2k sims) and keep refining.
 */

import { calcBracketTeams, deriveActualAdvancing, deriveChampion } from "./bracket";
import { compareTiebreaker } from "./scoring";
import { buildFormBracketMap } from "./leaderboardCore";
import { computeCurrentElo } from "./eloModel";
import { simulateTournament, mulberry32 } from "./scenarioSim";
import {
  precomputeForms,
  scoreFormFast,
  makeScratchScore,
  type FormFast,
  type FastScore,
} from "./scenarioScore";

// ── Run parameters (single source of truth for hook + worker + tests) ──
export const FIRST_PAINT_SIMS = 2000; // one chunk ≈ first meaningful paint
export const TARGET_SIMS = 20000;
export const CHUNK_SIMS = 2000;
export const DEFAULT_ANALYSIS_SEED = 0x9e3779b9; // matches the scenario runs
// Money targets: rank 1 (win), the podium (top PODIUM_PLACES pay a prize),
// and the entry-fee-refund ranks. Places 100/200 are framed as a ±BAND range
// ("בסביבות מקום 100") — an exact-rank event is too narrow to estimate
// stably at these sample sizes.
export const PODIUM_PLACES = 3;
export const REFUND_RANKS = [100, 200] as const;
export const TARGET_BAND = 2;

export type TargetKey = "win" | "podium" | "p100" | "p200" | "last";

export type WatchOutcome = {
  // Group matches: "home" | "draw" | "away". Knockout: "home" | "away" =
  // WHICH TEAM ADVANCES (a KO draw resolves via advancingTeam), so a
  // shootout win counts toward the advancing side — exactly what a rooting
  // user cares about.
  key: "home" | "draw" | "away";
  n: number;
  // Aligned to targetForms: per viewer form, #sims (within this outcome
  // slice) where the form hit each money target.
  hits: Record<TargetKey, number>[];
};

export type WatchMatchAgg = {
  matchId: string;
  isKnockout: boolean;
  outcomes: WatchOutcome[];
  shake: number; // expected mean |Δrank| across the whole pool
};

export type TargetFormAgg = {
  formId: string;
  hist: number[]; // dense-rank histogram, index = rank-1, length nForms
  lastCount: number; // sims where the form finished (tied-)last
  hits: Record<TargetKey, number>; // unconditional target hits
};

export type PersonalAnalysisAggregate = {
  simCount: number;
  nForms: number;
  targetForms: TargetFormAgg[];
  watch: WatchMatchAgg[];
};

export type PersonalAnalysisInput = {
  allPredictions: Record<string, any>;
  results: Record<string, any>;
  actualBonuses: any;
  targetFormIds: string[];
  // Watch matches with their stage — outcome extraction differs for KO.
  watchMatches: { id: string; isKnockout: boolean }[];
  simCount: number;
  seed?: number;
  // Called with a CUMULATIVE snapshot after every chunk. Return false to
  // stop early (wall-clock budget) — the last snapshot stands.
  onChunk?: (agg: PersonalAnalysisAggregate, done: number, total: number) => boolean | void;
};

const TARGET_KEYS: TargetKey[] = ["win", "podium", "p100", "p200", "last"];

function emptyHits(): Record<TargetKey, number> {
  return { win: 0, podium: 0, p100: 0, p200: 0, last: 0 };
}

// Which targets a form hit in one sim, given its dense rank and the sim's
// bottom dense rank. `out` may be passed to avoid allocation in the hot loop.
// Exposed for unit tests.
export function targetHitFlags(
  rank: number,
  lastRank: number,
  out: Record<TargetKey, boolean> = { win: false, podium: false, p100: false, p200: false, last: false },
): Record<TargetKey, boolean> {
  out.win = rank === 1;
  out.podium = rank <= PODIUM_PLACES;
  out.p100 = Math.abs(rank - 100) <= TARGET_BAND;
  out.p200 = Math.abs(rank - 200) <= TARGET_BAND;
  out.last = rank === lastRank;
  return out;
}

export function runPersonalAnalysis(input: PersonalAnalysisInput): PersonalAnalysisAggregate {
  const {
    allPredictions,
    results,
    actualBonuses,
    targetFormIds,
    watchMatches,
    simCount,
    seed = DEFAULT_ANALYSIS_SEED,
    onChunk,
  } = input;

  const rng = mulberry32(seed);
  const elo = computeCurrentElo(results);
  const formBracketMap = buildFormBracketMap(allPredictions);
  const fixedTopScorers = Array.isArray(actualBonuses?.topScorers)
    ? actualBonuses.topScorers
    : [];
  const fastForms = precomputeForms(allPredictions, formBracketMap, results, fixedTopScorers);
  const nForms = fastForms.length;

  const targetIdx: { formId: string; idx: number }[] = [];
  for (const id of targetFormIds) {
    const idx = fastForms.findIndex((f) => f.formId === id);
    if (idx >= 0) targetIdx.push({ formId: id, idx });
  }

  // ── Accumulators ──
  const hist = targetIdx.map(() => new Uint32Array(Math.max(nForms, 1)));
  const lastCount = new Float64Array(targetIdx.length);
  const overallHits = targetIdx.map(() => emptyHits());
  // Overall per-form rank sum (baseline for the shake metric).
  const rankSum = new Float64Array(nForms);
  // Per watch match × outcome: n, per-target-form hits, per-form rank sums.
  type OutcomeAcc = {
    n: number;
    hits: Record<TargetKey, number>[];
    condRankSum: Float64Array;
  };
  const OUTCOME_KEYS: WatchOutcome["key"][] = ["home", "draw", "away"];
  const watchAcc = watchMatches.map(() =>
    OUTCOME_KEYS.map<OutcomeAcc>(() => ({
      n: 0,
      hits: targetIdx.map(() => emptyHits()),
      condRankSum: new Float64Array(nForms),
    })),
  );

  // Reused per-sim buffers (scenarioSim pattern — nothing allocated per form).
  // Each scratch score carries its fastForms index (`_idx`) so the ranking
  // loop reads a numeric field instead of a string-keyed map lookup.
  const scratch: (FastScore & { _idx?: number })[] = fastForms.map((f, i) => {
    const s = makeScratchScore(f.formId) as FastScore & { _idx?: number };
    s._idx = i;
    return s;
  });
  const order: (FastScore & { _idx?: number })[] = new Array(nForms);
  const denseRank = new Int32Array(nForms); // by sorted position
  const rankByFormIdx = new Int32Array(nForms); // by fastForms index
  // Per-sim target-hit flags, one reused record per target form (computed
  // once per sim, read by both the unconditional and the watch-match loops).
  const simFlags = targetIdx.map(() => targetHitFlags(0, 0));

  if (nForms === 0 || targetIdx.length === 0) {
    return snapshot(0);
  }

  let done = 0;
  while (done < simCount) {
    const chunk = Math.min(CHUNK_SIMS, simCount - done);
    for (let s = 0; s < chunk; s++) {
      const sim = simulateTournament(rng, results, elo);

      // Rank the pool exactly like scenarioSim.scoreSim / the leaderboard.
      const simBracket = calcBracketTeams(sim);
      const actualAdvancing = deriveActualAdvancing(simBracket, sim);
      const champion = deriveChampion(sim, simBracket);
      const advSets: Record<string, Set<string>> = {};
      for (const round of Object.keys(actualAdvancing)) {
        advSets[round] = new Set(actualAdvancing[round]);
      }
      for (let i = 0; i < nForms; i++) {
        scoreFormFast(fastForms[i], sim, simBracket, advSets, champion, scratch[i]);
        order[i] = scratch[i];
      }
      order.sort((a, b) => {
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        const tb = compareTiebreaker(a, b);
        if (tb !== 0) return tb;
        return a.formId.localeCompare(b.formId);
      });

      // Dense ranks (1,1,3 …) — the leaderboard's ranking semantics
      // (assignDenseRanks' tie predicate, allocation-free for the hot loop).
      let current = 1;
      for (let i = 0; i < nForms; i++) {
        if (i > 0) {
          const prev = order[i - 1];
          if (
            order[i].totalPoints !== prev.totalPoints ||
            compareTiebreaker(order[i], prev) !== 0
          ) {
            current = i + 1;
          }
        }
        denseRank[i] = current;
        const fi = order[i]._idx as number;
        rankByFormIdx[fi] = current;
        rankSum[fi] += current;
      }
      const lastRank = denseRank[nForms - 1];

      // Target-form aggregates. Flags are computed ONCE per sim per target
      // (into the reused simFlags records) and reused by the watch loop.
      for (let t = 0; t < targetIdx.length; t++) {
        const r = rankByFormIdx[targetIdx[t].idx];
        hist[t][r - 1]++;
        const flags = targetHitFlags(r, lastRank, simFlags[t]);
        if (flags.last) lastCount[t]++;
        for (const k of TARGET_KEYS) if (flags[k]) overallHits[t][k]++;
      }

      // Conditional aggregates per watch match.
      for (let w = 0; w < watchMatches.length; w++) {
        const entry = sim[watchMatches[w].id];
        if (!entry || entry.homeScore == null || entry.awayScore == null) continue;
        let key: WatchOutcome["key"];
        if (watchMatches[w].isKnockout) {
          // Advancing side (draws resolve via the sampled shootout).
          key =
            entry.homeScore > entry.awayScore
              ? "home"
              : entry.awayScore > entry.homeScore
                ? "away"
                : entry.advancingTeam === entry.homeTeam
                  ? "home"
                  : "away";
        } else {
          key =
            entry.homeScore > entry.awayScore
              ? "home"
              : entry.awayScore > entry.homeScore
                ? "away"
                : "draw";
        }
        const acc = watchAcc[w][OUTCOME_KEYS.indexOf(key)];
        acc.n++;
        for (let t = 0; t < targetIdx.length; t++) {
          const flags = simFlags[t]; // computed above for this sim
          for (const k of TARGET_KEYS) if (flags[k]) acc.hits[t][k]++;
        }
        for (let i = 0; i < nForms; i++) acc.condRankSum[i] += rankByFormIdx[i];
      }
    }

    done += chunk;
    if (onChunk) {
      const keepGoing = onChunk(snapshot(done), done, simCount);
      if (keepGoing === false) break;
    }
  }

  return snapshot(done);

  function snapshot(sims: number): PersonalAnalysisAggregate {
    return {
      simCount: sims,
      nForms,
      targetForms: targetIdx.map((t, i) => ({
        formId: t.formId,
        hist: Array.from(hist[i]),
        lastCount: lastCount[i],
        hits: { ...overallHits[i] },
      })),
      watch: watchMatches.map((wm, w) => {
        // Shake = Σ_o P(o) · mean_i |E[rank_i | o] − E[rank_i]|
        let shake = 0;
        const outcomes: WatchOutcome[] = [];
        for (let o = 0; o < OUTCOME_KEYS.length; o++) {
          const acc = watchAcc[w][o];
          if (acc.n === 0) continue;
          outcomes.push({
            key: OUTCOME_KEYS[o],
            n: acc.n,
            hits: acc.hits.map((h) => ({ ...h })),
          });
          if (sims > 0 && nForms > 0) {
            let sumAbs = 0;
            for (let i = 0; i < nForms; i++) {
              sumAbs += Math.abs(acc.condRankSum[i] / acc.n - rankSum[i] / sims);
            }
            shake += (acc.n / sims) * (sumAbs / nForms);
          }
        }
        return { matchId: wm.id, isKnockout: wm.isKnockout, outcomes, shake };
      }),
    };
  }
}
