import { describe, it, expect } from "vitest";
import { groupMatches, knockoutMatches } from "../data/matches";
import { calcBracketTeams } from "./bracket";
import { predictAllMatches, predictScoreline } from "./fifaPredictor";
import { FIFA_RANK_DENSE } from "../data/fifaRanking";
import { mulberry32, runScenarioSimulation, fitScenarioRunToDoc } from "./scenarioSim";

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

  it("excludes non-submitted forms (forms map holds only eligible labels)", () => {
    const res = run();
    expect(res.forms["draft__1"]).toBeUndefined();
    expect(res.meta.formCount).toBe(20);
    expect(Object.keys(res.forms).length).toBe(20);
  });

  it("returns a valid empty run when there are no eligible forms", () => {
    const res = runScenarioSimulation({
      allPredictions: { draft__1: { userId: "d", formName: "D", status: "draft", matches: {} } },
      results,
      actualBonuses: { topScorers: [] },
      simCount: 100,
      seed: 1,
    });
    expect(res.meta.formCount).toBe(0);
    expect(res.formOrder).toEqual([]);
    expect(res.scenarios).toEqual([]);
    expect(res.champions).toEqual([]);
  });

  it("champion probabilities sum to ~1 and are sorted descending", () => {
    const res = run();
    const total = res.champions.reduce((s, c) => s + c.prob, 0);
    expect(total).toBeCloseTo(1, 5);
    for (let i = 1; i < res.champions.length; i++) {
      expect(res.champions[i - 1].prob).toBeGreaterThanOrEqual(res.champions[i].prob);
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
      // averages are within sane bounds and JSON-safe (no NaN/Infinity, which
      // safeClone would silently turn into null → break the UI's toFixed).
      for (let i = 0; i < sc.avgRank.length; i++) {
        expect(Number.isFinite(sc.avgRank[i])).toBe(true);
        expect(Number.isFinite(sc.avgPoints[i])).toBe(true);
        expect(Number.isFinite(sc.winProb[i])).toBe(true);
        expect(sc.avgRank[i]).toBeGreaterThanOrEqual(1);
        expect(sc.avgRank[i]).toBeLessThanOrEqual(res.formOrder.length);
      }
    }
  });

  it("emits a 'no-scenario' overall table pooled over every sim", () => {
    const res = run();
    expect(res.overall).toBeDefined();
    const ov = res.overall!;
    expect(ov.samples).toBe(500);
    expect(ov.avgRank.length).toBe(res.formOrder.length);
    expect(ov.avgPoints.length).toBe(res.formOrder.length);
    expect(ov.winProb.length).toBe(res.formOrder.length);
    // Every sim crowns exactly one winning form → overall win probs sum to ~1.
    const sum = ov.winProb.reduce((s, p) => s + p, 0);
    expect(sum).toBeGreaterThan(0.98);
    expect(sum).toBeLessThan(1.02);
    for (let i = 0; i < ov.avgRank.length; i++) {
      expect(Number.isFinite(ov.avgRank[i])).toBe(true);
      expect(Number.isFinite(ov.avgPoints[i])).toBe(true);
      expect(Number.isFinite(ov.winProb[i])).toBe(true);
      expect(ov.avgRank[i]).toBeGreaterThanOrEqual(1);
      expect(ov.avgRank[i]).toBeLessThanOrEqual(res.formOrder.length);
    }
  });

  it("the empty run carries an empty overall aggregate", () => {
    const res = runScenarioSimulation({
      allPredictions: { draft__1: { userId: "d", formName: "D", status: "draft", matches: {} } },
      results,
      actualBonuses: { topScorers: [] },
      simCount: 100,
      seed: 1,
    });
    expect(res.overall).toEqual({ samples: 0, avgRank: [], avgPoints: [], winProb: [] });
  });

  it("fitScenarioRunToDoc leaves a small run untouched and trims a huge one", () => {
    const res = runScenarioSimulation({
      allPredictions, results, actualBonuses: { topScorers: [] }, simCount: 3000, seed: 7, minScenarioSamples: 30,
    });
    const big = fitScenarioRunToDoc(res, 5_000_000);
    expect(big.trimmed).toBe(0);
    expect(big.run.scenarios.length).toBe(res.scenarios.length);

    // Trimming drops scenarios but must preserve the overall aggregate.
    expect(big.run.overall).toEqual(res.overall);

    const tiny = fitScenarioRunToDoc(res, 1000);
    expect(tiny.run.scenarios.length).toBeLessThanOrEqual(1);
    expect(tiny.trimmed).toBeGreaterThan(0);
    expect(tiny.run.overall).toEqual(res.overall);
    if (tiny.run.scenarios.length === 1) {
      expect(tiny.run.scenarios[0].samples).toBe(res.scenarios[0].samples);
    }
  });
});
