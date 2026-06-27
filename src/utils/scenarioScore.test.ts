import { describe, it, expect } from "vitest";
import { groupMatches, knockoutMatches } from "../data/matches";
import { calcBracketTeams, deriveActualAdvancing, deriveChampion } from "./bracket";
import { calculateFullScore } from "./scoring";
import { buildFormBracketMap } from "./leaderboardCore";
import { predictAllMatches, predictScoreline } from "./fifaPredictor";
import { FIFA_RANK_DENSE } from "../data/fifaRanking";
import { mulberry32, simulateTournament, computeEffectiveRanks } from "./scenarioSim";
import { precomputeForms, scoreFormFast } from "./scenarioScore";

// The lean scorer MUST produce numerically identical totals to the canonical
// calculateFullScore — otherwise the simulation's rankings would diverge from
// the live leaderboard. This replays many random sims and asserts equality on
// totalPoints, exact/outcome counts, champion/top-scorer flags, and advancing
// points per round (the fields compareTiebreaker depends on).
describe("scoreFormFast equals calculateFullScore", () => {
  const rng = mulberry32(7);

  // End-of-group-stage fixture: all group matches played except the last 6.
  const results: Record<string, any> = {};
  const remaining = new Set(groupMatches.slice(-6).map((m) => m.id));
  for (const m of groupMatches) {
    if (remaining.has(m.id)) continue;
    const { homeScore, awayScore } = predictScoreline(
      FIFA_RANK_DENSE[m.homeTeam!] || 25,
      FIFA_RANK_DENSE[m.awayTeam!] || 25,
      rng,
    );
    results[m.id] = { homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore, awayScore, stage: "group", group: m.group, played: true };
  }

  // A mix of forms including a deliberately top-scorer-correct one.
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
  const actualBonuses = { topScorers: ["Messi"] };

  const formBracketMap = buildFormBracketMap(allPredictions);
  const fastForms = precomputeForms(allPredictions, formBracketMap, results, actualBonuses.topScorers);
  const effRanks = computeEffectiveRanks(results);

  it("matches across 25 random simulated tournaments", () => {
    let comparisons = 0;
    for (let s = 0; s < 25; s++) {
      const sim = simulateTournament(rng, results, effRanks);
      const simBracket = calcBracketTeams(sim);
      const actualAdvancing = deriveActualAdvancing(simBracket, sim);
      const champion = deriveChampion(sim, simBracket);
      const advSets: Record<string, Set<string>> = {};
      for (const r of Object.keys(actualAdvancing)) advSets[r] = new Set(actualAdvancing[r]);

      for (const f of fastForms) {
        const fb = formBracketMap[f.formId];
        const enriched = { ...allPredictions[f.formId], advancing: fb.advancing, champion: fb.champion };
        const canonical = calculateFullScore(
          enriched,
          sim,
          actualAdvancing,
          { champion, topScorers: actualBonuses.topScorers },
          fb.predBracket,
          simBracket,
        );
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
    expect(comparisons).toBeGreaterThan(700);
  });
});
