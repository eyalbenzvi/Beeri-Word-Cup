// FIFA-ranking-based match predictor — zero API calls
import { GROUPS } from "../data/teams";
// Dense 1..48 ranking among the WC finalists. Derived from the OFFICIAL
// ranking so the two views are guaranteed consistent.
import { FIFA_RANK_DENSE as FIFA_RANK } from "../data/fifaRanking";

// Skewed toward favorites vs. naive coin-flips: real WC data shows large
// rank gaps rarely produce upsets, even at the group stage.
const OUTCOME_TIERS = [
  { maxDiff: 3,        pFavor: 0.45, pDraw: 0.32, pUnderdog: 0.23 },
  { maxDiff: 10,       pFavor: 0.55, pDraw: 0.27, pUnderdog: 0.18 },
  { maxDiff: 20,       pFavor: 0.65, pDraw: 0.23, pUnderdog: 0.12 },
  { maxDiff: 30,       pFavor: 0.75, pDraw: 0.17, pUnderdog: 0.08 },
  { maxDiff: Infinity, pFavor: 0.85, pDraw: 0.12, pUnderdog: 0.03 },
];

// Mid-table fallback for teams missing from FIFA_RANK (≈ middle of 48 finalists).
export const DEFAULT_RANK = 25;

// Probability the lower-ranked team advances when a knockout match is drawn.
// Models penalty-shootout variance without making it a coin flip.
export const KNOCKOUT_DRAW_UPSET_CHANCE = 0.20;

function getOutcomeProbabilities(rankHome, rankAway) {
  const diff = Math.abs(rankHome - rankAway);
  const favorIsHome = rankHome <= rankAway;
  const tier = OUTCOME_TIERS.find((t) => diff <= t.maxDiff);
  const { pFavor, pDraw, pUnderdog } = tier;

  return favorIsHome
    ? { homeWin: pFavor, draw: pDraw, awayWin: pUnderdog }
    : { homeWin: pUnderdog, draw: pDraw, awayWin: pFavor };
}

// Score distributions based on real World Cup data
const WIN_SCORES = [
  [1,0,30], [2,0,18], [2,1,25], [3,0,7], [3,1,10], [4,1,4], [3,2,3], [4,0,2], [5,0,1],
];
const DRAW_SCORES = [
  [0,0,33], [1,1,42], [2,2,20], [3,3,5],
];
const UPSET_SCORES = [
  [0,1,32], [1,2,28], [0,2,16], [1,3,10], [0,3,6], [2,3,5], [1,4,3],
];

// `rng` defaults to Math.random so existing callers are unaffected; the
// scenario simulator injects a SEEDED rng for reproducible runs.
function pickWeighted(options, rng: () => number = Math.random) {
  const total = options.reduce((s, o) => s + o[o.length - 1], 0);
  let r = rng() * total;
  for (const o of options) {
    r -= o[o.length - 1];
    if (r <= 0) return o;
  }
  return options[0];
}

// Sample a scoreline GIVEN an outcome: 0 = home win, 1 = draw, 2 = away win.
// Pulls from the real-WC score distributions. Shared by the FIFA-rank path
// (predictScoreline) and the scenario simulator's Elo path (eloModel) so both
// produce realistic scorelines from the SAME validated tables.
export function scorelineFromOutcome(outcome: 0 | 1 | 2, rng: () => number = Math.random) {
  if (outcome === 0) {
    const [h, a] = pickWeighted(WIN_SCORES, rng);
    return { homeScore: h, awayScore: a };
  }
  if (outcome === 1) {
    const [h, a] = pickWeighted(DRAW_SCORES, rng);
    return { homeScore: h, awayScore: a };
  }
  const [h, a] = pickWeighted(UPSET_SCORES, rng);
  return { homeScore: h, awayScore: a };
}

