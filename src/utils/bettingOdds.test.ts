import { describe, it, expect } from "vitest";
import { oddsToPseudoElo, blendEloWithOdds } from "./bettingOdds";

describe("oddsToPseudoElo", () => {
  it("maps higher implied probability to higher pseudo-Elo, within bounds", () => {
    const pe = oddsToPseudoElo({ BRA: 0.2, FRA: 0.1, NZL: 0.01 });
    expect(pe.BRA).toBeGreaterThan(pe.FRA);
    expect(pe.FRA).toBeGreaterThan(pe.NZL);
    for (const v of Object.values(pe)) {
      expect(v).toBeGreaterThanOrEqual(1300);
      expect(v).toBeLessThanOrEqual(2300);
    }
  });

  it("returns empty for empty / all-zero input", () => {
    expect(oddsToPseudoElo({})).toEqual({});
    expect(oddsToPseudoElo({ BRA: 0 })).toEqual({});
  });
});

describe("blendEloWithOdds", () => {
  const elo = { BRA: 2015, FRA: 2080, NZL: 1500 };

  it("weight 0 leaves Elo unchanged; weight 1 is the pure pseudo-Elo", () => {
    const probs = { BRA: 0.2, FRA: 0.1 };
    expect(blendEloWithOdds(elo, probs, 0)).toEqual(elo);
    const pure = blendEloWithOdds(elo, probs, 1);
    const pe = oddsToPseudoElo(probs);
    expect(pure.BRA).toBeCloseTo(pe.BRA, 9);
    expect(pure.FRA).toBeCloseTo(pe.FRA, 9);
    expect(pure.NZL).toBe(elo.NZL); // not in the odds → untouched (fallback)
  });

  it("only adjusts teams present in both elo and odds", () => {
    const out = blendEloWithOdds(elo, { BRA: 0.2, XXX: 0.5 }, 0.5);
    expect(out.XXX).toBeUndefined(); // unknown finalist ignored
    expect(out.FRA).toBe(elo.FRA); // not in odds → unchanged
    expect(out.BRA).not.toBe(elo.BRA);
  });
});
