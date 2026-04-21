// Scenario predictor — fills a form so a chosen champion beats a chosen runner-up in the final.
// Works by:
//   1. Picking group positions (1st/2nd) that place the two teams on opposite sides of the bracket.
//   2. Forcing group-stage results so both teams actually finish at those positions.
//   3. Walking round-by-round through R32..SF, biasing matches so the champion (and runner-up)
//      advance — either by winning outright, or by drawing and taking the tie on penalties.
//   4. Fixing the final so the champion beats the runner-up.
//   5. Picking a top scorer from the champion's squad.
//
// Preserves any prediction already in `existingPreds` verbatim (same contract as predictAllMatches).

import { GROUPS } from "../data/teams";
import {
  R32_MATCHES,
  R16_MATCHES,
  QF_MATCHES,
  SF_MATCHES,
} from "../data/matches";
import { predictMatch } from "./fifaPredictor";

const TEAM_TO_GROUP = {};
for (const [groupName, teams] of Object.entries(GROUPS)) {
  for (const t of teams) TEAM_TO_GROUP[t.code] = groupName;
}

// Score distributions for biased matches (reused shapes from real World Cup data)
const BIASED_WIN_SCORES = [
  [1, 0, 30], [2, 0, 18], [2, 1, 25], [3, 0, 7], [3, 1, 10], [4, 1, 4], [3, 2, 3], [4, 0, 2],
];
const DRAW_SCORES = [
  [0, 0, 33], [1, 1, 42], [2, 2, 20], [3, 3, 5],
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

function isFilled(pred) {
  return (
    pred != null &&
    typeof pred.homeScore === "number" &&
    typeof pred.awayScore === "number"
  );
}

// Build the static map: position like "1A" or "2F" → "top" | "bottom" half of bracket.
// Derived from matches.js so it stays correct if the bracket definition changes.
export function buildBracketSideMap() {
  const r32ToR16 = {};
  for (const m of R16_MATCHES) {
    r32ToR16[m.homeFrom] = m.id;
    r32ToR16[m.awayFrom] = m.id;
  }
  const r16ToQF = {};
  for (const m of QF_MATCHES) {
    r16ToQF[m.homeFrom] = m.id;
    r16ToQF[m.awayFrom] = m.id;
  }
  const qfToSF = {};
  for (const m of SF_MATCHES) {
    qfToSF[m.homeFrom] = m.id;
    qfToSF[m.awayFrom] = m.id;
  }

  const map = {};
  for (const m of R32_MATCHES) {
    const sf = qfToSF[r16ToQF[r32ToR16[m.id]]];
    const side = sf === "SF-1" ? "top" : "bottom";
    if (/^[12][A-L]$/.test(m.home)) map[m.home] = side;
    if (/^[12][A-L]$/.test(m.away)) map[m.away] = side;
  }
  return map;
}

export const BRACKET_SIDE_MAP = buildBracketSideMap();

// Decide which group position each finalist should take so they land on opposite
// sides of the bracket (meeting only in the final).
// Within every group, 1st and 2nd always fall on opposite sides, so a valid pair
// always exists.
export function pickGroupPositions(championGroup, runnerUpGroup) {
  if (championGroup === runnerUpGroup) {
    // Only legal split within a group
    return { champion: 1, runnerUp: 2 };
  }
  const champSide = BRACKET_SIDE_MAP[`1${championGroup}`];
  const runnerSide1 = BRACKET_SIDE_MAP[`1${runnerUpGroup}`];
  if (champSide !== runnerSide1) {
    return { champion: 1, runnerUp: 1 };
  }
  // Same side — flip runner-up to 2nd (which is the opposite side of their group's 1st)
  return { champion: 1, runnerUp: 2 };
}

// Force a group's results so `target` finishes at `targetPos` (1 or 2).
// - targetPos 1: target wins all 3 matches.
// - targetPos 2: target loses to ONE other team (who then finishes 1st), wins the other 2.
//   If `opponentFirst` is set and in the same group, they're the designated 1st-place team.
// Preserves any user-filled matches verbatim; only writes to unfilled matches.
function forceGroupResult(groupName, target, targetPos, opponentFirst, groupMatchesArr, allPreds, existingPreds) {
  const groupTeams = GROUPS[groupName].map((t) => t.code);
  const gms = groupMatchesArr.filter((m) => m.group === groupName);

  // Pick the 1st-place team when target is 2nd
  let firstPlace = null;
  if (targetPos === 2) {
    if (opponentFirst && groupTeams.includes(opponentFirst) && opponentFirst !== target) {
      firstPlace = opponentFirst;
    } else {
      firstPlace = groupTeams.find((c) => c !== target);
    }
  }

  for (const m of gms) {
    if (isFilled(existingPreds[m.id])) continue; // preserve user-filled
    const home = m.homeTeam;
    const away = m.awayTeam;

    let pred;
    if (targetPos === 1) {
      if (home === target) {
        const [h, a] = pickWeighted(BIASED_WIN_SCORES);
        pred = { homeScore: h, awayScore: a };
      } else if (away === target) {
        const [h, a] = pickWeighted(BIASED_WIN_SCORES);
        pred = { homeScore: a, awayScore: h };
      } else {
        pred = predictMatch(home, away);
      }
    } else {
      // targetPos === 2
      const isTargetVsFirst =
        (home === target && away === firstPlace) ||
        (away === target && home === firstPlace);
      if (isTargetVsFirst) {
        // firstPlace beats target
        const [h, a] = pickWeighted(BIASED_WIN_SCORES);
        pred = home === firstPlace
          ? { homeScore: h, awayScore: a }
          : { homeScore: a, awayScore: h };
      } else if (home === target || away === target) {
        // target wins other matches
        const [h, a] = pickWeighted(BIASED_WIN_SCORES);
        pred = home === target
          ? { homeScore: h, awayScore: a }
          : { homeScore: a, awayScore: h };
      } else if (home === firstPlace || away === firstPlace) {
        // firstPlace also wins their other matches (to actually finish 1st)
        const [h, a] = pickWeighted(BIASED_WIN_SCORES);
        pred = home === firstPlace
          ? { homeScore: h, awayScore: a }
          : { homeScore: a, awayScore: h };
      } else {
        pred = predictMatch(home, away);
      }
    }
    allPreds[m.id] = pred;
  }
}

// Biased match prediction for the knockout stage: `preferredWinner` advances.
// Either wins outright (80%) or draws and wins on penalties (20% — `advancingTeam`).
function predictKnockoutBiased(homeTeam, awayTeam, preferredWinner) {
  const drawRoll = Math.random();
  if (drawRoll < 0.2) {
    const [h, a] = pickWeighted(DRAW_SCORES);
    return { homeScore: h, awayScore: a, advancingTeam: preferredWinner };
  }
  const [hi, lo] = pickWeighted(BIASED_WIN_SCORES);
  if (preferredWinner === homeTeam) {
    return { homeScore: hi, awayScore: lo };
  }
  return { homeScore: lo, awayScore: hi };
}

// Final: champion beats runner-up — 70% outright win, 30% draw + penalties.
function predictFinal(homeTeam, awayTeam, champion) {
  const drawRoll = Math.random();
  if (drawRoll < 0.3) {
    const [h, a] = pickWeighted(DRAW_SCORES);
    return { homeScore: h, awayScore: a, advancingTeam: champion };
  }
  const [hi, lo] = pickWeighted(BIASED_WIN_SCORES);
  if (champion === homeTeam) {
    return { homeScore: hi, awayScore: lo };
  }
  return { homeScore: lo, awayScore: hi };
}

// Pick a top scorer from the champion's squad. Falls back to any player if the
// champion has no players in the list.
export function pickTopScorerForTeam(teamCode, playerList) {
  if (!Array.isArray(playerList) || playerList.length === 0) return null;
  const teamPlayers = playerList.filter((p) => p.team === teamCode);
  const pool = teamPlayers.length > 0 ? teamPlayers : playerList;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Generate a full form of predictions where `champion` beats `runnerUp` in the final.
// Contract mirrors predictAllMatches — preserves existing filled predictions verbatim.
export function predictScenario(
  champion,
  runnerUp,
  groupMatchesArr,
  knockoutMatchesArr,
  calcBracketTeams,
  existingPreds = {},
) {
  if (!champion || !runnerUp || champion === runnerUp) {
    throw new Error("predictScenario requires distinct champion and runnerUp");
  }
  const champGroup = TEAM_TO_GROUP[champion];
  const runnerGroup = TEAM_TO_GROUP[runnerUp];
  if (!champGroup || !runnerGroup) {
    throw new Error(`Unknown team code: ${champion} or ${runnerUp}`);
  }

  const allPreds = {};

  // Start by copying existing predictions (preserve verbatim)
  for (const [mid, p] of Object.entries(existingPreds)) {
    if (isFilled(p)) allPreds[mid] = { ...p };
  }

  const positions = pickGroupPositions(champGroup, runnerGroup);

  // --- Group stage ---
  if (champGroup === runnerGroup) {
    // Champion 1st, runner-up 2nd, in the same group
    forceGroupResult(champGroup, champion, 1, null, groupMatchesArr, allPreds, existingPreds);
    // The 2nd-place logic needs to know that champion is the one who beats runner-up —
    // but forceGroupResult(champion, 1) already wrote "champion beats runner-up".
    // Now we need runner-up to win their other 2 matches so they finish 2nd.
    // forceGroupResult with target=runnerUp, targetPos=2, opponentFirst=champion handles it,
    // but we must NOT overwrite the champion's matches we just wrote. Use existingPreds+allPreds.
    const virtualExisting = { ...existingPreds, ...allPreds };
    forceGroupResult(runnerGroup, runnerUp, 2, champion, groupMatchesArr, allPreds, virtualExisting);
  } else {
    forceGroupResult(champGroup, champion, positions.champion, null, groupMatchesArr, allPreds, existingPreds);
    const virtualExisting = { ...existingPreds, ...allPreds };
    forceGroupResult(runnerGroup, runnerUp, positions.runnerUp, null, groupMatchesArr, allPreds, virtualExisting);
  }

  // Fill remaining group matches (groups other than champion/runner-up) with normal predictions
  for (const m of groupMatchesArr) {
    if (allPreds[m.id]) continue;
    if (isFilled(existingPreds[m.id])) {
      allPreds[m.id] = { ...existingPreds[m.id] };
    } else {
      allPreds[m.id] = predictMatch(m.homeTeam, m.awayTeam);
    }
  }

  // --- Knockout cascade ---
  const knockoutStages = ["R32", "R16", "QF", "SF", "3RD", "F"];
  for (const stage of knockoutStages) {
    const bracket = calcBracketTeams(allPreds);
    const stageMatches = knockoutMatchesArr.filter((m) => m.stage === stage);
    for (const m of stageMatches) {
      if (isFilled(existingPreds[m.id])) {
        allPreds[m.id] = { ...existingPreds[m.id] };
        continue;
      }
      const teams = bracket[m.id];
      if (!teams?.home || !teams?.away) continue;

      const hasChamp = teams.home === champion || teams.away === champion;
      const hasRunner = teams.home === runnerUp || teams.away === runnerUp;

      if (m.stage === "F" && hasChamp && hasRunner) {
        allPreds[m.id] = predictFinal(teams.home, teams.away, champion);
      } else if (hasChamp) {
        allPreds[m.id] = predictKnockoutBiased(teams.home, teams.away, champion);
      } else if (hasRunner) {
        allPreds[m.id] = predictKnockoutBiased(teams.home, teams.away, runnerUp);
      } else {
        const pred = predictMatch(teams.home, teams.away);
        if (pred.homeScore === pred.awayScore) {
          pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
        }
        allPreds[m.id] = pred;
      }
    }
  }

  return allPreds;
}
