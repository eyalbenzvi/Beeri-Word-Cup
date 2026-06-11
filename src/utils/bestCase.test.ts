import { describe, it, expect } from "vitest";
import { isBestCaseAvailable } from "./bestCase";
import { groupMatches, knockoutMatches } from "../data/matches";

// Regression guard for the best-case availability gate: the optimizer is
// offered only once the group stage is fully played (all R32 qualifiers
// determined). Running it earlier is both meaningless (best case is
// trivially rank 1) and prohibitively slow — refine over 72 open group
// matches with a real form population takes minutes in the worker.

function fullGroupResults(): Record<string, any> {
  const results: Record<string, any> = {};
  for (const m of groupMatches) {
    results[m.id] = { homeScore: 1, awayScore: 0, stage: "group" };
  }
  return results;
}

describe("isBestCaseAvailable", () => {
  it("is unavailable with no results (pre-tournament / listener not loaded)", () => {
    expect(isBestCaseAvailable({})).toBe(false);
    expect(isBestCaseAvailable(null)).toBe(false);
    expect(isBestCaseAvailable(undefined)).toBe(false);
  });

  it("is unavailable while even one group match is missing", () => {
    const results = fullGroupResults();
    delete results[groupMatches[groupMatches.length - 1].id];
    expect(isBestCaseAvailable(results)).toBe(false);
  });

  it("is unavailable when a result entry exists but has no valid score", () => {
    const results = fullGroupResults();
    results[groupMatches[0].id] = { homeScore: null, awayScore: null };
    expect(isBestCaseAvailable(results)).toBe(false);
  });

  it("becomes available exactly when all 72 group matches have valid results", () => {
    expect(groupMatches.length).toBe(72);
    expect(isBestCaseAvailable(fullGroupResults())).toBe(true);
  });

  it("ignores knockout results — they neither unlock nor block", () => {
    // KO results alone don't unlock…
    const koOnly: Record<string, any> = {};
    for (const m of knockoutMatches) {
      koOnly[m.id] = { homeScore: 2, awayScore: 1, stage: m.stage };
    }
    expect(isBestCaseAvailable(koOnly)).toBe(false);

    // …and on top of a complete group stage they don't block.
    expect(isBestCaseAvailable({ ...fullGroupResults(), ...koOnly })).toBe(true);
  });
});