// Sample a scoreline from two (possibly EFFECTIVE) FIFA ranks. Lower rank =
// stronger team. Used by the AI auto-fill; the scenario tool uses the Elo
// model instead.
export function predictScoreline(
  rankH: number,
  rankA: number,
  rng: () => number = Math.random,
) {
  const probs = getOutcomeProbabilities(rankH, rankA);
  const roll = rng();
  const outcome = roll < probs.homeWin ? 0 : roll < probs.homeWin + probs.draw ? 1 : 2;
  return scorelineFromOutcome(outcome, rng);
}

// Predict a single match
export function predictMatch(homeTeam, awayTeam, rng: () => number = Math.random) {
  const rankH = FIFA_RANK[homeTeam] || DEFAULT_RANK;
  const rankA = FIFA_RANK[awayTeam] || DEFAULT_RANK;
  return predictScoreline(rankH, rankA, rng);
}

// Treat a prediction as "already filled" only when BOTH scores are numbers.
// Prevents partial/corrupt entries from blocking a sensible AI fill.
function isFilled(pred) {
  return (
    pred != null &&
    typeof pred.homeScore === "number" &&
    typeof pred.awayScore === "number"
  );
}

// Predict all group matches + knockout using bracket cascade.
// `existingPreds` (optional): a matches map from the user's form. Any match
// that is already filled is preserved verbatim (including `advancingTeam`),
// and the knockout cascade uses those user predictions so downstream rounds
// line up with what the user actually chose.
export function predictAllMatches(
  groupMatches,
  knockoutMatches,
  calcBracketTeams,
  existingPreds = {},
  rng: () => number = Math.random,
) {
  const allPreds = {};

  // Group stage
  for (const m of groupMatches) {
    const existing = existingPreds[m.id];
    if (isFilled(existing)) {
      allPreds[m.id] = { ...existing };
    } else {
      allPreds[m.id] = predictMatch(m.homeTeam, m.awayTeam, rng);
    }
  }

  // Knockout: round by round
  const knockoutStages = ["R32", "R16", "QF", "SF", "3RD", "F"];
  for (const stage of knockoutStages) {
    const bracket = calcBracketTeams(allPreds);
    const stageMatches = knockoutMatches.filter((m) => m.stage === stage);
    for (const m of stageMatches) {
      const existing = existingPreds[m.id];
      if (isFilled(existing)) {
        allPreds[m.id] = { ...existing };
        continue;
      }
      const teams = bracket[m.id];
      if (!teams?.home || !teams?.away) continue;
      const pred: any = predictMatch(teams.home, teams.away, rng);
      if (pred.homeScore === pred.awayScore) {
        const rankH = FIFA_RANK[teams.home] || DEFAULT_RANK;
        const rankA = FIFA_RANK[teams.away] || DEFAULT_RANK;
        const favored = rankH <= rankA ? teams.home : teams.away;
        const underdog = favored === teams.home ? teams.away : teams.home;
        pred.advancingTeam =
          rng() < KNOCKOUT_DRAW_UPSET_CHANCE ? underdog : favored;
      }
      allPreds[m.id] = pred;
    }
  }

  return allPreds;
}

// Derive the predicted champion from a completed `allPreds` map produced by
// `predictAllMatches`. Returns the team code, or null if the final isn't
// computable yet (missing scores / teams). `predictAllMatches` guarantees
// `advancingTeam` is set on knockout draws, including the final.
export function getPredictedChampion(allPreds, calcBracketTeams) {
  if (!allPreds || typeof calcBracketTeams !== "function") return null;
  const bracket = calcBracketTeams(allPreds);
  const teams = bracket["F-1"];
  if (!teams?.home || !teams?.away) return null;
  const pred = allPreds["F-1"];
  if (!pred || typeof pred.homeScore !== "number" || typeof pred.awayScore !== "number") return null;
  if (pred.homeScore > pred.awayScore) return teams.home;
  if (pred.awayScore > pred.homeScore) return teams.away;
  return pred.advancingTeam || null;
}
