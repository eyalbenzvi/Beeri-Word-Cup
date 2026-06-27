import { describe, it, expect } from "vitest";
import { eloOutcomeProbabilities, computeCurrentElo, shootoutHomeAdvances } from "./eloModel";
import { ELO_RATINGS } from "../data/eloRatings";
import { GROUPS } from "../data/teams";
import { groupMatches } from "../data/matches";
import { mulberry32 } from "./scenarioSim";

describe("ELO_RATINGS data", () => {
  it("covers every one of the 48 finalists (no team relies on the fallback)", () => {
    const codes = Object.values(GROUPS).flatMap((teams: any) => teams.map((t: any) => t.code));
    expect(codes.length).toBe(48);
    for (const code of codes) expect(ELO_RATINGS[code], `missing Elo for ${code}`).toBeTypeOf("number");
  });
});

describe("eloOutcomeProbabilities", () => {
  it("is a valid distribution (sums to 1, all in [0,1])", () => {
    for (const [eH, eA] of [[2000, 2000], [2100, 1600], [1500, 2100], [1850, 1870]]) {
      const p = eloOutcomeProbabilities(eH, eA);
      expect(p.homeWin + p.draw + p.awayWin).toBeCloseTo(1, 10);
      for (const v of [p.homeWin, p.draw, p.awayWin]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("favours the stronger side and is symmetric", () => {
    const strong = eloOutcomeProbabilities(2100, 1700);
    expect(strong.homeWin).toBeGreaterThan(strong.awayWin);
    const flipped = eloOutcomeProbabilities(1700, 2100);
    // swapping home/away mirrors the probabilities.
    expect(strong.homeWin).toBeCloseTo(flipped.awayWin, 10);
    expect(strong.awayWin).toBeCloseTo(flipped.homeWin, 10);
    expect(strong.draw).toBeCloseTo(flipped.draw, 10);
  });

  it("equal teams give equal win probabilities and the highest draw rate", () => {
    const even = eloOutcomeProbabilities(1900, 1900);
    expect(even.homeWin).toBeCloseTo(even.awayWin, 10);
    expect(even.draw).toBeGreaterThan(eloOutcomeProbabilities(2100, 1500).draw);
  });
});

describe("computeCurrentElo", () => {
  it("returns base ratings when nothing has been played", () => {
    const elo = computeCurrentElo({});
    expect(elo.ARG).toBe(ELO_RATINGS.ARG);
    expect(elo.NZL).toBe(ELO_RATINGS.NZL);
  });

  it("is zero-sum per match and rewards a winner", () => {
    const m = groupMatches[0];
    const before = ELO_RATINGS[m.homeTeam!] ?? 1650;
    const beforeA = ELO_RATINGS[m.awayTeam!] ?? 1650;
    const elo = computeCurrentElo({
      [m.id]: { homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: 3, awayScore: 0, stage: "group", group: m.group, played: true },
    });
    expect(elo[m.homeTeam!]).toBeGreaterThan(before);
    expect(elo[m.awayTeam!]).toBeLessThan(beforeA);
    // zero-sum: total rating is conserved.
    expect(elo[m.homeTeam!] - before).toBeCloseTo(beforeA - elo[m.awayTeam!], 9);
  });
});

describe("shootoutHomeAdvances", () => {
  it("favours the stronger team but stays well short of certainty", () => {
    const rng = mulberry32(3);
    let homeWins = 0;
    for (let i = 0; i < 4000; i++) if (shootoutHomeAdvances(2100, 1600, rng)) homeWins++;
    const share = homeWins / 4000;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.85); // edge is damped, not deterministic
  });
});
