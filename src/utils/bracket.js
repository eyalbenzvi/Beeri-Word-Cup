import { GROUPS } from "../data/teams";
import {
  groupMatches,
  R32_MATCHES,
  R16_MATCHES,
  QF_MATCHES,
  SF_MATCHES,
  FINAL_MATCHES,
} from "../data/matches";
import { lookupThirdPlaceAssignment } from "../data/thirdPlaceTable";

// FIFA 2026 expanded format: 12 group winners + 12 runners-up + the top 8 of
// 12 third-placed finishers advance to R32 (32 teams total). 8 here is the
// number of qualifying third-place spots — defined by the FIFA regulations,
// not arbitrary. Update only if the tournament format changes.
const THIRD_PLACE_QUALIFIERS = 8;

// Single source of truth for "the round that feeds into round X". Used by
// deriveActualAdvancing to decide which actual results gate a team's
// advancement claim. Replaces a hand-rolled ternary chain that was easy to
// get wrong on every edit.
const ROUND_PARENT = { R16: "R32", QF: "R16", SF: "QF", F: "SF" };

import { isScoreValid } from "./helpers";

const ALL_TEAMS_MAP = {};
for (const [groupName, teams] of Object.entries(GROUPS)) {
  for (const team of teams) {
    ALL_TEAMS_MAP[team.code] = groupName;
  }
}

// FIFA/Coca-Cola World Ranking (used as last-resort tiebreaker per 2026
// regulations). Source-of-truth lives in src/data/fifaRanking.js so
// bracket.js and fifaPredictor.js cannot drift apart.
import { FIFA_RANK_OFFICIAL as FIFA_RANKING } from "../data/fifaRanking";

