// Optional betting-odds integration for the scenario simulator.
//
// FEASIBILITY NOTE: a full-tournament Monte-Carlo needs a strength signal for
// every team, including for knockout matchups that DON'T EXIST YET (you can't
// get live odds for "winner of R16-1 vs winner of R16-2"). So per-match live
// odds can't drive the whole sim. What betting markets DO offer is an OUTRIGHT
// "to win the cup" market — a clean team-strength signal. We convert those
// implied champion probabilities into a pseudo-Elo and BLEND it with the Elo
// model (eloModel.ts), which remains the default and the fallback when no odds
// are available. This is an experimental calibration layer, not a replacement.

// Anchor + clamp for the pseudo-Elo derived from implied champion probability.
const PSEUDO_ELO_ANCHOR = 1900;
const PSEUDO_ELO_MIN = 1300;
const PSEUDO_ELO_MAX = 2300;

// Convert a map of implied champion probabilities (code -> p, need not be
// normalised) into a pseudo-Elo per listed team, relative to the field's mean
// implied probability. Higher implied prob -> higher pseudo-Elo (monotonic).
export function oddsToPseudoElo(impliedProbs: Record<string, number>): Record<string, number> {
  const entries = Object.entries(impliedProbs).filter(([, p]) => p > 0);
  if (entries.length === 0) return {};
  const mean = entries.reduce((s, [, p]) => s + p, 0) / entries.length;
  const out: Record<string, number> = {};
  for (const [code, p] of entries) {
    const raw = PSEUDO_ELO_ANCHOR + 400 * Math.log10(p / mean);
    out[code] = Math.min(PSEUDO_ELO_MAX, Math.max(PSEUDO_ELO_MIN, raw));
  }
  return out;
}

// Blend the Elo ratings toward the betting-implied pseudo-Elo for the teams the
// market covers. `weight` in [0,1]: 0 = pure Elo, 1 = pure market. Teams not in
// the odds map are left at their Elo value (the fallback).
export function blendEloWithOdds(
  elo: Record<string, number>,
  impliedProbs: Record<string, number>,
  weight = 0.5,
): Record<string, number> {
  const w = Math.min(1, Math.max(0, weight));
  const pseudo = oddsToPseudoElo(impliedProbs);
  const out: Record<string, number> = { ...elo };
  for (const [code, pe] of Object.entries(pseudo)) {
    if (out[code] == null) continue; // only adjust known finalists
    out[code] = (1 - w) * out[code] + w * pe;
  }
  return out;
}
