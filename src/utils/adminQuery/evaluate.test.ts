import { describe, it, expect } from "vitest";
import { evaluate } from "./evaluate";
import type { FlatForm, QuerySpec, StageScore } from "./types";

function emptyStageScore(): StageScore {
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
      groups: emptyStageScore(),
      R32: emptyStageScore(),
      R16: emptyStageScore(),
      QF: emptyStageScore(),
      SF: emptyStageScore(),
      F: emptyStageScore(),
    },
    matches: {},
    totalPoints: 0,
    ...partial,
  };
}

describe("evaluator — count + filter", () => {
  it("counts forms by champion", () => {
    const forms = [
      makeFlat({ formId: "1", champion: "ARG" }),
      makeFlat({ formId: "2", champion: "BRA" }),
      makeFlat({ formId: "3", champion: "ARG" }),
    ];
    const spec: QuerySpec = {
      filter: { op: "cmp", field: "champion", operator: "eq", value: "ARG" },
      aggregate: { kind: "count" },
    };
    const r = evaluate(spec, forms);
    expect(r).toMatchObject({ kind: "count", value: 2 });
  });

  it("excludes drafts by default (Bug #5)", () => {
    const forms = [
      makeFlat({ formId: "1", status: "submitted" }),
      makeFlat({ formId: "2", status: "draft" }),
    ];
    const r = evaluate({ aggregate: { kind: "count" } }, forms);
    expect((r as any).value).toBe(1);
  });

  it("includes drafts when scope.includeDrafts", () => {
    const forms = [
      makeFlat({ formId: "1", status: "submitted" }),
      makeFlat({ formId: "2", status: "draft" }),
    ];
    const r = evaluate(
      { scope: { includeDrafts: true }, aggregate: { kind: "count" } },
      forms,
    );
    expect((r as any).value).toBe(2);
  });

  it("handles null bracket arrays without crashing (Bug #3)", () => {
    const forms = [makeFlat({ qfTeams: [null, null, null, null] })];
    const r = evaluate(
      {
        filter: { op: "teamReachedStage", team: "ARG", stage: "QF" },
        aggregate: { kind: "count" },
      },
      forms,
    );
    expect((r as any).value).toBe(0);
  });
});

describe("evaluator — predicates", () => {
  it("`in` with negated", () => {
    const forms = [
      makeFlat({ formId: "1", champion: "ARG" }),
      makeFlat({ formId: "2", champion: "BRA" }),
      makeFlat({ formId: "3", champion: "GER" }),
    ];
    const r = evaluate(
      {
        filter: { op: "in", field: "champion", values: ["ARG", "BRA"], negated: true },
        aggregate: { kind: "count" },
      },
      forms,
    );
    expect((r as any).value).toBe(1);
  });

  it("matchup unordered finds pair regardless of slot home/away", () => {
    const forms = [
      makeFlat({
        formId: "1",
        matches: {
          "QF-1": {
            home: "ARG",
            away: "BRA",
            homeScore: null,
            awayScore: null,
            advancingTeam: null,
            outcome: null,
            correctScore: null,
            correctOutcome: null,
            wrongMatchup: null,
          },
        },
      }),
      makeFlat({
        formId: "2",
        matches: {
          "QF-1": {
            home: "BRA",
            away: "ARG",
            homeScore: null,
            awayScore: null,
            advancingTeam: null,
            outcome: null,
            correctScore: null,
            correctOutcome: null,
            wrongMatchup: null,
          },
        },
      }),
    ];
    const r = evaluate(
      {
        filter: { op: "matchup", teams: ["ARG", "BRA"], stages: ["QF"], ordered: false },
        aggregate: { kind: "count" },
      },
      forms,
    );
    expect((r as any).value).toBe(2);
  });

  it("matchup ordered respects home/away", () => {
    const forms = [
      makeFlat({
        formId: "1",
        matches: {
          "QF-1": {
            home: "ARG",
            away: "BRA",
            homeScore: null,
            awayScore: null,
            advancingTeam: null,
            outcome: null,
            correctScore: null,
            correctOutcome: null,
            wrongMatchup: null,
          },
        },
      }),
      makeFlat({
        formId: "2",
        matches: {
          "QF-1": {
            home: "BRA",
            away: "ARG",
            homeScore: null,
            awayScore: null,
            advancingTeam: null,
            outcome: null,
            correctScore: null,
            correctOutcome: null,
            wrongMatchup: null,
          },
        },
      }),
    ];
    const r = evaluate(
      {
        filter: {
          op: "matchup",
          teams: ["ARG", "BRA"],
          stages: ["QF"],
          ordered: true,
        },
        aggregate: { kind: "count" },
      },
      forms,
    );
    expect((r as any).value).toBe(1);
  });

  it("containsAtLeast counts overlap correctly", () => {
    const forms = [
      makeFlat({ formId: "1", qfTeams: ["ARG", "BRA", "GER", "FRA", null, null, null, null] }),
      makeFlat({ formId: "2", qfTeams: ["ARG", "ESP", "ENG", "POR", null, null, null, null] }),
    ];
    const r = evaluate(
      {
        filter: {
          op: "containsAtLeast",
          field: { stage: "QF", teams: true } as any,
          values: ["ARG", "BRA", "GER"],
          n: 3,
        },
        aggregate: { kind: "count" },
      },
      forms,
    );
    expect((r as any).value).toBe(1);
  });
});