export function calcGroupStandings(matchPredictions) {
  const standings = {};

  for (const [groupName, teams] of Object.entries(GROUPS)) {
    const stats = {};
    for (const team of teams) {
      stats[team.code] = {
        code: team.code,
        name: team.name,
        group: groupName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
      };
    }

    const gMatches = groupMatches.filter((m) => m.group === groupName);
    for (const match of gMatches) {
      const pred = matchPredictions[match.id];
      if (!isScoreValid(pred)) continue;

      const h = Number(pred.homeScore);
      const a = Number(pred.awayScore);
      if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
      const home = stats[match.homeTeam];
      const away = stats[match.awayTeam];
      if (!home || !away) continue;

      home.played++;
      away.played++;
      home.gf += h;
      home.ga += a;
      away.gf += a;
      away.ga += h;

      if (h > a) {
        home.won++;
        home.pts += 3;
        away.lost++;
      } else if (h < a) {
        away.won++;
        away.pts += 3;
        home.lost++;
      } else {
        home.drawn++;
        home.pts += 1;
        away.drawn++;
        away.pts += 1;
      }
    }

    const groupMatchResults = [];
    for (const match of gMatches) {
      const pred = matchPredictions[match.id];
      if (!isScoreValid(pred)) continue;
      groupMatchResults.push({
        team1Code: match.homeTeam,
        team2Code: match.awayTeam,
        team1Score: Number(pred.homeScore),
        team2Score: Number(pred.awayScore),
      });
    }

    function computeH2HStats(tiedCodes) {
      const codeSet = new Set(tiedCodes);
      const h2h = {};
      for (const code of tiedCodes) {
        h2h[code] = { pts: 0, gd: 0, gf: 0 };
      }
      for (const m of groupMatchResults) {
        if (!codeSet.has(m.team1Code) || !codeSet.has(m.team2Code)) continue;
        const s1 = h2h[m.team1Code];
        const s2 = h2h[m.team2Code];
        s1.gf += m.team1Score;
        s1.gd += m.team1Score - m.team2Score;
        s2.gf += m.team2Score;
        s2.gd += m.team2Score - m.team1Score;
        if (m.team1Score > m.team2Score) {
          s1.pts += 3;
        } else if (m.team2Score > m.team1Score) {
          s2.pts += 3;
        } else {
          s1.pts += 1;
          s2.pts += 1;
        }
      }
      return h2h;
    }

    const teamList = Object.values(stats);

    function sortTiedGroup(tiedTeams) {
      if (tiedTeams.length <= 1) return tiedTeams;

      const tiedCodes = tiedTeams.map((t) => t.code);
      const h2h = computeH2HStats(tiedCodes);

      // Step 1: Sort by H2H criteria only (FIFA rules a-c)
      tiedTeams.sort((a, b) => {
        const ha = h2h[a.code],
          hb = h2h[b.code];
        if (hb.pts !== ha.pts) return hb.pts - ha.pts;
        if (hb.gd !== ha.gd) return hb.gd - ha.gd;
        if (hb.gf !== ha.gf) return hb.gf - ha.gf;
        return 0;
      });

      // Step 2: Group consecutive teams still tied on H2H
      const result = [];
      let i = 0;
      while (i < tiedTeams.length) {
        let j = i + 1;
        while (j < tiedTeams.length) {
          const ha = h2h[tiedTeams[i].code],
            hb = h2h[tiedTeams[j].code];
          if (ha.pts !== hb.pts || ha.gd !== hb.gd || ha.gf !== hb.gf) break;
          j++;
        }
        const subGroup = tiedTeams.slice(i, j);
        if (subGroup.length > 1 && subGroup.length < tiedTeams.length) {
          // Step 3 (FIFA rule d): Re-apply H2H among just these teams
          result.push(...sortTiedGroup(subGroup));
        } else if (subGroup.length > 1) {
          // H2H exhausted (same group size) — fall to overall stats (FIFA rules e-h)
          subGroup.sort((a, b) => {
            const gdA = a.gf - a.ga,
              gdB = b.gf - b.ga;
            if (gdB !== gdA) return gdB - gdA;
            if (b.gf !== a.gf) return b.gf - a.gf;
            // FIFA ranking as last resort (2026 regulations, replaces drawing of lots)
            const rankA = FIFA_RANKING[a.code] || 999;
            const rankB = FIFA_RANKING[b.code] || 999;
            return rankA - rankB;
          });
          result.push(...subGroup);
        } else {
          result.push(...subGroup);
        }
        i = j;
      }
      return result;
    }

    const pointGroups = {};
    for (const t of teamList) {
      const key = t.pts;
      if (!pointGroups[key]) pointGroups[key] = [];
      pointGroups[key].push(t);
    }

    const sorted = [];
    const pointValues = Object.keys(pointGroups)
      .map(Number)
      .sort((a, b) => b - a);
    for (const pts of pointValues) {
      const group = pointGroups[pts];
      if (group.length === 1) {
        sorted.push(group[0]);
      } else {
        sorted.push(...sortTiedGroup(group));
      }
    }

    sorted.forEach((t, i) => {
      t.gd = t.gf - t.ga;
      t.position = i + 1;
    });
    standings[groupName] = sorted;
  }

  return standings;
}

function getTeamsByPosition(standings, position) {
  const teams = [];
  for (const [group, sorted] of Object.entries(standings)) {
    if (sorted[position - 1]) {
      teams.push({ ...sorted[position - 1], group });
    }
  }
  return teams;
}

function getBestThirdPlaceTeams(standings) {
  const thirdPlace = getTeamsByPosition(standings, 3);
  thirdPlace.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const rankA = FIFA_RANKING[a.code] || 999;
    const rankB = FIFA_RANKING[b.code] || 999;
    return rankA - rankB;
  });
  return thirdPlace.slice(0, THIRD_PLACE_QUALIFIERS);
}

function assignThirdPlaceTeams(qualifyingThird) {
  const qualTeamsByGroup = {};
  for (const t of qualifyingThird) {
    qualTeamsByGroup[t.group] = t.code;
  }

  const qualGroups = Object.keys(qualTeamsByGroup);
  const annexAssignments = lookupThirdPlaceAssignment(qualGroups);

  if (annexAssignments) {
    const result = {};
    for (const [slotId, groupLetter] of Object.entries(annexAssignments)) {
      result[slotId] = qualTeamsByGroup[groupLetter] || null;
    }
    return result;
  }

  return {};
}

