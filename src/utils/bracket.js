// Calculate group standings and knockout bracket from predictions
import { GROUPS } from '../data/teams';
import { generateGroupMatches, R32_MATCHES, R16_MATCHES, QF_MATCHES, SF_MATCHES, FINAL_MATCHES } from '../data/matches';

const groupMatches = generateGroupMatches();

// Map team code → group letter (for deriveActualAdvancing)
const ALL_TEAMS_MAP = {};
for (const [groupName, teams] of Object.entries(GROUPS)) {
  for (const team of teams) {
    ALL_TEAMS_MAP[team.code] = groupName;
  }
}

// Calculate group standings from match predictions
export function calcGroupStandings(matchPredictions) {
  const standings = {};

  for (const [groupName, teams] of Object.entries(GROUPS)) {
    // Initialize team stats
    const stats = {};
    for (const team of teams) {
      stats[team.code] = { code: team.code, group: groupName, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    }

    // Process group matches
    const gMatches = groupMatches.filter((m) => m.group === groupName);
    for (const match of gMatches) {
      const pred = matchPredictions[match.id];
      if (!pred || pred.homeScore === null || pred.homeScore === undefined ||
          pred.awayScore === null || pred.awayScore === undefined) continue;

      const h = pred.homeScore;
      const a = pred.awayScore;
      const home = stats[match.homeTeam];
      const away = stats[match.awayTeam];
      if (!home || !away) continue;

      home.played++; away.played++;
      home.gf += h; home.ga += a;
      away.gf += a; away.ga += h;

      if (h > a) { home.won++; home.pts += 3; away.lost++; }
      else if (h < a) { away.won++; away.pts += 3; home.lost++; }
      else { home.drawn++; home.pts += 1; away.drawn++; away.pts += 1; }
    }

    // Sort: pts > gd > gf
    const sorted = Object.values(stats).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
      if (gdB !== gdA) return gdB - gdA;
      return b.gf - a.gf;
    });

    sorted.forEach((t, i) => { t.gd = t.gf - t.ga; t.position = i + 1; });
    standings[groupName] = sorted;
  }

  return standings;
}

// Get teams by position across all groups
function getTeamsByPosition(standings, position) {
  const teams = [];
  for (const [group, sorted] of Object.entries(standings)) {
    if (sorted[position - 1]) {
      teams.push({ ...sorted[position - 1], group });
    }
  }
  return teams;
}

// Determine which 8 third-place teams qualify (rank by pts > gd > gf)
function getBestThirdPlaceTeams(standings) {
  const thirdPlace = getTeamsByPosition(standings, 3);
  thirdPlace.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
  return thirdPlace.slice(0, 8);
}

// Assign qualifying 3rd-place teams to R32 match slots using backtracking
// Each R32 match with a 3rd-place slot has constraints on which groups' 3rd-place teams can play there
function assignThirdPlaceTeams(qualifyingThird) {
  const slots = [
    { matchId: 'R32-2',  thirdFrom: ['A','B','C','D','F'] },
    { matchId: 'R32-5',  thirdFrom: ['C','D','F','G','H'] },
    { matchId: 'R32-7',  thirdFrom: ['C','E','F','H','I'] },
    { matchId: 'R32-8',  thirdFrom: ['E','H','I','J','K'] },
    { matchId: 'R32-9',  thirdFrom: ['B','E','F','I','J'] },
    { matchId: 'R32-10', thirdFrom: ['A','E','H','I','J'] },
    { matchId: 'R32-13', thirdFrom: ['E','F','G','I','J'] },
    { matchId: 'R32-15', thirdFrom: ['D','E','I','J','L'] },
  ];

  // Map qualifying groups to team codes
  const qualTeamsByGroup = {};
  for (const t of qualifyingThird) {
    qualTeamsByGroup[t.group] = t.code;
  }

  const assignments = {};

  // Backtracking solver — guarantees finding a valid assignment
  function solve(slotIndex, assigned) {
    if (slotIndex === slots.length) return true;

    const slot = slots[slotIndex];
    for (const group of slot.thirdFrom) {
      if (qualTeamsByGroup[group] && !assigned.has(group)) {
        assigned.add(group);
        assignments[slot.matchId] = qualTeamsByGroup[group];
        if (solve(slotIndex + 1, assigned)) return true;
        assigned.delete(group);
        delete assignments[slot.matchId];
      }
    }
    return false;
  }

  solve(0, new Set());
  return assignments;
}

// Resolve a bracket position like "1A" or "2F" to a team code
function resolvePosition(pos, standings) {
  const position = parseInt(pos[0]); // 1 or 2
  const group = pos.slice(1);         // A-L
  const groupStandings = standings[group];
  if (!groupStandings || !groupStandings[position - 1]) return null;
  return groupStandings[position - 1].code;
}

