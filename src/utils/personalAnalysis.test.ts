import { describe, it, expect } from "vitest";
import {
  runPersonalAnalysis,
  targetHitFlags,
  TARGET_BAND,
} from "./personalAnalysis";
import { runScenarioSimulation } from "./scenarioSim";
import { predictScenario } from "./scenarioPredictor";
import { groupMatches, knockoutMatches } from "../data/matches";
import { calcBracketTeams } from "./bracket";
import { GROUPS } from "../data/teams";
import { mulberry32, simulateTournament } from "./scenarioSim";
import { computeCurrentElo } from "./eloModel";

const allCodes = Object.values(GROUPS)
  .flat()
  .map((t: any) => t.code);

function genForms(n: number, seed: number) {
  const rnd = mulberry32(seed);
  const pick = () => allCodes[Math.floor(rnd() * allCodes.length)];
  const forms: Record<string, any> = {};
  for (let i = 0; i < n; i++) {
    let c = pick();
    let r = pick();
    while (r === c) r = pick();
    forms[`f${i}`] = {
      formId: `f${i}`,
      userId: `u${i}`,
      formName: `F${i}`,
      status: "submitted",
      matches: predictScenario(c, r, groupMatches, knockoutMatches, calcBracketTeams, {}),
    };
  }
  return forms;
}

// Group stage fully played (KO untouched) — the realistic mid-tournament shape.
function groupsPlayedWorld(seed: number) {
  const full = simulateTournament(mulberry32(seed), {}, computeCurrentElo({}));
  const out: Record<string, any> = {};
  for (const m of groupMatches) out[m.id] = full[m.id];
  return out;
}

describe("targetHitFlags", () => {
  it("flags win / podium / refund bands / last", () => {
    expect(targetHitFlags(1, 50)).toMatchObject({ win: true, podium: true, last: false });
    expect(targetHitFlags(3, 50).podium).toBe(true);
    expect(targetHitFlags(4, 50).podium).toBe(false);
    expect(targetHitFlags(100 - TARGET_BAND, 300).p100).toBe(true);
    expect(targetHitFlags(100 + TARGET_BAND + 1, 300).p100).toBe(false);
    expect(targetHitFlags(200, 300).p200).toBe(true);
    expect(targetHitFlags(300, 300).last).toBe(true);
    expect(targetHitFlags(299, 300).last).toBe(false);
  });
});