function resolvePosition(pos, standings) {
  const position = parseInt(pos[0]);
  const group = pos.slice(1);
  const groupStandings = standings[group];
  if (!groupStandings || !groupStandings[position - 1]) return null;
  return groupStandings[position - 1].code;
}

function getMatchWinner(matchId, matchPredictions, bracketTeams) {
  const teams = bracketTeams[matchId];
  if (!teams || !teams.home || !teams.away) return null;

  const pred = matchPredictions[matchId];
  if (!isScoreValid(pred)) return null;

  const hs = Number(pred.homeScore);
  const as = Number(pred.awayScore);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;

  if (hs === as) {
    // Validate advancingTeam is one of the actual match teams
    if (pred.advancingTeam === teams.home || pred.advancingTeam === teams.away) {
      return pred.advancingTeam;
    }
    // Tied score with no `advancingTeam` set is genuinely "unresolved" — we
    // must return null so callers (and downstream rounds) don't silently
    // anoint the home side as winner. formValidation.js already flags this
    // condition as `unresolvedTie`, so the fallback only masked a real bug.
    return null;
  }
  return hs > as ? teams.home : teams.away;
}

export function calcBracketTeams(matchPredictions) {
  const standings = calcGroupStandings(matchPredictions);
  const bracket = {};

  const hasGroupPredictions = Object.values(standings).some((group) =>
    group.some((t) => t.played > 0),
  );
  if (!hasGroupPredictions) return bracket;

  const bestThird = getBestThirdPlaceTeams(standings);
  const thirdAssignments = assignThirdPlaceTeams(bestThird);

  for (const match of R32_MATCHES) {
    let home = null,
      away = null;

    if (match.home.match(/^[12][A-L]$/)) {
      home = resolvePosition(match.home, standings);
    }

    if (match.away === "3rd") {
      away = thirdAssignments[match.id] || null;
    } else if (match.away.match(/^[12][A-L]$/)) {
      away = resolvePosition(match.away, standings);
    }

    bracket[match.id] = { home, away };
  }

  for (const match of R16_MATCHES) {
    const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
    const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
    bracket[match.id] = { home, away };
  }

  for (const match of QF_MATCHES) {
    const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
    const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
    bracket[match.id] = { home, away };
  }

  for (const match of SF_MATCHES) {
    const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
    const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
    bracket[match.id] = { home, away };
  }

  for (const match of FINAL_MATCHES) {
    if (match.id === "3RD-1") {
      const sf1Teams = bracket["SF-1"];
      const sf2Teams = bracket["SF-2"];
      const sf1Pred = matchPredictions["SF-1"];
      const sf2Pred = matchPredictions["SF-2"];

      let home = null,
        away = null;
      if (
        sf1Teams?.home &&
        sf1Teams?.away &&
        sf1Pred?.homeScore !== null &&
        sf1Pred?.homeScore !== undefined
      ) {
        const s1h = Number(sf1Pred.homeScore);
        const s1a = Number(sf1Pred.awayScore);
        if (s1h === s1a) {
          const winner = sf1Pred.advancingTeam || sf1Teams.home;
          home = winner === sf1Teams.home ? sf1Teams.away : sf1Teams.home;
        } else {
          home = s1h > s1a ? sf1Teams.away : sf1Teams.home;
        }
      }
      if (
        sf2Teams?.home &&
        sf2Teams?.away &&
        sf2Pred?.homeScore !== null &&
        sf2Pred?.homeScore !== undefined
      ) {
        const s2h = Number(sf2Pred.homeScore);
        const s2a = Number(sf2Pred.awayScore);
        if (s2h === s2a) {
          const winner = sf2Pred.advancingTeam || sf2Teams.home;
          away = winner === sf2Teams.home ? sf2Teams.away : sf2Teams.home;
        } else {
          away = s2h > s2a ? sf2Teams.away : sf2Teams.home;
        }
      }
      bracket[match.id] = { home, away };
    } else {
      const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
      const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
      bracket[match.id] = { home, away };
    }
  }

  return bracket;
}