// Determine match winner from predictions
function getMatchWinner(matchId, matchPredictions, bracketTeams) {
  const teams = bracketTeams[matchId];
  if (!teams || !teams.home || !teams.away) return null;

  const pred = matchPredictions[matchId];
  if (!pred || pred.homeScore === null || pred.homeScore === undefined ||
      pred.awayScore === null || pred.awayScore === undefined) return null;

  // In knockout: if draw, use advancingTeam choice; default to home
  if (pred.homeScore === pred.awayScore) {
    return pred.advancingTeam || teams.home;
  }
  return pred.homeScore > pred.awayScore ? teams.home : teams.away;
}

// Calculate the full bracket from match predictions
// Returns { matchId: { home: teamCode, away: teamCode } } for all knockout matches
export function calcBracketTeams(matchPredictions) {
  const standings = calcGroupStandings(matchPredictions);
  const bracket = {};

  // Check if we have enough group predictions to calculate standings
  const hasGroupPredictions = Object.values(standings).some(
    (group) => group.some((t) => t.played > 0)
  );
  if (!hasGroupPredictions) return bracket;

  // Best 8 third-place teams
  const bestThird = getBestThirdPlaceTeams(standings);
  const thirdAssignments = assignThirdPlaceTeams(bestThird);

  // === R32 ===
  for (const match of R32_MATCHES) {
    let home = null, away = null;

    if (match.home === '3rd') {
      // This shouldn't happen based on our data
    } else if (match.home.match(/^[12][A-L]$/)) {
      home = resolvePosition(match.home, standings);
    }

    if (match.away === '3rd') {
      away = thirdAssignments[match.id] || null;
    } else if (match.away.match(/^[12][A-L]$/)) {
      away = resolvePosition(match.away, standings);
    }

    bracket[match.id] = { home, away };
  }

  // === R16 ===
  for (const match of R16_MATCHES) {
    const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
    const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
    bracket[match.id] = { home, away };
  }

  // === QF ===
  for (const match of QF_MATCHES) {
    const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
    const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
    bracket[match.id] = { home, away };
  }

  // === SF ===
  for (const match of SF_MATCHES) {
    const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
    const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
    bracket[match.id] = { home, away };
  }

  // === 3RD & FINAL ===
  for (const match of FINAL_MATCHES) {
    if (match.id === '3RD-1') {
      // Losers of semis
      const sf1Teams = bracket['SF-1'];
      const sf2Teams = bracket['SF-2'];
      const sf1Pred = matchPredictions['SF-1'];
      const sf2Pred = matchPredictions['SF-2'];

      let home = null, away = null;
      if (sf1Teams?.home && sf1Teams?.away && sf1Pred?.homeScore !== null && sf1Pred?.homeScore !== undefined) {
        if (sf1Pred.homeScore === sf1Pred.awayScore) {
          const winner = sf1Pred.advancingTeam || sf1Teams.home;
          home = winner === sf1Teams.home ? sf1Teams.away : sf1Teams.home;
        } else {
          home = sf1Pred.homeScore > sf1Pred.awayScore ? sf1Teams.away : sf1Teams.home;
        }
      }
      if (sf2Teams?.home && sf2Teams?.away && sf2Pred?.homeScore !== null && sf2Pred?.homeScore !== undefined) {
        if (sf2Pred.homeScore === sf2Pred.awayScore) {
          const winner = sf2Pred.advancingTeam || sf2Teams.home;
          away = winner === sf2Teams.home ? sf2Teams.away : sf2Teams.home;
        } else {
          away = sf2Pred.homeScore > sf2Pred.awayScore ? sf2Teams.away : sf2Teams.home;
        }
      }
      bracket[match.id] = { home, away };
    } else {
      // Final: winners of semis
      const home = getMatchWinner(match.homeFrom, matchPredictions, bracket);
      const away = getMatchWinner(match.awayFrom, matchPredictions, bracket);
      bracket[match.id] = { home, away };
    }
  }

  return bracket;
}

// Derive which teams advance to each round from bracket
export function deriveAdvancingTeams(bracketTeams) {
  const advancing = { R32: [], R16: [], QF: [], SF: [], F: [] };

  for (const [matchId, teams] of Object.entries(bracketTeams)) {
    const addTeams = (round) => {
      if (teams.home && !advancing[round].includes(teams.home)) advancing[round].push(teams.home);
      if (teams.away && !advancing[round].includes(teams.away)) advancing[round].push(teams.away);
    };

    if (matchId.startsWith('R32-')) addTeams('R32');
    else if (matchId.startsWith('R16-')) addTeams('R16');
    else if (matchId.startsWith('QF-')) addTeams('QF');
    else if (matchId.startsWith('SF-')) addTeams('SF');
    else if (matchId === 'F-1') addTeams('F');
  }

  return advancing;
}

