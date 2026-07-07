import { describe, it, expect } from "vitest";
import {
  TOP_SCORER_CANDIDATES,
  computeAliveTeams,
  isTopScorerSimEnabled,
  isTopScorerSamplingActive,
  resolveTopScorerProbs,
  buildTopScorerMask,
  sampleTopScorerMask,
} from "./topScorerRace";
import { mulberry32, simulateTournament } from "./scenarioSim";
import { computeCurrentElo } from "./eloModel";
import { calcBracketTeams, deriveChampion } from "./bracket";

const bit = (name: string) =>
  1 << TOP_SCORER_CANDIDATES.findIndex((c) => c.name === name);

describe("buildTopScorerMask", () => {
  it("matches a candidate by English or Hebrew canonical name", () => {
    expect(buildTopScorerMask("Kylian Mbappe")).toBe(bit("Kylian Mbappe"));
    expect(buildTopScorerMask("קיליאן אמבפה")).toBe(bit("Kylian Mbappe"));
    expect(buildTopScorerMask("ליאונל מסי")).toBe(bit("Lionel Messi"));
    expect(buildTopScorerMask("Erling Haaland")).toBe(bit("Erling Haaland"));
    expect(buildTopScorerMask("הארי קיין")).toBe(bit("Harry Kane"));
  });

  it("is 0 for non-candidates and missing picks", () => {
    expect(buildTopScorerMask("Vinicius Junior")).toBe(0);
    expect(buildTopScorerMask("")).toBe(0);
    expect(buildTopScorerMask(null)).toBe(0);
    expect(buildTopScorerMask(undefined)).toBe(0);
  });
});

describe("sampleTopScorerMask", () => {
  it("always consumes exactly one rng call per candidate (stream stability)", () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.99;
    };
    sampleTopScorerMask(rng, [0, 0, 0, 0]);
    expect(calls).toBe(TOP_SCORER_CANDIDATES.length);
    calls = 0;
    sampleTopScorerMask(rng, [1, 1, 1, 1]);
    expect(calls).toBe(TOP_SCORER_CANDIDATES.length);
  });

  it("p=1 always drawn, p=0 never drawn", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      expect(sampleTopScorerMask(rng, [1, 0, 0, 0])).toBe(1);
    }
  });

  it("empirical frequency tracks the marginal probability (independent draws)", () => {
    const rng = mulberry32(42);
    const probs = [0.5, 0.38, 0.14, 0.08];
    const N = 20000;
    const hits = [0, 0, 0, 0];
    let both01 = 0;
    for (let s = 0; s < N; s++) {
      const mask = sampleTopScorerMask(rng, probs);
      for (let i = 0; i < 4; i++) if (mask & (1 << i)) hits[i]++;
      if ((mask & 3) === 3) both01 += 1;
    }
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(hits[i] / N - probs[i])).toBeLessThan(0.02);
    }
    // Independence approximation: co-kings ≈ product of the marginals.
    expect(Math.abs(both01 / N - 0.5 * 0.38)).toBeLessThan(0.02);
  });
});

describe("isTopScorerSimEnabled", () => {
  it("is OFF unless the admin explicitly enabled it", () => {
    expect(isTopScorerSimEnabled(undefined)).toBe(false);
    expect(isTopScorerSimEnabled(null)).toBe(false);
    expect(isTopScorerSimEnabled({})).toBe(false);
    expect(isTopScorerSimEnabled({ topScorers: [] })).toBe(false);
    expect(isTopScorerSimEnabled({ topScorerSim: { enabled: false } })).toBe(false);
    expect(isTopScorerSimEnabled({ topScorerSim: { enabled: true } })).toBe(true);
  });

  it("full gate also requires the real king to be unknown", () => {
    expect(isTopScorerSamplingActive({ topScorerSim: { enabled: true } })).toBe(true);
    expect(
      isTopScorerSamplingActive({ topScorerSim: { enabled: true }, topScorers: [] }),
    ).toBe(true);
    expect(
      isTopScorerSamplingActive({ topScorerSim: { enabled: true }, topScorers: ["Harry Kane"] }),
    ).toBe(false);
    expect(isTopScorerSamplingActive({ topScorers: [] })).toBe(false);
  });
});

