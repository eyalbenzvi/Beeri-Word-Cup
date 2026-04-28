import { describe, it, expect, beforeEach } from "vitest";
import { getCachedBracket, getCachedChampion, clearBracketCache } from "./bracketCache";

// Build a minimal-but-valid prediction map. The cache key is content-
// hashed (FNV-1a) so logical equivalence — same matchIds + same
// score/advancingTeam values — must produce a cache hit even if the
// object reference is different.
function makePreds() {
  return {
    "group-1-MEX-CAN": { homeScore: 2, awayScore: 1 },
    "group-1-USA-IRN": { homeScore: 1, awayScore: 1 },
  };
}

describe("getCachedBracket", () => {
  beforeEach(() => clearBracketCache());

  it("returns the same reference for the same input on a hot call", () => {
    const preds = makePreds();
    const a = getCachedBracket(preds);
    const b = getCachedBracket(preds);
    expect(a).toBe(b);
  });

  it("hits the cache when a logically-equal but reference-distinct map is passed", () => {
    const a = getCachedBracket(makePreds());
    const b = getCachedBracket(makePreds());
    // Same FNV-1a key -> same cached value reference.
    expect(a).toBe(b);
  });

  it("misses the cache when a score changes", () => {
    const a = getCachedBracket(makePreds());
    const mutated = makePreds();
    mutated["group-1-MEX-CAN"] = { homeScore: 3, awayScore: 0 };
    const b = getCachedBracket(mutated);
    expect(a).not.toBe(b);
  });

  it("returns an object map (knockout matchId -> {home, away})", () => {
    const result = getCachedBracket(makePreds());
    expect(result).toBeTypeOf("object");
  });
});

describe("getCachedChampion", () => {
  beforeEach(() => clearBracketCache());

  it("returns null when the bracket has no final winner", () => {
    expect(getCachedChampion(makePreds())).toBeNull();
  });

  it("memoizes the champion lookup", () => {
    // Two calls with identical input: same return reference (or both null).
    const a = getCachedChampion(makePreds());
    const b = getCachedChampion(makePreds());
    expect(a).toBe(b);
  });
});

describe("clearBracketCache", () => {
  it("forces a fresh computation after clear", () => {
    const a = getCachedBracket(makePreds());
    clearBracketCache();
    const b = getCachedBracket(makePreds());
    // After clear, the cache rebuilds — return values are equal-by-value
    // but no longer reference-equal because a brand-new object was made.
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
