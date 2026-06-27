import { describe, it, expect } from "vitest";
import { groupMatches, knockoutMatches } from "../data/matches";
import { calcBracketTeams, deriveActualAdvancing, deriveChampion } from "./bracket";
import { calculateFullScore } from "./scoring";
import { buildFormBracketMap } from "./leaderboardCore";
import { predictAllMatches, predictScoreline } from "./fifaPredictor";
import { FIFA_RANK_DENSE } from "../data/fifaRanking";
import { mulberry32, simulateTournament } from "./scenarioSim";
import { computeCurrentElo } from "./eloModel";
import { precomputeForms, scoreFormFast } from "./scenarioScore";

// The lean scorer MUST produce numerically identical results to the canonical
// calculateFullScore — otherwise the simulation's rankings diverge from the
// live leaderboard. We assert equality on EVERY field compareTiebreaker reads
// (totalPoints, exact/outcome counts, champion/top-scorer flags, advancing
// points per round), across two fixtures and edge-case forms.

const rng = mulberry32(7);

function sampleResult(m: any) {
  const { homeScore, awayScore } = predictScoreline(
    FIFA_RANK_DENSE[m.homeTeam || m.home] || 25,
    FIFA_RANK_DENSE[m.awayTeam || m.away] || 25,
    rng,
  );
  return { homeScore, awayScore };
}

// Build a fixture played THROUGH a given point:
//   "groups"   — all group matches except the last 6 (knockout untouched)
//   "knockout" — all groups + all R32 + all R16 played (mid-knockout)
function buildResults(playedThrough: "groups" | "knockout") {
  const results: Record<string, any> = {};
  const remaining = new Set(groupMatches.slice(-6).map((m) => m.id));
  for (const m of groupMatches) {
    if (playedThrough === "groups" && remaining.has(m.id)) continue;
    const { homeScore, awayScore } = sampleResult(m);
    results[m.id] = { homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore, awayScore, stage: "group", group: m.group, played: true };
  }
  if (playedThrough === "knockout") {
    // Resolve R32 then R16 from the (now complete) groups, sampling each.
    for (const stage of ["R32", "R16"]) {
      const bracket = calcBracketTeams(results);
      for (const m of knockoutMatches) {
        if (m.stage !== stage) continue;
        const t = bracket[m.id];
        if (!t?.home || !t?.away) continue;
        const { homeScore, awayScore } = predictScoreline(FIFA_RANK_DENSE[t.home] || 25, FIFA_RANK_DENSE[t.away] || 25, rng);
        const entry: any = { homeTeam: t.home, awayTeam: t.away, homeScore, awayScore, stage: m.stage, played: true };
        if (homeScore === awayScore) entry.advancingTeam = t.home;
        results[m.id] = entry;
      }
    }
  }
  return results;
}

function buildForms() {
  const allPredictions: Record<string, any> = {};
  for (let i = 0; i < 30; i++) {
    const matches = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {}, rng);
    allPredictions[`form_${i}`] = {
      userId: `u${i}`,
      formName: `F${i}`,
      status: "submitted",
      matches,
      topScorer: i % 3 === 0 ? "Messi" : "Mbappe",
    };
  }
  // A form with PARTIAL predictions: drop a chunk of match predictions so the
  // null/no-prediction branches in precomputeForms/scoreFormFast are exercised.
  const partial = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {}, rng);
  let dropped = 0;
  for (const k of Object.keys(partial)) {
    if (dropped++ % 4 === 0) delete partial[k];
  }
  allPredictions["form_partial"] = { userId: "up", formName: "Partial", status: "submitted", matches: partial, topScorer: "Messi" };
  return allPredictions;
}

function assertEquivalence(results: Record<string, any>, topScorers: string[], sims: number) {
  const allPredictions = buildForms();
  const formBracketMap = buildFormBracketMap(allPredictions);
  const fastForms = precomputeForms(allPredictions, formBracketMap, results, topScorers);
  const elo = computeCurrentElo(results);

  let comparisons = 0;
  for (let s = 0; s < sims; s++) {
    const sim = simulateTournament(rng, results, elo);
    const simBracket = calcBracketTeams(sim);
    const actualAdvancing = deriveActualAdvancing(simBracket, sim);
    const champion = deriveChampion(sim, simBracket);
    const advSets: Record<string, Set<string>> = {};
    for (const r of Object.keys(actualAdvancing)) advSets[r] = new Set(actualAdvancing[r]);

    for (const f of fastForms) {
      const fb = formBracketMap[f.formId];
      const enriched = { ...allPredictions[f.formId], advancing: fb.advancing, champion: fb.champion };
      const canonical = calculateFullScore(enriched, sim, actualAdvancing, { champion, topScorers }, fb.predBracket, simBracket);
      const fast = scoreFormFast(f, sim, simBracket, advSets, champion);

      expect(fast.totalPoints).toBe(canonical.totalPoints);
      expect(fast.exactScoreCount).toBe(canonical.exactScoreCount);
      expect(fast.outcomeCount).toBe(canonical.outcomeCount);
      expect(fast.correctChampion).toBe(canonical.correctChampion);
      expect(fast.correctTopScorer).toBe(canonical.correctTopScorer);
      for (const round of ["R32", "R16", "QF", "SF", "F"]) {
        expect(fast.advancingPoints[round] || 0).toBe(canonical.advancingPoints[round] || 0);
      }
      comparisons++;
    }
  }
  return comparisons;
}

describe("scoreFormFast equals calculateFullScore", () => {
  it("matches end-of-group-stage, with a top scorer known", () => {
    const n = assertEquivalence(buildResults("groups"), ["Messi"], 20);
    expect(n).toBeGreaterThan(600);
  });

  it("matches mid-knockout (groups + R32 + R16 played)", () => {
    const n = assertEquivalence(buildResults("knockout"), ["Messi"], 20);
    expect(n).toBeGreaterThan(600);
  });

  it("matches when no top scorer is known yet (empty topScorers)", () => {
    const n = assertEquivalence(buildResults("groups"), [], 12);
    expect(n).toBeGreaterThan(300);
  });
});
