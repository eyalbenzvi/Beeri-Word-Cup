// Elo-based match model for the scenario simulator.
//
// Replaces the FIFA-rank tier table (fifaPredictor) as the source of per-match
// win probabilities. Two principled pieces:
//
//   1. computeCurrentElo(results) — start from base ratings (data/eloRatings)
//      and update them by EVERY already-played match (standard zero-sum Elo
//      with a goal-difference multiplier). This folds in group-stage form the
//      proper way, replacing the old ad-hoc points/GD "blend".
//
//   2. eloOutcomeProbabilities(eloH, eloA) — logistic expected score split into
//      home/draw/away with an Elo-gap-dependent draw model. Feeds the same
//      real-WC score-distribution sampler (scorelineFromOutcome).
//
// Pure + deterministic given a seeded rng → worker- and test-safe.

import { GROUPS } from "../data/teams";
import { ELO_RATINGS, DEFAULT_ELO } from "../data/eloRatings";
import { groupMatches, knockoutMatches } from "../data/matches";
import { isScoreValid } from "./helpers";
import { scorelineFromOutcome } from "./fifaPredictor";

// WC matches are at neutral venues (host games aside), so no home advantage.
const HOME_ADV = 0;
// Elo update importance. 40 is the World-Football-Elo World Cup K-factor.
const K_FACTOR = 40;
// Draw model: most likely for evenly matched sides, decaying as the gap grows.
const DRAW_MAX = 0.28;
const DRAW_WIDTH = 300;
// How much of the Elo edge carries into a penalty shootout (shootouts are
// near-random; the stronger side keeps only a fraction of its edge).
const SHOOTOUT_EDGE = 0.5;

export { DEFAULT_ELO };

// Three-way outcome probabilities + the raw logistic home-win expectation.
export function eloOutcomeProbabilities(eloH: number, eloA: number) {
  const dr = eloH + HOME_ADV - eloA;
  const expectedHome = 1 / (1 + Math.pow(10, -dr / 400)); // includes draw mass
  const draw = DRAW_MAX * Math.exp(-Math.pow(dr / DRAW_WIDTH, 2));
  const homeWin = (1 - draw) * expectedHome;
  const awayWin = (1 - draw) * (1 - expectedHome);
  return { homeWin, draw, awayWin, expectedHome };
}

// Sample a scoreline for a match between two Elo ratings.
export function sampleEloMatch(eloH: number, eloA: number, rng: () => number) {
  const { homeWin, draw } = eloOutcomeProbabilities(eloH, eloA);
  const roll = rng();
  const outcome: 0 | 1 | 2 = roll < homeWin ? 0 : roll < homeWin + draw ? 1 : 2;
  return scorelineFromOutcome(outcome, rng);
}

// Decide a drawn knockout match: the stronger Elo wins more shootouts, but the
// edge is damped toward a coin flip.
export function shootoutHomeAdvances(eloH: number, eloA: number, rng: () => number) {
  const { expectedHome } = eloOutcomeProbabilities(eloH, eloA);
  const pHome = 0.5 + (expectedHome - 0.5) * SHOOTOUT_EDGE;
  return rng() < pHome;
}

// World-Football-Elo goal-difference multiplier.
function goalMultiplier(diff: number): number {
  const d = Math.abs(diff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

// Current Elo = base ratings updated by every already-played match, applied in
// a deterministic match order. Only valid (played) results count.
export function computeCurrentElo(results: Record<string, any>): Record<string, number> {
  const elo: Record<string, number> = {};
  for (const teams of Object.values(GROUPS)) {
    for (const t of teams) elo[t.code] = ELO_RATINGS[t.code] ?? DEFAULT_ELO;
  }

  const ordered = [...groupMatches, ...knockoutMatches].sort(
    (a, b) => (a.fifaMatch || 0) - (b.fifaMatch || 0),
  );
  for (const m of ordered) {
    const r = results[m.id];
    if (!isScoreValid(r)) continue;
    const home = r.homeTeam || m.homeTeam;
    const away = r.awayTeam || m.awayTeam;
    if (!home || !away || elo[home] == null || elo[away] == null) continue;
    const h = Number(r.homeScore);
    const a = Number(r.awayScore);
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;

    const expH = 1 / (1 + Math.pow(10, (elo[away] - elo[home]) / 400));
    const scoreH = h > a ? 1 : h < a ? 0 : 0.5;
    const delta = K_FACTOR * goalMultiplier(h - a) * (scoreH - expH);
    elo[home] += delta;
    elo[away] -= delta;
  }
  return elo;
}
