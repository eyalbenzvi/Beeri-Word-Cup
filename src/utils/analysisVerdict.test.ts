import { describe, it, expect } from "vitest";
import {
  chanceLabel,
  formatChance,
  pickPrimaryTarget,
  rankRange,
  classifyRootFor,
  pickKeyMatch,
  refundBandLabel,
  EPSILON_FLOOR,
  MIN_SLICE_N,
  TARGET_PROB_FLOOR,
} from "./analysisVerdict";
import type { WatchMatchAgg, TargetKey } from "./personalAnalysis";

// ── Verbal ladder: fixed buckets, stable snapping ──

describe("chanceLabel", () => {
  it("maps probabilities to the fixed verbal ladder", () => {
    expect(chanceLabel(0.95)).toEqual({ kind: "almost" });
    expect(chanceLabel(0.6)).toEqual({ kind: "good" });
    expect(chanceLabel(0.5)).toEqual({ kind: "coin" });
    expect(chanceLabel(0.12)).toEqual({ kind: "oneIn", n: 8 });
    expect(chanceLabel(0.03)).toEqual({ kind: "slim" });
    expect(chanceLabel(0.005)).toEqual({ kind: "miracle" });
  });

  it("snaps 1-in-N to the fixed step set — noise can't flip the sentence", () => {
    // 11.5%..13.5% all land on the same "1 מכל 8"
    for (const p of [0.115, 0.12, 0.125, 0.13, 0.135]) {
      expect(chanceLabel(p)).toEqual({ kind: "oneIn", n: 8 });
    }
    expect(chanceLabel(0.32)).toEqual({ kind: "oneIn", n: 3 });
    expect(chanceLabel(0.055)).toEqual({ kind: "oneIn", n: 20 });
  });

  it("formats Hebrew copy", () => {
    expect(formatChance({ kind: "oneIn", n: 8 })).toBe("בערך 1 מכל 8 תרחישים");
    expect(formatChance({ kind: "miracle" })).toBe("רק בנס");
  });
});

// ── Range ──

describe("rankRange", () => {
  it("returns the central-80% dense-rank interval", () => {
    // 100 sims: ranks 1..10 uniform.
    const hist = new Array(20).fill(0);
    for (let r = 1; r <= 10; r++) hist[r - 1] = 10;
    expect(rankRange(hist, 100)).toEqual({ lo: 2, hi: 9 });
  });
  it("handles empty input", () => {
    expect(rankRange([], 0)).toBeNull();
  });
});

// ── Primary target selection ──

describe("pickPrimaryTarget", () => {
  const base = { win: 0, podium: 0, p100: 0, p200: 0, last: 0 };

  it("a podium form out of the win race defends the podium, not 'no prizes'", () => {
    const t = pickPrimaryTarget({
      currentRank: 2,
      nForms: 210,
      probs: { ...base, podium: 0.7 },
      aliveForFirst: false,
    });
    expect(t.key).toBe("podium");
    // Even with a tiny probability, a form currently ON the podium keeps it
    // as the story (rank ≤ PRIZE_TOP_PLACES).
    expect(
      pickPrimaryTarget({ currentRank: 3, nForms: 210, probs: base, aliveForFirst: false }).key,
    ).toBe("podium");
  });

  it("prefers the win while alive and probable (or on the podium)", () => {
    expect(
      pickPrimaryTarget({ currentRank: 5, nForms: 210, probs: { ...base, win: 0.12 }, aliveForFirst: true }).key,
    ).toBe("win");
    expect(
      pickPrimaryTarget({ currentRank: 2, nForms: 210, probs: { ...base, win: 0.01 }, aliveForFirst: true }).key,
    ).toBe("win");
  });

  it("falls to the most probable refund target with distance metadata", () => {
    const t = pickPrimaryTarget({
      currentRank: 104,
      nForms: 210,
      probs: { ...base, win: 0.001, p100: 0.2, p200: 0.05 },
      aliveForFirst: true,
    });
    expect(t.key).toBe("p100");
    expect(t.targetRank).toBe(100);
    expect(t.distance).toBe(-4);
  });

  it("never offers place 100/200 in a pool too small for them", () => {
    const t = pickPrimaryTarget({
      currentRank: 40,
      nForms: 80,
      probs: { ...base, p100: 0.9, last: 0.1 },
      aliveForFirst: false,
    });
    expect(t.key).toBe("last");
  });

  it("last place is a real target", () => {
    const t = pickPrimaryTarget({
      currentRank: 208,
      nForms: 210,
      probs: { ...base, last: 0.3 },
      aliveForFirst: false,
    });
    expect(t.key).toBe("last");
    expect(t.targetRank).toBe(210);
  });

  it("mathematically-alive long shot still gets the win story; else none", () => {
    expect(
      pickPrimaryTarget({ currentRank: 140, nForms: 210, probs: { ...base, win: 0.001 }, aliveForFirst: true }).key,
    ).toBe("win");
    expect(
      pickPrimaryTarget({ currentRank: 140, nForms: 210, probs: base, aliveForFirst: false }).key,
    ).toBe("none");
  });

  it("floor constant sanity", () => {
    expect(TARGET_PROB_FLOOR).toBeGreaterThan(0);
    expect(TARGET_PROB_FLOOR).toBeLessThan(0.1);
  });
});

