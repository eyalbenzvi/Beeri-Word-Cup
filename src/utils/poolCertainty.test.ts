import { describe, it, expect } from "vitest";
import { computePoolCertainty, maxRemainingBound, isClinchedTopN } from "./poolCertainty";
import { computeScoredForms, assignDenseRanks } from "./leaderboardCore";
import { predictScenario } from "./scenarioPredictor";
import { groupMatches, knockoutMatches } from "../data/matches";
import { calcBracketTeams } from "./bracket";
import { GROUPS } from "../data/teams";
import { mulberry32, simulateTournament } from "./scenarioSim";
import { computeCurrentElo } from "./eloModel";

// SOUNDNESS is the contract (see poolCertainty.ts): across random partial
// worlds and random completions, (a) no form's final points may ever exceed
// current + maxRemainingBound, and (b) a deterministic claim (not-alive /
// clinched top-N) may never be contradicted by any completion.

const allCodes = Object.values(GROUPS)
  .flat()
  .map((t: any) => t.code);

function genForms(n: number, rnd: () => number) {
  const pick = () => allCodes[Math.floor(rnd() * allCodes.length)];
  const forms: Record<string, any> = {};
  for (let i = 0; i < n; i++) {
    let c = pick();
    let r = pick();
    while (r === c) r = pick();
    forms[`f${i}`] = {
      formId: `f${i}`,
      userId: `u${i}`,
      formName: `F${i}`,
      status: "submitted",
      matches: predictScenario(c, r, groupMatches, knockoutMatches, calcBracketTeams, {}),
    };
  }
  return forms;
}

// A partial world: a full simulated tournament, truncated to "played through
// stage X" — entries keep their stage fields exactly like real stored results.
function partialWorld(rng: () => number, playedKO: number) {
  const full = simulateTournament(rng, {}, computeCurrentElo({}));
  const partial: Record<string, any> = {};
  for (const m of groupMatches) partial[m.id] = full[m.id];
  let ko = 0;
  for (const m of knockoutMatches) {
    if (ko >= playedKO) break;
    if (full[m.id]) {
      partial[m.id] = full[m.id];
      ko++;
    }
  }
  return partial;
}

describe("poolCertainty soundness (fuzz vs the canonical scorer)", () => {
  const rng = mulberry32(42);
  const forms = genForms(8, rng);
  const bonuses = {};

  // 3 partial worlds × 12 completions each.
  for (const playedKO of [4, 16, 30]) {
    it(`no completion violates the bound or a claim (KO played: ${playedKO})`, () => {
      const partial = partialWorld(mulberry32(1000 + playedKO), playedKO);
      const cert = computePoolCertainty(partial, forms, bonuses);

      for (let trial = 0; trial < 12; trial++) {
        const completion = simulateTournament(
          mulberry32(7000 + playedKO * 100 + trial),
          partial,
          computeCurrentElo(partial),
        );
        const finalCore = computeScoredForms(completion, forms, bonuses, completion, false);
        const finalRanks = assignDenseRanks(finalCore.scoredForms);

        for (const f of finalRanks) {
          const c = cert.byFormId[f.formId];
          // (a) The bound is a true upper bound.
          expect(f.totalPoints).toBeLessThanOrEqual(c.totalPoints + c.maxRemaining);
          // (b) Not-alive forms never finish first.
          if (!c.aliveForFirst) expect(f.rank).toBeGreaterThan(1);
          // (c) Clinched top-N holds in every completion.
          for (const n of [1, 3, 10]) {
            if (isClinchedTopN(cert, f.formId, n)) {
              expect(f.rank).toBeLessThanOrEqual(n);
            }
          }
        }
      }
    });
  }

  it("ties at the top count as still-alive (tiebreakers are unknowable)", () => {
    // With everything played, forms tied on points with the leader must NOT
    // be declared dead — compare via the real computation on a full world.
    const world = partialWorld(mulberry32(5), 32);
    const cert = computePoolCertainty(world, forms, bonuses);
    const top = Math.max(...cert.forms.map((f) => f.totalPoints));
    for (const f of cert.forms) {
      if (f.totalPoints === top) expect(f.aliveForFirst).toBe(true);
    }
  });

  it("everything-played world: bound is 0 except the undecided top scorer", () => {
    const world = partialWorld(mulberry32(9), 32);
    const anyForm = forms.f0;
    // Top scorer undecided → exactly the bonus remains in the bound.
    expect(maxRemainingBound(anyForm, world, {})).toBe(8);
    // Top scorer decided → nothing remains.
    expect(maxRemainingBound(anyForm, world, { topScorers: ["Somebody"] })).toBe(0);
  });

  it("ranks mirror the live leaderboard (dense, canonical order)", () => {
    const partial = partialWorld(mulberry32(11), 10);
    const cert = computePoolCertainty(partial, forms, bonuses);
    const core = computeScoredForms(partial, forms, bonuses, partial, false);
    const ranks = assignDenseRanks(core.scoredForms);
    for (const f of ranks) {
      expect(cert.byFormId[f.formId].rank).toBe(f.rank);
      expect(cert.byFormId[f.formId].totalPoints).toBe(f.totalPoints);
    }
  });
});