describe("runPersonalAnalysis", () => {
  const forms = genForms(6, 21);
  const results = groupsPlayedWorld(33);
  const bonuses = {};
  const SIMS = 300;
  const SEED = 7;

  const watch = knockoutMatches
    .filter((m) => m.stage === "R32")
    .slice(0, 2)
    .map((m) => ({ id: m.id, isKnockout: true }));

  const agg = runPersonalAnalysis({
    allPredictions: forms,
    results,
    actualBonuses: bonuses,
    targetFormIds: ["f0", "f3"],
    watchMatches: watch,
    simCount: SIMS,
    seed: SEED,
  });

  it("histograms account for every sim, for every target form", () => {
    expect(agg.simCount).toBe(SIMS);
    expect(agg.nForms).toBe(6);
    for (const tf of agg.targetForms) {
      expect(tf.hist.reduce((a, b) => a + b, 0)).toBe(SIMS);
      expect(tf.lastCount).toBeLessThanOrEqual(SIMS);
      expect(tf.hits.win).toBe(tf.hist[0]);
    }
  });

  it("conditional slices partition the run and never exceed it", () => {
    for (const wm of agg.watch) {
      const total = wm.outcomes.reduce((a, o) => a + o.n, 0);
      expect(total).toBe(SIMS); // known matchup → sampled in every sim
      for (const o of wm.outcomes) {
        expect(["home", "away"]).toContain(o.key); // KO has no draw outcome
        for (const h of o.hits) {
          expect(h.win).toBeLessThanOrEqual(o.n);
          expect(h.last).toBeLessThanOrEqual(o.n);
        }
      }
      expect(wm.shake).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const again = runPersonalAnalysis({
      allPredictions: forms,
      results,
      actualBonuses: bonuses,
      targetFormIds: ["f0", "f3"],
      watchMatches: watch,
      simCount: SIMS,
      seed: SEED,
    });
    expect(again).toEqual(agg);
  });

  it("chunk callback receives cumulative snapshots and can stop the run", () => {
    const seen: number[] = [];
    const partial = runPersonalAnalysis({
      allPredictions: forms,
      results,
      actualBonuses: bonuses,
      targetFormIds: ["f0"],
      watchMatches: [],
      simCount: 100000, // would be huge — but we stop after the first chunk
      seed: SEED,
      onChunk: (snap, done) => {
        seen.push(done);
        expect(snap.targetForms[0].hist.reduce((a, b) => a + b, 0)).toBe(done);
        return false;
      },
    });
    expect(seen).toEqual([2000]); // CHUNK_SIMS
    expect(partial.simCount).toBe(2000);
  });

  // Head-to-head: `beat` counts sims where the target finished STRICTLY
  // above the rival, overall and inside every outcome slice.
  describe("rival (beat) counters", () => {
    const rivalAgg = runPersonalAnalysis({
      allPredictions: forms,
      results,
      actualBonuses: bonuses,
      targetFormIds: ["f0", "f3"],
      rivalFormId: "f3",
      watchMatches: watch,
      simCount: SIMS,
      seed: SEED,
    });

    it("echoes the rival and zeroes beat without one", () => {
      expect(rivalAgg.rivalFormId).toBe("f3");
      expect(agg.rivalFormId).toBeNull();
      for (const tf of agg.targetForms) expect(tf.hits.beat).toBe(0);
    });

    it("a form never beats itself; beat is bounded by the run", () => {
      const self = rivalAgg.targetForms.find((t) => t.formId === "f3")!;
      expect(self.hits.beat).toBe(0);
      const f0 = rivalAgg.targetForms.find((t) => t.formId === "f0")!;
      expect(f0.hits.beat).toBeGreaterThanOrEqual(0);
      expect(f0.hits.beat).toBeLessThanOrEqual(SIMS);
    });

    it("beat is anti-symmetric up to exact ties", () => {
      const mirror = runPersonalAnalysis({
        allPredictions: forms,
        results,
        actualBonuses: bonuses,
        targetFormIds: ["f0", "f3"],
        rivalFormId: "f0",
        watchMatches: watch,
        simCount: SIMS,
        seed: SEED,
      });
      const f0BeatsF3 = rivalAgg.targetForms.find((t) => t.formId === "f0")!.hits.beat;
      const f3BeatsF0 = mirror.targetForms.find((t) => t.formId === "f3")!.hits.beat;
      expect(f0BeatsF3 + f3BeatsF0).toBeLessThanOrEqual(SIMS);
      expect(f0BeatsF3 + f3BeatsF0).toBeGreaterThan(0);
    });

    it("per-outcome beat slices partition the overall beat count", () => {
      const idx = rivalAgg.targetForms.findIndex((t) => t.formId === "f0");
      const overall = rivalAgg.targetForms[idx].hits.beat;
      for (const wm of rivalAgg.watch) {
        const sliced = wm.outcomes.reduce((a, o) => a + (o.hits[idx].beat || 0), 0);
        expect(sliced).toBe(overall); // known matchup → every sim lands in a slice
      }
    });

    it("does not perturb the money-target aggregates", () => {
      // Same seed, same sims — adding a rival must not change anything else.
      const f0 = rivalAgg.targetForms.find((t) => t.formId === "f0")!;
      const f0Base = agg.targetForms.find((t) => t.formId === "f0")!;
      expect(f0.hist).toEqual(f0Base.hist);
      expect({ ...f0.hits, beat: 0 }).toEqual({ ...f0Base.hits, beat: 0 });
    });
  });

  // PARITY LOCK with the canonical scenario engine: same inputs, same seed →
  // the same tournaments are sampled and ranked through the same scorer, so
  // P(rank=1) from our dense-rank histogram must equal the engine's
  // overall.winProb, form for form. (Dense rank 1 ⊇ positional first — they
  // differ only under exact ties, which compareTiebreaker + formId ordering
  // make effectively impossible here; equality IS the lock.)
  it("same-seed parity with runScenarioSimulation.overall", () => {
    const mine = runPersonalAnalysis({
      allPredictions: forms,
      results,
      actualBonuses: bonuses,
      targetFormIds: Object.keys(forms),
      watchMatches: [],
      simCount: SIMS,
      seed: SEED,
    });
    const engine = runScenarioSimulation({
      allPredictions: forms,
      results,
      actualBonuses: bonuses,
      simCount: SIMS,
      seed: SEED,
    });
    expect(engine.overall).toBeTruthy();
    for (const tf of mine.targetForms) {
      const i = engine.formOrder.indexOf(tf.formId);
      expect(i).toBeGreaterThanOrEqual(0);
      const myWinProb = tf.hist[0] / SIMS;
      // The engine rounds winProb to 4dp before persisting — allow exactly
      // that rounding, nothing more.
      expect(Math.abs(myWinProb - engine.overall!.winProb[i])).toBeLessThanOrEqual(0.00005);
    }
  });
});
