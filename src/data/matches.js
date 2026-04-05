import { GROUPS } from './teams';

// Generate group stage matches (round-robin within each group)
export function generateGroupMatches() {
  const matches = [];
  let matchNum = 1;

  for (const [groupName, teams] of Object.entries(GROUPS)) {
    // Round-robin: each team plays every other team once
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          id: `group-${groupName}-${matchNum}`,
          stage: 'group',
          group: groupName,
          matchNumber: matchNum,
          homeTeam: teams[i].code,
          awayTeam: teams[j].code,
          homeScore: null,
          awayScore: null,
          played: false,
        });
        matchNum++;
      }
    }
  }
  return matches;
}

// Knockout stage match templates
export const KNOCKOUT_ROUNDS = [
  { id: 'R32', name: 'Round of 32', matches: 16 },
  { id: 'R16', name: 'Round of 16', matches: 8 },
  { id: 'QF', name: 'Quarter-Finals', matches: 4 },
  { id: 'SF', name: 'Semi-Finals', matches: 2 },
  { id: '3RD', name: 'Third Place', matches: 1 },
  { id: 'F', name: 'Final', matches: 1 },
];

// Round of 32 matchups based on FIFA 2026 format:
// 1st and 2nd from each group advance (24 teams)
// 8 best 3rd-place teams also advance (8 teams) = 32 total
// The bracket is pre-determined by group positions
export const R32_TEMPLATE = [
  { id: 'R32-1', home: '1A', away: '3C/D/E', label: 'R32 Match 1' },
  { id: 'R32-2', home: '2B', away: '2A', label: 'R32 Match 2' },
  { id: 'R32-3', home: '1C', away: '3A/B/F', label: 'R32 Match 3' },
  { id: 'R32-4', home: '2D', away: '2C', label: 'R32 Match 4' },
  { id: 'R32-5', home: '1E', away: '3G/H/I', label: 'R32 Match 5' },
  { id: 'R32-6', home: '2F', away: '2E', label: 'R32 Match 6' },
  { id: 'R32-7', home: '1G', away: '3J/K/L', label: 'R32 Match 7' },
  { id: 'R32-8', home: '2H', away: '2G', label: 'R32 Match 8' },
  { id: 'R32-9', home: '1B', away: '3A/B/F', label: 'R32 Match 9' },
  { id: 'R32-10', home: '2A', away: '2L', label: 'R32 Match 10' },
  { id: 'R32-11', home: '1D', away: '3C/D/E', label: 'R32 Match 11' },
  { id: 'R32-12', home: '2C', away: '2J', label: 'R32 Match 12' },
  { id: 'R32-13', home: '1F', away: '3G/H/I', label: 'R32 Match 13' },
  { id: 'R32-14', home: '2E', away: '2H', label: 'R32 Match 14' },
  { id: 'R32-15', home: '1H', away: '3J/K/L', label: 'R32 Match 15' },
  { id: 'R32-16', home: '2G', away: '2K', label: 'R32 Match 16' },
];

export function generateKnockoutMatches() {
  const matches = [];

  // Round of 32
  for (let i = 1; i <= 16; i++) {
    matches.push({
      id: `R32-${i}`,
      stage: 'R32',
      matchNumber: i,
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
      played: false,
    });
  }

  // Round of 16
  for (let i = 1; i <= 8; i++) {
    matches.push({
      id: `R16-${i}`,
      stage: 'R16',
      matchNumber: i,
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
      played: false,
    });
  }

  // Quarter-finals
  for (let i = 1; i <= 4; i++) {
    matches.push({
      id: `QF-${i}`,
      stage: 'QF',
      matchNumber: i,
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
      played: false,
    });
  }

  // Semi-finals
  for (let i = 1; i <= 2; i++) {
    matches.push({
      id: `SF-${i}`,
      stage: 'SF',
      matchNumber: i,
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
      played: false,
    });
  }

  // Third place
  matches.push({
    id: '3RD-1',
    stage: '3RD',
    matchNumber: 1,
    homeTeam: null,
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    played: false,
  });

  // Final
  matches.push({
    id: 'F-1',
    stage: 'F',
    matchNumber: 1,
    homeTeam: null,
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    played: false,
  });

  return matches;
}

export const STAGES = {
  group: 'Group Stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-Finals',
  SF: 'Semi-Finals',
  '3RD': 'Third Place',
  F: 'Final',
};
