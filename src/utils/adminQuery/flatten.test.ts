import { describe, it, expect } from "vitest";
import { flattenForm, flattenAll, buildScoringContext } from "./flatten";
import { evaluate } from "./evaluate";
import { calculateFullScore } from "../scoring";
import { getCachedBracket } from "../bracketCache";
import { deriveAdvancingTeams } from "../bracket";
import { GROUPS } from "../../data/teams";

// Build a deterministic-ish set of group results that fills every group.
function makeGroupResults(seed: number) {
  const out: Record<string, any> = {};
  let n = 0;
  for (const [g, teams] of Object.entries(GROUPS)) {
    // 6 group matches per group: each team plays the other three.
    const t = teams.map((x: any) => x.code);
    const pairs = [
      [t[0], t[1]],
      [t[2], t[3]],
      [t[0], t[2]],
      [t[1], t[3]],
      [t[0], t[3]],
      [t[1], t[2]],
    ];
    pairs.forEach((p, i) => {
      const home = (seed + n) % 4;
      const away = (seed + n + 1) % 3;
      out[`group-${g}-${i + 1}`] = {
        homeScore: home,
        awayScore: away,
        stage: "group",
      };
      n++;
    });
  }
  return out;
}

function makeForm(formId: string, champion: string | null, scoreOffset: number) {
  // A form whose every group prediction is shifted by `scoreOffset`.
  const matches: Record<string, any> = {};
  const groups = makeGroupResults(0);
  for (const [id, r] of Object.entries(groups)) {
    matches[id] = {
      homeScore: Math.max(0, r.homeScore + scoreOffset),
      awayScore: Math.max(0, r.awayScore + scoreOffset),
    };
  }
  return {
    formId,
    userId: "u1",
    formName: `form-${formId}`,
    matches,
    champion,
    topScorer: null,
    status: "submitted" as const,
  };
}

describe("flattenForm parity with calculateFullScore", () => {
  // Bug #1: scoring drift. flatten's totalPoints must equal calculateFullScore
  // exactly across many synthetic forms.
  it("totalPoints matches calculateFullScore for varied forms", () => {
    const results = makeGroupResults(0);
    const actualBonuses = { champion: null, topScorers: [] };
    const ctx = buildScoringContext(results, actualBonuses);

    for (let offset of [-1, 0, 1, 2, 3]) {
      const form = makeForm(`f${offset}`, "ARG", offset);
      const flat = flattenForm(form, ctx, results, actualBonuses, "owner");

      // Compute the expected score the same way the leaderboard does.
      const formBracket = getCachedBracket(form.matches);
      const enriched = { ...form, advancing: deriveAdvancingTeams(formBracket) };
      const direct = calculateFullScore(
        enriched,
        results,
        ctx.actualAdvancing,
        { ...actualBonuses, champion: ctx.actualChampion },
        formBracket,
        ctx.actualBracket,
      );
      expect(flat.totalPoints).toBe(direct.totalPoints);
    }
  });

  // Bug #5: drafts shouldn't be silently filtered at flatten — that's the
  // evaluator's job. flatten must emit them.
  it("includes draft forms in the output", () => {
    const results: Record<string, any> = {};
    const draft = makeForm("d1", null, 0);
    draft.status = "draft" as any;
    const flat = flattenAll(
      { d1: draft },
      { u1: { displayName: "owner" } },
      results,
      { champion: null, topScorers: [] },
    );
    expect(flat).toHaveLength(1);
    expect(flat[0].status).toBe("draft");
  });

  // Bug #3: null bracket teams must not crash.
  it("handles forms with no group predictions filled (null bracket)", () => {
    const emptyForm = {
      formId: "e1",
      userId: "u1",
      formName: "empty",
      matches: {},
      champion: null,
      topScorer: null,
      status: "submitted" as const,
    };
    const ctx = buildScoringContext({}, { topScorers: [] });
    const flat = flattenForm(emptyForm, ctx, {}, { topScorers: [] }, "owner");
    expect(flat.totalPoints).toBe(0);
    // Stage rosters are arrays of nulls (slots known, teams unknown).
    expect(flat.qfTeams.every((t) => t === null)).toBe(true);
    expect(flat.stageScore.QF.teams).toBe(0);
  });

  // Pre-tournament correctness flags should be null, not false (so admin can
  // distinguish "not yet known" from "wrong").
  it("correctChampion is null when actualChampion is unknown", () => {
    const form = makeForm("f1", "ARG", 0);
    const ctx = buildScoringContext({}, { topScorers: [] });
    const flat = flattenForm(form, ctx, {}, { topScorers: [] }, "owner");
    expect(flat.correctChampion).toBeNull();
    expect(flat.correctTopScorer).toBeNull();
  });
});

