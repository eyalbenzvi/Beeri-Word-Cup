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
import { calcGroupStandings } from "./bracket";

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
// When `respectExisting` is true (default): user-filled matches are preserved verbatim.
// When false: every match in the group involving the target (and, for pos 2, firstPlace)
//   is overwritten, regardless of what the user had there.
function forceGroupResult(
  groupName,
  target,
  targetPos,
  opponentFirst,
  groupMatchesArr,
  allPreds,
  existingPreds,
  respectExisting = true,
) {
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
    const home = m.homeTeam;
    const away = m.awayTeam;
    const touchesTarget = home === target || away === target;
    const touchesFirst = firstPlace && (home === firstPlace || away === firstPlace);

    // In hard mode, always overwrite matches involving target or firstPlace.
    // For matches that don't involve them, still respect user-filled data.
    const mustOverwrite = !respectExisting && (touchesTarget || touchesFirst);
    if (!mustOverwrite && isFilled(existingPreds[m.id])) continue;

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

// Pick a top scorer from the champion's squad, preferring striker-flagged
// attackers. Falls back to the full team squad if no strikers are flagged
// (e.g. admin-uploaded custom list without the flag), and to the whole list
// as a last resort.
export function pickTopScorerForTeam(teamCode, playerList) {
  if (!Array.isArray(playerList) || playerList.length === 0) return null;
  const teamPlayers = playerList.filter((p) => p.team === teamCode);
  const strikers = teamPlayers.filter((p) => p.striker === true);
  const pool = strikers.length > 0
    ? strikers
    : teamPlayers.length > 0
      ? teamPlayers
      : playerList;
  return pool[Math.floor(Math.random() * pool.length)];
}

function findTeamPosition(sortedTeams, code) {
  if (!Array.isArray(sortedTeams)) return null;
  const idx = sortedTeams.findIndex((t) => t.code === code);
  return idx >= 0 ? idx + 1 : null;
}

// Given a filled knockout prediction, return the team that advances per the prediction.
// null if scores are missing; for a draw, returns advancingTeam (may be undefined).
function predictedWinner(pred, teams) {
  if (!pred || !teams) return null;
  const h = pred.homeScore;
  const a = pred.awayScore;
  if (typeof h !== "number" || typeof a !== "number") return null;
  if (h === a) return pred.advancingTeam || null;
  return h > a ? teams.home : teams.away;
}

// Apply the scenario-shaped group fill. Both calls use the user's `existingPreds` (not a
// running virtual state), so the second call can still write runner-up results into
// matches that Call 1 wrote as random predictions — while still skipping user-filled matches.
// In the same-group case the two calls agree on champ-vs-runner-up (champion wins).
function fillGroupStage(champion, runnerUp, champGroup, runnerGroup, positions, groupMatchesArr, allPreds, existingPreds, respectExisting) {
  if (champGroup === runnerGroup) {
    forceGroupResult(champGroup, champion, 1, null, groupMatchesArr, allPreds, existingPreds, respectExisting);
    forceGroupResult(runnerGroup, runnerUp, 2, champion, groupMatchesArr, allPreds, existingPreds, respectExisting);
  } else {
    forceGroupResult(champGroup, champion, positions.champion, null, groupMatchesArr, allPreds, existingPreds, respectExisting);
    forceGroupResult(runnerGroup, runnerUp, positions.runnerUp, null, groupMatchesArr, allPreds, existingPreds, respectExisting);
  }
}

// Generate a full form of predictions where `champion` beats `runnerUp` in the final.
// Preserves user-filled predictions when they're consistent with the scenario. If they
// would prevent the scenario (e.g. champion losing in groups, wrong bracket side, or
// losing a knockout match), predictions for the two finalists are silently overwritten.
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

  const allPreds: Record<string, any> = {};
  // Start by copying existing predictions (preserve verbatim — may be overwritten below)
  for (const [mid, p] of Object.entries(existingPreds)) {
    if (isFilled(p)) allPreds[mid] = { ...(p as object) };
  }

  const positions = pickGroupPositions(champGroup, runnerGroup);
  const expectedChampPos = champGroup === runnerGroup ? 1 : positions.champion;
  const expectedRunnerPos = champGroup === runnerGroup ? 2 : positions.runnerUp;

  // --- Group stage (soft — preserve user-filled matches verbatim) ---
  fillGroupStage(champion, runnerUp, champGroup, runnerGroup, positions, groupMatchesArr, allPreds, existingPreds, true);

  // Fill remaining group matches (groups other than champion/runner-up) with normal predictions
  for (const m of groupMatchesArr) {
    if (allPreds[m.id]) continue;
    if (isFilled(existingPreds[m.id])) {
      allPreds[m.id] = { ...existingPreds[m.id] };
    } else {
      allPreds[m.id] = predictMatch(m.homeTeam, m.awayTeam);
    }
  }

  // --- Detect group-stage conflict and hard-override if needed ---
  const standings = calcGroupStandings(allPreds);
  const actualChampPos = findTeamPosition(standings[champGroup], champion);
  const actualRunnerPos = findTeamPosition(standings[runnerGroup], runnerUp);
  const champSide = BRACKET_SIDE_MAP[`${expectedChampPos}${champGroup}`];
  const runnerSide = BRACKET_SIDE_MAP[`${expectedRunnerPos}${runnerGroup}`];

  const groupConflict =
    actualChampPos !== expectedChampPos ||
    actualRunnerPos !== expectedRunnerPos ||
    champSide === runnerSide; // defensive — pickGroupPositions guarantees otherwise

  if (groupConflict) {
    fillGroupStage(champion, runnerUp, champGroup, runnerGroup, positions, groupMatchesArr, allPreds, existingPreds, false);
  }

  // --- Knockout cascade ---
  // For each match involving champion/runner-up, keep user's pick only if it agrees
  // with the scenario (correct team advances). Otherwise silently override.
  const knockoutStages = ["R32", "R16", "QF", "SF", "3RD", "F"];
  for (const stage of knockoutStages) {
    const bracket = calcBracketTeams(allPreds);
    const stageMatches = knockoutMatchesArr.filter((m) => m.stage === stage);
    for (const m of stageMatches) {
      const teams = bracket[m.id];
      if (!teams?.home || !teams?.away) continue;

      const hasChamp = teams.home === champion || teams.away === champion;
      const hasRunner = teams.home === runnerUp || teams.away === runnerUp;
      const isFinalMatch = m.stage === "F" && hasChamp && hasRunner;

      const existing = existingPreds[m.id];
      if (isFilled(existing)) {
        let compatible = true;
        if (isFinalMatch || hasChamp) {
          compatible = predictedWinner(existing, teams) === champion;
        } else if (hasRunner) {
          compatible = predictedWinner(existing, teams) === runnerUp;
        }
        if (compatible) {
          allPreds[m.id] = { ...existing };
          continue;
        }
        // incompatible — fall through to biased generator (silent override)
      }

      if (isFinalMatch) {
        allPreds[m.id] = predictFinal(teams.home, teams.away, champion);
      } else if (hasChamp) {
        allPreds[m.id] = predictKnockoutBiased(teams.home, teams.away, champion);
      } else if (hasRunner) {
        allPreds[m.id] = predictKnockoutBiased(teams.home, teams.away, runnerUp);
      } else {
        const pred: any = predictMatch(teams.home, teams.away);
        if (pred.homeScore === pred.awayScore) {
          pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
        }
        allPreds[m.id] = pred;
      }
    }
  }

  return allPreds;
}