describe("resolveTopScorerProbs", () => {
  it("defaults to the candidate probabilities when nothing is played/overridden", () => {
    expect(resolveTopScorerProbs({}, {})).toEqual(
      TOP_SCORER_CANDIDATES.map((c) => c.prob),
    );
    expect(resolveTopScorerProbs(null, {})).toEqual(
      TOP_SCORER_CANDIDATES.map((c) => c.prob),
    );
  });

  it("applies admin odds via actualBonuses.topScorerSim.odds (En/He keys, clamped)", () => {
    const probs = resolveTopScorerProbs(
      {
        topScorerSim: {
          enabled: true,
          odds: {
            "קיליאן אמבפה": 0.7, // Hebrew key
            "Harry Kane": 2, // clamped to 1
            "Lionel Messi": -1, // clamped to 0
            "Some Unknown": 0.9, // ignored (not a candidate)
            "Erling Haaland": "nope", // ignored (not a number)
          },
        },
      },
      {},
    );
    const idx = (n: string) => TOP_SCORER_CANDIDATES.findIndex((c) => c.name === n);
    expect(probs[idx("Kylian Mbappe")]).toBe(0.7);
    expect(probs[idx("Harry Kane")]).toBe(1);
    expect(probs[idx("Lionel Messi")]).toBe(0);
    expect(probs[idx("Erling Haaland")]).toBe(
      TOP_SCORER_CANDIDATES[idx("Erling Haaland")].prob,
    );
  });

  it("zeroes a candidate whose team is eliminated in the real results", () => {
    // A fully played tournament: only the champion is still alive.
    const fullWorld = simulateTournament(mulberry32(33), {}, computeCurrentElo({}));
    const alive = computeAliveTeams(fullWorld);
    const champion = deriveChampion(fullWorld, calcBracketTeams(fullWorld));
    expect(alive).not.toBeNull();
    expect(champion).toBeTruthy();
    expect(alive!.has(champion!)).toBe(true);
    expect(alive!.size).toBe(1);

    const probs = resolveTopScorerProbs({}, fullWorld);
    TOP_SCORER_CANDIDATES.forEach((c, i) => {
      if (c.team === champion) expect(probs[i]).toBe(c.prob);
      else expect(probs[i]).toBe(0);
    });
  });

  it("a KO draw without advancingTeam eliminates nobody (malformed entry)", () => {
    // Take a fully played world, then strip the decision from one R32 draw…
    const world = simulateTournament(mulberry32(33), {}, computeCurrentElo({}));
    // …by forcing a draw with no advancingTeam on a played R32 match.
    const target = Object.keys(world).find((id) => world[id]?.stage === "R32");
    const results: Record<string, any> = {};
    for (const id of Object.keys(world)) {
      if (world[id]?.stage === "group" || id === target) results[id] = world[id];
    }
    const bracket = calcBracketTeams(results);
    const teams = bracket[target!];
    results[target!] = {
      ...world[target!],
      homeScore: 1,
      awayScore: 1,
      advancingTeam: undefined,
    };
    const alive = computeAliveTeams(results);
    expect(alive).not.toBeNull();
    // Neither side of the undecided draw may be marked eliminated.
    expect(alive!.has(teams.home)).toBe(true);
    expect(alive!.has(teams.away)).toBe(true);
  });

  it("treats everyone as alive while qualification is not final", () => {
    // No results at all → computeAliveTeams returns null → nothing zeroed.
    expect(computeAliveTeams({})).toBeNull();
    const boosted = resolveTopScorerProbs(
      { topScorerSim: { enabled: true, odds: { "Harry Kane": 0.5 } } },
      {},
    );
    const kaneIdx = TOP_SCORER_CANDIDATES.findIndex((c) => c.name === "Harry Kane");
    expect(boosted[kaneIdx]).toBe(0.5);
  });
});

describe("candidate list sanity", () => {
  it("has the four agreed candidates with sane probabilities", () => {
    expect(TOP_SCORER_CANDIDATES.map((c) => c.name).sort()).toEqual(
      ["Erling Haaland", "Harry Kane", "Kylian Mbappe", "Lionel Messi"].sort(),
    );
    for (const c of TOP_SCORER_CANDIDATES) {
      expect(c.prob).toBeGreaterThan(0);
      expect(c.prob).toBeLessThanOrEqual(1);
    }
  });
});
