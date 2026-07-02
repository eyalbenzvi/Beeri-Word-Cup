/**
 * Pure interpretation layer between the Monte-Carlo aggregate
 * (personalAnalysis.ts) / certainty layer (poolCertainty.ts) and the
 * competition-analysis UI.
 *
 * Everything user-facing follows the "no hard numbers" contract:
 *   - probabilities → a FIXED verbal ladder ("בערך 1 מכל 8"), with N snapped
 *     to a small set so the same reality always yields the same sentence and
 *     day-to-day sampling noise can't flip the copy
 *   - root-for advice → direction words only; magnitudes are used for
 *     ORDERING and thresholding, never displayed
 *
 * No React, no Firebase, no engine imports — safe for unit tests and for
 * both the page and the worker to import without dragging heavy deps.
 */

import type { PersonalAnalysisAggregate, TargetKey, WatchMatchAgg } from "./personalAnalysis";
import { TARGET_BAND } from "./personalAnalysis";

// How many top places win a (non-refund) prize. Kept as one constant so the
// real prize structure can be tuned in one place.
export const PRIZE_TOP_PLACES = 3;

// Minimum probability for a money target to be "the story" of the verdict.
export const TARGET_PROB_FLOOR = 0.02;

// Root-for gates: a conditional slice below MIN_SLICE_N sims is too noisy to
// advise on at all; a probability swing below the epsilon floor is
// "negligible" and the match is not shown. 2·SE keeps early (2k-sim) paints
// honest — the bar drops as the run refines.
export const MIN_SLICE_N = 300;
export const EPSILON_FLOOR = 0.02;
// A swing this large is headline-worthy ("משנה לך את התמונה").
export const STRONG_SWING = 0.08;

// ── Verbal probability ladder (fixed buckets, per the domain review) ──

export type ChanceLabel =
  | { kind: "almost" } // כמעט בכל תרחיש
  | { kind: "good" } // סיכוי טוב
  | { kind: "coin" } // בערך חצי-חצי
  | { kind: "oneIn"; n: number } // בערך 1 מכל N
  | { kind: "slim" } // סיכוי קלוש, אבל חי
  | { kind: "miracle" }; // רק בנס

const ONE_IN_STEPS = [3, 4, 5, 8, 10, 15, 20];

export function chanceLabel(p: number): ChanceLabel {
  if (p >= 0.9) return { kind: "almost" };
  if (p >= 0.55) return { kind: "good" };
  if (p >= 0.4) return { kind: "coin" };
  if (p >= 1 / 20) {
    const raw = 1 / p;
    let best = ONE_IN_STEPS[0];
    for (const s of ONE_IN_STEPS) {
      if (Math.abs(s - raw) < Math.abs(best - raw)) best = s;
    }
    return { kind: "oneIn", n: best };
  }
  if (p >= 1 / 100) return { kind: "slim" };
  return { kind: "miracle" };
}

export function formatChance(label: ChanceLabel): string {
  switch (label.kind) {
    case "almost":
      return "כמעט בכל תרחיש";
    case "good":
      return "סיכוי טוב";
    case "coin":
      return "בערך חצי-חצי";
    case "oneIn":
      return `בערך 1 מכל ${label.n} תרחישים`;
    case "slim":
      return "סיכוי קלוש, אבל חי";
    case "miracle":
      return "רק בנס";
  }
}

// ── Target probabilities from a target form's aggregate ──

export type TargetProbs = Record<TargetKey, number>;

export function targetProbs(
  agg: PersonalAnalysisAggregate,
  targetFormIndex: number,
): TargetProbs {
  const tf = agg.targetForms[targetFormIndex];
  const n = Math.max(agg.simCount, 1);
  return {
    win: tf.hits.win / n,
    p100: tf.hits.p100 / n,
    p200: tf.hits.p200 / n,
    last: tf.hits.last / n,
  };
}

// Central-80% dense-rank range: "ברוב התרחישים תסיים בין X ל-Y".
export function rankRange(
  hist: number[],
  simCount: number,
): { lo: number; hi: number } | null {
  if (simCount <= 0) return null;
  const loCut = simCount * 0.1;
  const hiCut = simCount * 0.9;
  let cum = 0;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < hist.length; i++) {
    const next = cum + hist[i];
    if (lo === 0 && next > loCut) lo = i + 1;
    if (hi === 0 && next >= hiCut) {
      hi = i + 1;
      break;
    }
    cum = next;
  }
  if (lo === 0 || hi === 0) return null;
  return { lo, hi };
}

// ── Primary money-target selection (the verdict's subject) ──

