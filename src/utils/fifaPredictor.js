// FIFA-ranking-based match predictor — zero API calls
import { GROUPS } from "../data/teams";

// FIFA Rankings (approximate, as of early 2026)
const FIFA_RANK = {
  ARG: 1, FRA: 2, BRA: 3, ENG: 4, ESP: 5, POR: 6, NED: 7, BEL: 8,
  GER: 9, COL: 10, URU: 11, CRO: 12, MAR: 13, JPN: 14, USA: 15, MEX: 16,
  SEN: 17, AUT: 18, TUR: 19, SUI: 20, KOR: 21, AUS: 22, EGY: 23, SWE: 24,
  ECU: 25, ALG: 26, CIV: 27, NOR: 28, PAN: 29, CAN: 30, IRN: 31, GHA: 32,
  BIH: 33, QAT: 34, IRQ: 35, SCO: 36, RSA: 37, JOR: 38, UZB: 39, NZL: 40,
  CPV: 41, KSA: 42, COD: 43, CZE: 44, TUN: 45, PAR: 46, HAI: 47, CUR: 48,
};

// Outcome probabilities based on ranking difference
function getOutcomeProbabilities(rankHome, rankAway) {
  const diff = Math.abs(rankHome - rankAway);
  const favorIsHome = rankHome <= rankAway;

  let pFavor, pDraw, pUnderdog;
  if (diff <= 3)       { pFavor = 0.38; pDraw = 0.32; pUnderdog = 0.30; }
  else if (diff <= 10) { pFavor = 0.45; pDraw = 0.28; pUnderdog = 0.27; }
  else if (diff <= 20) { pFavor = 0.55; pDraw = 0.25; pUnderdog = 0.20; }
  else if (diff <= 30) { pFavor = 0.63; pDraw = 0.20; pUnderdog = 0.17; }
  else                 { pFavor = 0.72; pDraw = 0.16; pUnderdog = 0.12; }

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

function pickWeighted(options) {
  const total = options.reduce((s, o) => s + o[o.length - 1], 0);
  let r = Math.random() * total;
  for (const o of options) {
    r -= o[o.length - 1];
    if (r <= 0) return o;
  }
  return options[0];
}

// Predict a single match
export function predictMatch(homeTeam, awayTeam) {
  const rankH = FIFA_RANK[homeTeam] || 25;
  const rankA = FIFA_RANK[awayTeam] || 25;
  const probs = getOutcomeProbabilities(rankH, rankA);

  const roll = Math.random();
  let homeScore, awayScore;

  if (roll < probs.homeWin) {
    const [h, a] = pickWeighted(WIN_SCORES);
    homeScore = h; awayScore = a;
  } else if (roll < probs.homeWin + probs.draw) {
    const [h, a] = pickWeighted(DRAW_SCORES);
    homeScore = h; awayScore = a;
  } else {
    const [h, a] = pickWeighted(UPSET_SCORES);
    homeScore = h; awayScore = a;
  }

  return { homeScore, awayScore };
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
) {
  const allPreds = {};

  // Group stage
  for (const m of groupMatches) {
    const existing = existingPreds[m.id];
    if (isFilled(existing)) {
      allPreds[m.id] = { ...existing };
    } else {
      allPreds[m.id] = predictMatch(m.homeTeam, m.awayTeam);
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
      const pred = predictMatch(teams.home, teams.away);
      // Knockout draws need advancing team
      if (pred.homeScore === pred.awayScore) {
        pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
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
