import { describe, it, expect } from "vitest";
import { CANNED_QUERIES } from "./cannedQueries";
import { canonicalize } from "./canonicalize";
import { validateQuerySpec } from "./schemas";
import { evaluate } from "./evaluate";
import { interpretSpec } from "./interpret";
import type { FlatForm, StageScore } from "./types";

function emptyStage(): StageScore {
  return { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 };
}

function makeFlat(partial: Partial<FlatForm>): FlatForm {
  return {
    formId: "f",
    formName: "n",
    ownerName: "o",
    status: "submitted",
    champion: null,
    topScorer: null,
    correctChampion: null,
    correctTopScorer: null,
    r32Teams: [],
    r16Teams: [],
    qfTeams: [],
    sfTeams: [],
    finalTeams: [],
    stageScore: {
      groups: emptyStage(),
      R32: emptyStage(),
      R16: emptyStage(),
      QF: emptyStage(),
      SF: emptyStage(),
      F: emptyStage(),
    },
    matches: {},
    totalPoints: 0,
    ...partial,
  };
}

describe("canned queries — every spec is valid + evaluable", () => {
  const fixture: FlatForm[] = [
    makeFlat({ formId: "1", champion: "ARG", totalPoints: 100, status: "submitted" }),
    makeFlat({ formId: "2", champion: "BRA", totalPoints: 50, status: "submitted" }),
    makeFlat({ formId: "3", champion: "ARG", totalPoints: 0, status: "draft" }),
  ];

  for (const q of CANNED_QUERIES) {
    it(`canonicalize+validate+evaluate: "${q.title}"`, () => {
      const c = canonicalize(q.spec);
      const v = validateQuerySpec(c);
      expect(v.ok, (v as any).error).toBe(true);
      const r = evaluate(c, fixture);
      expect(r).toBeDefined();
    });

    it(`interpret produces non-empty Hebrew: "${q.title}"`, () => {
      const out = interpretSpec(q.spec);
      expect(out.sentence.length).toBeGreaterThan(0);
      expect(out.structured.length).toBeGreaterThan(0);
    });
  }
});

describe("interpreter determinism (Bug #11)", () => {
  it("same spec produces same output", () => {
    const spec = CANNED_QUERIES[0].spec;
    const a = interpretSpec(spec);
    const b = interpretSpec(spec);
    expect(a.sentence).toBe(b.sentence);
    expect(a.structured).toEqual(b.structured);
  });
});