export type PrimaryTarget = {
  key: TargetKey | "none";
  prob: number;
  // For refund places: the target rank and the user's signed distance to it
  // (positive = user is above/better than the target rank).
  targetRank?: number;
  distance?: number;
};

export function pickPrimaryTarget(opts: {
  currentRank: number;
  nForms: number;
  probs: TargetProbs;
  aliveForFirst: boolean;
}): PrimaryTarget {
  const { currentRank, nForms, probs, aliveForFirst } = opts;

  // Winning outranks everything when it's a real story.
  if (aliveForFirst && (probs.win >= TARGET_PROB_FLOOR || currentRank <= PRIZE_TOP_PLACES)) {
    return { key: "win", prob: probs.win };
  }

  // Otherwise the most probable refund target that clears the floor.
  const refunds: { key: TargetKey; prob: number; targetRank: number }[] = [];
  if (nForms >= 100) refunds.push({ key: "p100", prob: probs.p100, targetRank: 100 });
  if (nForms >= 200) refunds.push({ key: "p200", prob: probs.p200, targetRank: 200 });
  refunds.push({ key: "last", prob: probs.last, targetRank: nForms });
  refunds.sort((a, b) => b.prob - a.prob);
  const best = refunds[0];
  if (best && best.prob >= TARGET_PROB_FLOOR) {
    return {
      key: best.key,
      prob: best.prob,
      targetRank: best.targetRank,
      distance: best.targetRank - currentRank,
    };
  }

  // Long-shot win beats "nothing" only while mathematically alive.
  if (aliveForFirst && probs.win > 0) {
    return { key: "win", prob: probs.win };
  }
  return { key: "none", prob: 0 };
}

// ── Root-for classification ──

export type RootForAdvice = {
  matchId: string;
  // The outcome that best serves the user's target.
  side: "home" | "draw" | "away";
  // Swing magnitude — ORDERING ONLY, never displayed.
  swing: number;
  strong: boolean; // swing ≥ STRONG_SWING → "משנה לך את התמונה"
  lowSample: boolean; // any outcome slice below MIN_SLICE_N → "משוער"
};

// For one target form + its primary target, turn the conditional aggregates
// into at most `maxCards` pieces of advice, sorted by impact.
export function classifyRootFor(
  watch: WatchMatchAgg[],
  targetFormIndex: number,
  targetKey: TargetKey,
  simCount: number,
  maxCards = 3,
): RootForAdvice[] {
  if (simCount <= 0) return [];
  const advice: RootForAdvice[] = [];

  for (const wm of watch) {
    // Ignore outcome slices with no samples at all; a match needs ≥2
    // populated outcomes for a "which outcome helps" comparison.
    const slices = wm.outcomes.filter((o) => o.n > 0);
    if (slices.length < 2) continue;

    let bestP = -Infinity;
    let worstP = Infinity;
    let bestSide: RootForAdvice["side"] = slices[0].key;
    let lowSample = false;
    for (const o of slices) {
      const p = o.hits[targetFormIndex][targetKey] / o.n;
      if (p > bestP) {
        bestP = p;
        bestSide = o.key;
      }
      if (p < worstP) worstP = p;
      if (o.n < MIN_SLICE_N) lowSample = true;
    }

    const swing = bestP - worstP;
    // Noise gate: 2·SE of the best slice's estimate, floored at EPSILON_FLOOR.
    const nBest = slices.find((o) => o.key === bestSide)?.n || 1;
    const se = Math.sqrt(Math.max(bestP * (1 - bestP), 1e-6) / nBest);
    const epsilon = Math.max(EPSILON_FLOOR, 2 * se);
    if (swing < epsilon) continue;

    advice.push({
      matchId: wm.matchId,
      side: bestSide,
      swing,
      strong: swing >= STRONG_SWING,
      lowSample,
    });
  }

  advice.sort((a, b) => b.swing - a.swing);
  return advice.slice(0, maxCards);
}

// ── Key match of the window (pool-level) ──

export function pickKeyMatch(watch: WatchMatchAgg[]): { matchId: string; shake: number } | null {
  let best: { matchId: string; shake: number } | null = null;
  for (const wm of watch) {
    if (wm.outcomes.length < 2) continue;
    if (!best || wm.shake > best.shake) best = { matchId: wm.matchId, shake: wm.shake };
  }
  return best && best.shake > 0 ? best : null;
}

// ── Refund-band label ("בסביבות מקום 100 (98–102)") helper ──
export function refundBandLabel(targetRank: number): string {
  return `${targetRank - TARGET_BAND}–${targetRank + TARGET_BAND}`;
}