// Like deriveAdvancingTeams, but only includes teams from completed stages.
// R32 teams only from groups where all 6 matches have actual results.
// Knockout teams only from matches that have actually been played.
export function deriveActualAdvancing(bracketTeams, actualResults) {
  const advancing = { R32: [], R16: [], QF: [], SF: [], F: [] };

  // Determine which groups are fully completed (6 matches each)
  const groupMatchCounts = {};
  for (const matchId of Object.keys(actualResults)) {
    const groupMatch = matchId.match(/^group-([A-L])-/);
    if (groupMatch) {
      const g = groupMatch[1];
      groupMatchCounts[g] = (groupMatchCounts[g] || 0) + 1;
    }
  }
  const completedGroups = new Set(
    Object.entries(groupMatchCounts).filter(([, count]) => count >= 6).map(([g]) => g)
  );

  // R32: only include teams from completed groups
  for (const [matchId, teams] of Object.entries(bracketTeams)) {
    if (!matchId.startsWith('R32-')) continue;
    // Both teams must come from completed groups to count
    if (teams.home) {
      const homeGroup = ALL_TEAMS_MAP[teams.home];
      if (homeGroup && completedGroups.has(homeGroup) && !advancing.R32.includes(teams.home)) {
        advancing.R32.push(teams.home);
      }
    }
    if (teams.away) {
      const awayGroup = ALL_TEAMS_MAP[teams.away];
      if (awayGroup && completedGroups.has(awayGroup) && !advancing.R32.includes(teams.away)) {
        advancing.R32.push(teams.away);
      }
    }
  }

  // Knockout rounds: only include teams from matches that have been played
  for (const [matchId, teams] of Object.entries(bracketTeams)) {
    if (matchId.startsWith('R32-') || matchId.startsWith('group-')) continue;

    // The teams in this match advance from the previous round,
    // but only if the match feeding them has been played.
    // A team appears in R16 bracket if its R32 match was played.
    // Check: does the result exist for the match that produced this team?
    let round = null;
    if (matchId.startsWith('R16-')) round = 'R16';
    else if (matchId.startsWith('QF-')) round = 'QF';
    else if (matchId.startsWith('SF-')) round = 'SF';
    else if (matchId === 'F-1') round = 'F';
    if (!round) continue;

    // For knockout, the teams here were determined by previous matches.
    // We only count them as "advancing to this round" if the previous round matches have results.
    // Simple approach: check if the feeding matches have results.
    const feedingMatchesPlayed = (teamCode) => {
      if (!teamCode) return false;
      // Find which previous match this team won to get here
      // The team is in this bracket slot because it won a prior match
      // Check all matches in the prior round for this team
      const priorRound = round === 'R16' ? 'R32' : round === 'QF' ? 'R16' : round === 'SF' ? 'QF' : round === 'F' ? 'SF' : null;
      if (!priorRound) return false;
      for (const [mId, result] of Object.entries(actualResults)) {
        if (!mId.startsWith(priorRound + '-') && !(priorRound === 'R32' && mId.startsWith('R32-'))) continue;
        if (result.homeScore === null || result.homeScore === undefined) continue;
        // This match was played - did this team participate?
        const bt = bracketTeams[mId];
        if (bt && (bt.home === teamCode || bt.away === teamCode)) return true;
      }
      return false;
    };

    if (teams.home && feedingMatchesPlayed(teams.home) && !advancing[round].includes(teams.home)) {
      advancing[round].push(teams.home);
    }
    if (teams.away && feedingMatchesPlayed(teams.away) && !advancing[round].includes(teams.away)) {
      advancing[round].push(teams.away);
    }
  }

  return advancing;
}

// Derive champion from final match prediction
export function deriveChampion(matchPredictions, bracketTeams) {
  const finalTeams = bracketTeams['F-1'];
  if (!finalTeams?.home || !finalTeams?.away) return null;

  const pred = matchPredictions['F-1'];
  if (!pred || pred.homeScore === null || pred.homeScore === undefined ||
      pred.awayScore === null || pred.awayScore === undefined) return null;

  if (pred.homeScore === pred.awayScore) {
    return pred.advancingTeam || finalTeams.home;
  }
  return pred.homeScore > pred.awayScore ? finalTeams.home : finalTeams.away;
}