// ── Root-for classification ──

const mkOutcome = (key: "home" | "draw" | "away", n: number, hitWin: number) => ({
  key,
  n,
  hits: [{ win: hitWin, podium: 0, p100: 0, p200: 0, last: 0 }],
});

const mkMatch = (matchId: string, homeP: number, awayP: number, n = 5000): WatchMatchAgg => ({
  matchId,
  isKnockout: true,
  outcomes: [
    mkOutcome("home", n, Math.round(homeP * n)),
    mkOutcome("away", n, Math.round(awayP * n)),
  ],
  shake: 0,
});

describe("classifyRootFor", () => {
  const targetKey: TargetKey = "win";

  it("advises the outcome that maximizes the target, sorted by swing, capped", () => {
    const watch = [
      mkMatch("m1", 0.1, 0.2), // swing 0.1
      mkMatch("m2", 0.4, 0.1), // swing 0.3 — strongest
      mkMatch("m3", 0.15, 0.1), // swing 0.05
      mkMatch("m4", 0.3, 0.1), // swing 0.2
    ];
    const advice = classifyRootFor(watch, 0, targetKey, 10000);
    expect(advice.map((a) => a.matchId)).toEqual(["m2", "m4", "m1"]);
    expect(advice[0].side).toBe("home");
    expect(advice[0].strong).toBe(true);
    expect(advice[2].side).toBe("away");
  });

  it("suppresses negligible swings (the 'enjoy the football' case)", () => {
    const tiny = EPSILON_FLOOR / 2;
    const watch = [mkMatch("m1", 0.1, 0.1 + tiny)];
    expect(classifyRootFor(watch, 0, targetKey, 10000)).toEqual([]);
  });

  it("flags low-sample slices instead of hiding a big swing", () => {
    const watch: WatchMatchAgg[] = [
      {
        matchId: "m1",
        isKnockout: true,
        outcomes: [mkOutcome("home", MIN_SLICE_N - 50, 100), mkOutcome("away", 5000, 500)],
        shake: 0,
      },
    ];
    const advice = classifyRootFor(watch, 0, targetKey, 10000);
    expect(advice).toHaveLength(1);
    expect(advice[0].lowSample).toBe(true);
  });

  it("ignores matches with fewer than two populated outcomes", () => {
    const watch: WatchMatchAgg[] = [
      { matchId: "m1", isKnockout: true, outcomes: [mkOutcome("home", 100, 50)], shake: 0 },
    ];
    expect(classifyRootFor(watch, 0, targetKey, 10000)).toEqual([]);
  });
});

describe("pickKeyMatch", () => {
  it("picks the largest shake with ≥2 outcomes", () => {
    const watch = [mkMatch("m1", 0.1, 0.1), mkMatch("m2", 0.1, 0.1)];
    watch[0].shake = 1.2;
    watch[1].shake = 3.4;
    expect(pickKeyMatch(watch)).toEqual({ matchId: "m2", shake: 3.4 });
  });
  it("returns null when nothing qualifies", () => {
    expect(pickKeyMatch([])).toBeNull();
  });
});

describe("refundBandLabel", () => {
  it("renders the ±band range", () => {
    expect(refundBandLabel(100)).toBe("98–102");
  });
});