export function deriveAdvancingTeams(bracketTeams) {
  const advancing = { R32: [], R16: [], QF: [], SF: [], F: [] };

  for (const [matchId, teams] of Object.entries(bracketTeams)) {
    const addTeams = (round) => {
      if (teams.home && !advancing[round].includes(teams.home))
        advancing[round].push(teams.home);
      if (teams.away && !advancing[round].includes(teams.away))
        advancing[round].push(teams.away);
    };

    if (matchId.startsWith("R32-")) addTeams("R32");
    else if (matchId.startsWith("R16-")) addTeams("R16");
    else if (matchId.startsWith("QF-")) addTeams("QF");
    else if (matchId.startsWith("SF-")) addTeams("SF");
    else if (matchId === "F-1") addTeams("F");
  }

  return advancing;
}

export function deriveActualAdvancing(bracketTeams, actualResults) {
  const advancing = { R32: [], R16: [], QF: [], SF: [], F: [] };

  const groupMatchCounts = {};
  for (const matchId of Object.keys(actualResults)) {
    const groupMatch = matchId.match(/^group-([A-L])-/);
    if (groupMatch) {
      const g = groupMatch[1];
      groupMatchCounts[g] = (groupMatchCounts[g] || 0) + 1;
    }
  }
  const completedGroups = new Set(
    Object.entries(groupMatchCounts)
      .filter(([, count]) => count >= 6)
      .map(([g]) => g),
  );

  const allGroupsComplete = completedGroups.size >= 12;
  if (allGroupsComplete) {
    for (const [matchId, teams] of Object.entries(bracketTeams)) {
      if (!matchId.startsWith("R32-")) continue;
      if (teams.home && !advancing.R32.includes(teams.home)) {
        advancing.R32.push(teams.home);
      }
      if (teams.away && !advancing.R32.includes(teams.away)) {
        advancing.R32.push(teams.away);
      }
    }
  }

  for (const [matchId, teams] of Object.entries(bracketTeams)) {
    if (matchId.startsWith("R32-") || matchId.startsWith("group-")) continue;

    let round = null;
    if (matchId.startsWith("R16-")) round = "R16";
    else if (matchId.startsWith("QF-")) round = "QF";
    else if (matchId.startsWith("SF-")) round = "SF";
    else if (matchId === "F-1") round = "F";
    if (!round) continue;

    const feedingMatchesPlayed = (teamCode) => {
      if (!teamCode) return false;

      const priorRound = ROUND_PARENT[round];
      if (!priorRound) return false;
      for (const [mId, result] of Object.entries(actualResults)) {
        if (!mId.startsWith(priorRound + "-")) continue;
        if (result.homeScore === null || result.homeScore === undefined)
          continue;

        const bt = bracketTeams[mId];
        if (bt && (bt.home === teamCode || bt.away === teamCode)) return true;
      }
      return false;
    };

    if (
      teams.home &&
      feedingMatchesPlayed(teams.home) &&
      !advancing[round].includes(teams.home)
    ) {
      advancing[round].push(teams.home);
    }
    if (
      teams.away &&
      feedingMatchesPlayed(teams.away) &&
      !advancing[round].includes(teams.away)
    ) {
      advancing[round].push(teams.away);
    }
  }

  return advancing;
}

export function deriveChampion(matchPredictions, bracketTeams) {
  const finalTeams = bracketTeams["F-1"];
  if (!finalTeams?.home || !finalTeams?.away) return null;

  const pred = matchPredictions["F-1"];
  if (
    !pred ||
    pred.homeScore === null ||
    pred.homeScore === undefined ||
    pred.awayScore === null ||
    pred.awayScore === undefined
  )
    return null;

  const fh = Number(pred.homeScore);
  const fa = Number(pred.awayScore);
  if (!Number.isFinite(fh) || !Number.isFinite(fa)) return null;

  if (fh === fa) {
    return pred.advancingTeam || finalTeams.home;
  }
  return fh > fa ? finalTeams.home : finalTeams.away;
}