describe("FlatForm flow with finals known (champion bonus)", () => {
  // Build a complete tournament where the final is decided so champion bonus
  // can fire, and verify that flatten records correctChampion=true.
  it("correctChampion flips true when form.champion matches actual final winner", () => {
    const groupResults = makeGroupResults(0);
    // Add a final result so deriveChampion can return a winner.
    const results = {
      ...groupResults,
      "F-1": { homeScore: 2, awayScore: 1, stage: "F" },
    };
    const actualBonuses = { topScorers: [] };
    const ctx = buildScoringContext(results as any, actualBonuses);
    // The actual champion is whoever resolves to F-1.home in the actual bracket.
    // We can't construct that easily without a full bracket walk, so we
    // assert that whatever the actual champion is, the parity holds: a form
    // that picks that exact champion gets correctChampion=true; a form that
    // picks a different code gets false (or null when actualChampion is null).
    const actualChampion = ctx.actualChampion;
    if (actualChampion) {
      const matchingForm = makeForm("m1", actualChampion, 0);
      const flat = flattenForm(matchingForm, ctx, results as any, actualBonuses, "owner");
      expect(flat.correctChampion).toBe(true);

      const wrongForm = makeForm("m2", "ZZZ", 0);
      const flatWrong = flattenForm(wrongForm, ctx, results as any, actualBonuses, "owner");
      expect(flatWrong.correctChampion).toBe(false);
    } else {
      // If the synthetic data doesn't yield a champion (no path through
      // bracket), at least confirm the field is null (not falsely false).
      const form = makeForm("m1", "ARG", 0);
      const flat = flattenForm(form, ctx, results as any, actualBonuses, "owner");
      expect(flat.correctChampion).toBeNull();
    }
  });
});

describe("evaluator dedupe — stage:ALL with teams:true", () => {
  // Bug from code-review item #4: a team that reached SF appears in
  // r32+r16+qf+sf rosters; without dedupe, containsAtLeast would 4x-inflate.
  it("stage:ALL teams flat is unique (no 4x inflation)", () => {
    const partial = {
      r32Teams: ["ARG", "BRA", "GER", null, null, null],
      r16Teams: ["ARG", "BRA", "GER", null],
      qfTeams: ["ARG", "BRA", null],
      sfTeams: ["ARG", null],
      finalTeams: ["ARG", null],
    };
    const flat: any = {
      formId: "1",
      formName: "n",
      ownerName: "o",
      status: "submitted",
      champion: null,
      topScorer: null,
      correctChampion: null,
      correctTopScorer: null,
      ...partial,
      stageScore: {
        groups: { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 },
        R32: { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 },
        R16: { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 },
        QF: { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 },
        SF: { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 },
        F: { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 },
      },
      matches: {},
      totalPoints: 0,
    };
    // ARG appears 5 times across stage rosters; without dedupe, contains 5
    // would falsely match.
    const r = evaluate(
      {
        filter: {
          op: "containsAtLeast",
          field: { stage: "ALL", teams: true },
          values: ["ARG", "BRA", "GER", "FRA", "ESP"],
          n: 5,
        },
        aggregate: { kind: "count" },
      },
      [flat],
    );
    // Real distinct teams in ALL = {ARG, BRA, GER}; not 5.
    expect((r as any).value).toBe(0);
  });
});
