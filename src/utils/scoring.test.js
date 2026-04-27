import { describe, it, expect } from "vitest";
import { calculateMatchPoints, POINTS, BONUSES } from "./scoring";

// Smoke tests that lock the scoring schema in place. The exhaustive
// arithmetic coverage still lives in tests/test-scoring.mjs (legacy
// harness); these guards just verify the public contract callers
// rely on so a refactor of scoring.js can't silently change shape.

describe("POINTS schema", () => {
  it("exposes a stage entry for every tournament round", () => {
    for (const stage of ["group", "R32", "R16", "QF", "SF", "3RD", "F"]) {
      expect(POINTS[stage]).toBeDefined();
      expect(typeof POINTS[stage].outcome).toBe("number");
      expect(typeof POINTS[stage].exactScore).toBe("number");
      expect(typeof POINTS[stage].advancing).toBe("number");
    }
  });

  it("escalates outcome value as the tournament deepens", () => {
    // Higher rounds carry more weight — a refactor that flattens or
    // inverts these breaks the leaderboard's intended pacing.
    expect(POINTS.group.outcome).toBeLessThan(POINTS.R32.outcome);
    expect(POINTS.R32.outcome).toBeLessThan(POINTS.R16.outcome);
    expect(POINTS.R16.outcome).toBeLessThan(POINTS.QF.outcome);
    expect(POINTS.QF.outcome).toBeLessThan(POINTS.SF.outcome);
    expect(POINTS.SF.outcome).toBeLessThanOrEqual(POINTS.F.outcome);
  });

  it("3rd-place + final share advancing=0 (terminal stages)", () => {
    expect(POINTS["3RD"].advancing).toBe(0);
    expect(POINTS.F.advancing).toBe(0);
  });
});

describe("BONUSES schema", () => {
  it("exposes champion + topScorer bonuses as positive integers", () => {
    expect(BONUSES.champion).toBeGreaterThan(0);
    expect(BONUSES.topScorer).toBeGreaterThan(0);
  });
});

describe("calculateMatchPoints — gate cases", () => {
  it("returns 0 when the actual match has no result yet", () => {
    const out = calculateMatchPoints(
      { homeScore: 2, awayScore: 1 },
      { homeScore: null, awayScore: null },
      "group",
    );
    expect(out.points).toBe(0);
    expect(out.breakdown).toBe("טרם שוחק");
  });

  it("returns 0 when the user did not predict", () => {
    const out = calculateMatchPoints(
      { homeScore: null, awayScore: null },
      { homeScore: 2, awayScore: 1 },
      "group",
    );
    expect(out.points).toBe(0);
    expect(out.breakdown).toBe("אין ניחוש");
  });

  it("rewards an exact-score group prediction with outcome + exactScore", () => {
    const out = calculateMatchPoints(
      { homeScore: 2, awayScore: 1 },
      { homeScore: 2, awayScore: 1 },
      "group",
    );
    expect(out.points).toBe(POINTS.group.outcome + POINTS.group.exactScore);
    expect(out.outcomePoints).toBe(POINTS.group.outcome);
    expect(out.exactPoints).toBe(POINTS.group.exactScore);
  });

  it("rewards correct outcome but wrong score with outcome only", () => {
    const out = calculateMatchPoints(
      { homeScore: 3, awayScore: 0 },
      { homeScore: 1, awayScore: 0 },
      "group",
    );
    expect(out.points).toBe(POINTS.group.outcome);
    expect(out.exactPoints).toBe(0);
  });

  it("returns 0 outcome points for a wrong outcome", () => {
    const out = calculateMatchPoints(
      { homeScore: 0, awayScore: 1 },
      { homeScore: 2, awayScore: 0 },
      "group",
    );
    expect(out.outcomePoints).toBe(0);
    expect(out.exactPoints).toBe(0);
    expect(out.points).toBe(0);
  });
});