describe("evaluator — aggregates", () => {
  it("rank by totalPoints desc", () => {
    const forms = [
      makeFlat({ formId: "1", formName: "A", totalPoints: 10 }),
      makeFlat({ formId: "2", formName: "B", totalPoints: 30 }),
      makeFlat({ formId: "3", formName: "C", totalPoints: 20 }),
    ];
    const r = evaluate(
      { aggregate: { kind: "rank", by: { kind: "totalPoints" }, limit: 2 } },
      forms,
    );
    expect(r).toMatchObject({
      kind: "rank",
      rows: [
        { formId: "2", score: 30 },
        { formId: "3", score: 20 },
      ],
    });
  });

  it("groupBy field=champion + count handles nulls (Bug #12)", () => {
    const forms = [
      makeFlat({ formId: "1", champion: "ARG" }),
      makeFlat({ formId: "2", champion: null }),
      makeFlat({ formId: "3", champion: "ARG" }),
    ];
    const r = evaluate(
      {
        aggregate: {
          kind: "groupBy",
          key: { field: "champion" },
          then: { kind: "count" },
        },
      },
      forms,
    );
    const groups = (r as any).groups;
    const arg = groups.find((g: any) => g.key === "ARG");
    const none = groups.find((g: any) => g.key === "ללא ניחוש");
    expect(arg.value).toBe(2);
    expect(none.value).toBe(1);
  });

  it("rank by stage scoreComponent uses precomputed FlatForm field", () => {
    const forms = [
      makeFlat({
        formId: "1",
        stageScore: {
          groups: emptyStageScore(),
          R32: emptyStageScore(),
          R16: emptyStageScore(),
          QF: { ...emptyStageScore(), teams: 5 },
          SF: emptyStageScore(),
          F: emptyStageScore(),
        },
      }),
      makeFlat({
        formId: "2",
        stageScore: {
          groups: emptyStageScore(),
          R32: emptyStageScore(),
          R16: emptyStageScore(),
          QF: { ...emptyStageScore(), teams: 8 },
          SF: emptyStageScore(),
          F: emptyStageScore(),
        },
      }),
    ];
    const r = evaluate(
      {
        aggregate: {
          kind: "rank",
          by: { kind: "scoreComponent", component: "teams", stage: "QF" },
        },
      },
      forms,
    );
    expect((r as any).rows[0].formId).toBe("2");
  });
});
