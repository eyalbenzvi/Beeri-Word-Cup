import { describe, it, expect } from "vitest";
import { groupMatches, knockoutMatches } from "../data/matches";
import { calcBracketTeams } from "./bracket";
import { predictAllMatches, predictScoreline } from "./fifaPredictor";
import { FIFA_RANK_DENSE } from "../data/fifaRanking";
import { mulberry32, runScenarioSimulation, computeEffectiveRanks } from "./scenarioSim";

function buildFixture(nForms: number) {
  const rng = mulberry32(1);
  const results: Record<string, any> = {};
  const remaining = new Set(groupMatches.slice(-6).map((m) => m.id));
  for (const m of groupMatches) {
    if (remaining.has(m.id)) continue;
    const { homeScore, awayScore } = predictScoreline(
      FIFA_RANK_DENSE[m.homeTeam!] || 25,
      FIFA_RANK_DENSE[m.awayTeam!] || 25,
      rng,
    );
    results[m.id] = { homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore, awayScore, stage: "group", group: m.group, played: true };
  }
  const allPredictions: Record<string, any> = {};
  for (let i = 0; i < nForms; i++) {
    const matches = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {}, rng);
    allPredictions[`u${i}__${1000 + i}`] = { userId: `u${i}`, formName: `Form ${i}`, status: "submitted", matches };
  }
  // A draft form must be excluded from the run.
  allPredictions["draft__1"] = { userId: "drafter", formName: "Draft", status: "draft", matches: {} };
  return { results, allPredictions };
}

describe("runScenarioSimulation", () => {
  const { results, allPredictions } = buildFixture(20);
  const run = () =>
    runScenarioSimulation({ allPredictions, results, actualBonuses: { topScorers: [] }, simCount: 500, seed: 7 });

  it("is deterministic for a fixed seed (modulo the generatedAt timestamp)", () => {
    const strip = (r: any) => ({ ...r, meta: { ...r.meta, generatedAt: 0 } });
    expect(JSON.stringify(strip(run()))).toBe(JSON.stringify(strip(run())));
  });

  it("excludes non-submitted forms", () => {
    const res = run();
    expect(res.forms["draft__1"]).toBeUndefined();
    expect(res.meta.formCount).toBe(20);
  });

  it("win probabilities across forms sum to ~1 (one winner per sim)", () => {
    const res = run();
    const total = Object.values(res.forms).reduce((s, f) => s + f.winProb, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("champion probabilities sum to ~1 and are sorted descending", () => {
    const res = run();
    const total = res.champions.reduce((s, c) => s + c.prob, 0);
    expect(total).toBeCloseTo(1, 5);
    for (let i = 1; i < res.champions.length; i++) {
      expect(res.champions[i - 1].prob).toBeGreaterThanOrEqual(res.champions[i].prob);
    }
  });

  it("produces finite, JSON-safe stats (no NaN) with median within IQR", () => {
    const res = run();
    const json = JSON.stringify(res);
    expect(json).not.toContain("null,null"); // sanity: structure intact
    for (const f of Object.values(res.forms)) {
      expect(Number.isFinite(f.winProb)).toBe(true);
      expect(Number.isFinite(f.meanRank)).toBe(true);
      expect(f.q25).toBeLessThanOrEqual(f.medianRank);
      expect(f.medianRank).toBeLessThanOrEqual(f.q75);
    }
  });

  it("emits champion+runner-up scenario tables aligned to formOrder", () => {
    // More sims + a low sample floor so several scenarios clear the threshold.
    const res = runScenarioSimulation({
      allPredictions,
      results,
      actualBonuses: { topScorers: [] },
      simCount: 3000,
      seed: 7,
      minScenarioSamples: 30,
    });
    expect(res.scenarios.length).toBeGreaterThan(0);
    expect(res.formOrder.length).toBe(res.meta.formCount);
    for (const sc of res.scenarios) {
      expect(sc.champion).not.toBe(sc.runnerUp);
      expect(sc.avgRank.length).toBe(res.formOrder.length);
      expect(sc.avgPoints.length).toBe(res.formOrder.length);
      expect(sc.winProb.length).toBe(res.formOrder.length);
      // exactly one winner per sim → within-scenario win probs sum to ~1.
      const sum = sc.winProb.reduce((s, p) => s + p, 0);
      expect(sum).toBeGreaterThan(0.98);
      expect(sum).toBeLessThan(1.02);
      // averages are within sane bounds.
      for (const r of sc.avgRank) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(res.formOrder.length);
      }
    }
  });

  it("effective ranks stay within [1,48]", () => {
    const eff = computeEffectiveRanks(results);
    for (const r of Object.values(eff)) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(48);
    }
  });
});
