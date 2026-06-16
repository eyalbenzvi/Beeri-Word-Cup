import { describe, it, expect } from "vitest";
import {
  teamsMatch,
  resolveMatchTeams,
  alignPredictionToActual,
} from "./predictionAlign";

// Pure home/away reconciliation logic. Knockout bracket slots can seat the
// same two teams in swapped roles vs the user's stored prediction; these
// helpers decide what to render and mirror scores when roles flip.

describe("teamsMatch", () => {
  it("is order-agnostic for the same pair", () => {
    expect(teamsMatch({ home: "ARG", away: "BRA" }, { home: "BRA", away: "ARG" })).toBe(true);
    expect(teamsMatch({ home: "ARG", away: "BRA" }, { home: "ARG", away: "BRA" })).toBe(true);
  });
  it("is false for a different pair", () => {
    expect(teamsMatch({ home: "ARG", away: "BRA" }, { home: "ARG", away: "FRA" })).toBe(false);
  });
  it("is false when any side is missing or null", () => {
    expect(teamsMatch(null, { home: "ARG", away: "BRA" })).toBe(false);
    expect(teamsMatch({ home: "ARG", away: null }, { home: "ARG", away: "BRA" })).toBe(false);
  });
});

describe("resolveMatchTeams", () => {
  it("uses the fixed home/away for group matches", () => {
    const m = { stage: "group", homeTeam: "ARG", awayTeam: "BRA", id: "group-A-1" };
    expect(resolveMatchTeams(m, {})).toEqual({ home: "ARG", away: "BRA" });
  });
  it("uses the derived bracket slot for knockout matches", () => {
    const m = { stage: "R16", id: "R16-1" };
    expect(resolveMatchTeams(m, { "R16-1": { home: "FRA", away: "GER" } })).toEqual({
      home: "FRA",
      away: "GER",
    });
  });
  it("returns nulls for a knockout slot that hasn't resolved yet", () => {
    expect(resolveMatchTeams({ stage: "QF", id: "QF-1" }, {})).toEqual({ home: null, away: null });
  });
  it("returns nulls for a missing match", () => {
    expect(resolveMatchTeams(null, {})).toEqual({ home: null, away: null });
  });
});

describe("alignPredictionToActual", () => {
  it("keeps scores when roles already match", () => {
    const pred = { homeScore: 2, awayScore: 1, advancingTeam: "ARG" };
    const out = alignPredictionToActual(pred, { home: "ARG", away: "BRA" }, { home: "ARG", away: "BRA" });
    expect(out).toEqual({ homeScore: 2, awayScore: 1, advancingTeam: "ARG" });
  });
  it("mirrors scores when the actual slot swaps the user's home/away", () => {
    const pred = { homeScore: 2, awayScore: 1, advancingTeam: "ARG" };
    // user modelled ARG(home) vs BRA(away); actual slot seats BRA home, ARG away
    const out = alignPredictionToActual(pred, { home: "ARG", away: "BRA" }, { home: "BRA", away: "ARG" });
    expect(out).toEqual({ homeScore: 1, awayScore: 2, advancingTeam: "ARG" });
  });
  it("never swaps advancingTeam (it is a code, not a role)", () => {
    const pred = { homeScore: 0, awayScore: 3, advancingTeam: "BRA" };
    const out = alignPredictionToActual(pred, { home: "ARG", away: "BRA" }, { home: "BRA", away: "ARG" });
    expect(out.advancingTeam).toBe("BRA");
  });
  it("returns scores unchanged when the actual slot is incomplete", () => {
    const pred = { homeScore: 2, awayScore: 1 };
    expect(alignPredictionToActual(pred, { home: "ARG", away: "BRA" }, { home: null, away: null })).toEqual({
      homeScore: 2,
      awayScore: 1,
      advancingTeam: null,
    });
  });
  it("returns null scores for a null prediction", () => {
    expect(alignPredictionToActual(null, { home: "ARG", away: "BRA" }, { home: "ARG", away: "BRA" })).toEqual({
      homeScore: null,
      awayScore: null,
      advancingTeam: null,
    });
  });
});
