import { GROUPS } from "./teams";

// FIFA official match schedule (from WCup_2026_4.2.3_en.xlsx)
// Times are local host-city times
// Venue mapping by FIFA match number (verified against Excel source)
export const MATCH_VENUES = {
  1: "Mexico City", 2: "Guadalajara", 3: "Toronto", 4: "Los Angeles",
  5: "Boston", 6: "Vancouver", 7: "New York/New Jersey", 8: "San Francisco Bay Area",
  9: "Philadelphia", 10: "Houston", 11: "Dallas", 12: "Monterrey",
  13: "Miami", 14: "Atlanta", 15: "Los Angeles", 16: "Seattle",
  17: "New York/New Jersey", 18: "Boston", 19: "Kansas City", 20: "San Francisco Bay Area",
  21: "Toronto", 22: "Dallas", 23: "Houston", 24: "Mexico City",
  25: "Atlanta", 26: "Los Angeles", 27: "Vancouver", 28: "Guadalajara",
  29: "Philadelphia", 30: "Boston", 31: "San Francisco Bay Area", 32: "Seattle",
  33: "Toronto", 34: "Kansas City", 35: "Houston", 36: "Monterrey",
  37: "Miami", 38: "Atlanta", 39: "Los Angeles", 40: "Vancouver",
  41: "New York/New Jersey", 42: "Philadelphia", 43: "Dallas", 44: "San Francisco Bay Area",
  45: "Boston", 46: "Toronto", 47: "Houston", 48: "Guadalajara",
  49: "Miami", 50: "Atlanta", 51: "Vancouver", 52: "Seattle",
  53: "Mexico City", 54: "Monterrey", 55: "Philadelphia", 56: "New York/New Jersey",
  57: "Dallas", 58: "Kansas City", 59: "Los Angeles", 60: "San Francisco Bay Area",
  61: "Boston", 62: "Toronto", 63: "Seattle", 64: "Vancouver",
  65: "Houston", 66: "Guadalajara", 67: "New York/New Jersey", 68: "Philadelphia",
  69: "Kansas City", 70: "Dallas", 71: "Miami", 72: "Atlanta",
  73: "Los Angeles", 74: "Boston", 75: "Monterrey", 76: "Houston",
  77: "New York/New Jersey", 78: "Dallas", 79: "Mexico City", 80: "Atlanta",
  81: "San Francisco Bay Area", 82: "Seattle", 83: "Toronto", 84: "Los Angeles",
  85: "Vancouver", 86: "Miami", 87: "Kansas City", 88: "Dallas",
  89: "Philadelphia", 90: "Houston", 91: "New York/New Jersey", 92: "Mexico City",
  93: "Dallas", 94: "Seattle", 95: "Atlanta", 96: "Vancouver",
  97: "Boston", 98: "Los Angeles", 99: "Miami", 100: "Kansas City",
  101: "Dallas", 102: "Atlanta", 103: "Miami", 104: "New York/New Jersey",
};

// Knockout match times (local host-city, from Excel)
const KNOCKOUT_TIMES = {
  73: "15:00", 74: "16:30", 75: "21:00", 76: "13:00",
  77: "17:00", 78: "13:00", 79: "21:00", 80: "12:00",
  81: "20:00", 82: "16:00", 83: "19:00", 84: "15:00",
  85: "23:00", 86: "18:00", 87: "21:30", 88: "14:00",
  89: "17:00", 90: "13:00", 91: "16:00", 92: "20:00",
  93: "15:00", 94: "20:00", 95: "12:00", 96: "16:00",
  97: "16:00", 98: "15:00", 99: "17:00", 100: "21:00",
  101: "15:00", 102: "15:00", 103: "17:00", 104: "15:00",
};

// Position format: X1=seed1, X2=seed2, X3=seed3, X4=seed4 in each group
const GROUP_MATCH_SCHEDULE = [
  { fifaMatch: 1, group: "A", home: 1, away: 2, matchday: 1, date: "Jun 11", time: "15:00" },
  { fifaMatch: 2, group: "A", home: 3, away: 4, matchday: 1, date: "Jun 11", time: "22:00" },
  { fifaMatch: 3, group: "B", home: 1, away: 2, matchday: 1, date: "Jun 12", time: "15:00" },
  { fifaMatch: 4, group: "D", home: 1, away: 2, matchday: 1, date: "Jun 12", time: "21:00" },
  { fifaMatch: 5, group: "C", home: 3, away: 4, matchday: 1, date: "Jun 13", time: "21:00" },
  { fifaMatch: 6, group: "D", home: 3, away: 4, matchday: 1, date: "Jun 14", time: "00:00" },
  { fifaMatch: 7, group: "C", home: 1, away: 2, matchday: 1, date: "Jun 13", time: "18:00" },
  { fifaMatch: 8, group: "B", home: 3, away: 4, matchday: 1, date: "Jun 13", time: "15:00" },
  { fifaMatch: 9, group: "E", home: 3, away: 4, matchday: 1, date: "Jun 14", time: "19:00" },
  { fifaMatch: 10, group: "E", home: 1, away: 2, matchday: 1, date: "Jun 14", time: "13:00" },
  { fifaMatch: 11, group: "F", home: 1, away: 2, matchday: 1, date: "Jun 14", time: "16:00" },
  { fifaMatch: 12, group: "F", home: 3, away: 4, matchday: 1, date: "Jun 14", time: "22:00" },
  { fifaMatch: 13, group: "H", home: 3, away: 4, matchday: 1, date: "Jun 15", time: "18:00" },
  { fifaMatch: 14, group: "H", home: 1, away: 2, matchday: 1, date: "Jun 15", time: "12:00" },
  { fifaMatch: 15, group: "G", home: 3, away: 4, matchday: 1, date: "Jun 15", time: "21:00" },
  { fifaMatch: 16, group: "G", home: 1, away: 2, matchday: 1, date: "Jun 15", time: "15:00" },
  { fifaMatch: 17, group: "I", home: 1, away: 2, matchday: 1, date: "Jun 16", time: "15:00" },
  { fifaMatch: 18, group: "I", home: 3, away: 4, matchday: 1, date: "Jun 16", time: "18:00" },
  { fifaMatch: 19, group: "J", home: 1, away: 2, matchday: 1, date: "Jun 16", time: "21:00" },
  { fifaMatch: 20, group: "J", home: 3, away: 4, matchday: 1, date: "Jun 17", time: "00:00" },
  { fifaMatch: 21, group: "L", home: 3, away: 4, matchday: 1, date: "Jun 17", time: "19:00" },
  { fifaMatch: 22, group: "L", home: 1, away: 2, matchday: 1, date: "Jun 17", time: "16:00" },
  { fifaMatch: 23, group: "K", home: 1, away: 2, matchday: 1, date: "Jun 17", time: "13:00" },
  { fifaMatch: 24, group: "K", home: 3, away: 4, matchday: 1, date: "Jun 17", time: "22:00" },
  { fifaMatch: 25, group: "A", home: 4, away: 2, matchday: 2, date: "Jun 18", time: "12:00" },
  { fifaMatch: 26, group: "B", home: 4, away: 2, matchday: 2, date: "Jun 18", time: "15:00" },
  { fifaMatch: 27, group: "B", home: 1, away: 3, matchday: 2, date: "Jun 18", time: "18:00" },
  { fifaMatch: 28, group: "A", home: 1, away: 3, matchday: 2, date: "Jun 18", time: "21:00" },
  { fifaMatch: 29, group: "C", home: 1, away: 3, matchday: 2, date: "Jun 19", time: "21:00" },
  { fifaMatch: 30, group: "C", home: 4, away: 2, matchday: 2, date: "Jun 19", time: "18:00" },
  { fifaMatch: 31, group: "D", home: 4, away: 2, matchday: 2, date: "Jun 20", time: "00:00" },
  { fifaMatch: 32, group: "D", home: 1, away: 3, matchday: 2, date: "Jun 19", time: "15:00" },
  { fifaMatch: 33, group: "E", home: 1, away: 3, matchday: 2, date: "Jun 20", time: "16:00" },
  { fifaMatch: 34, group: "E", home: 4, away: 2, matchday: 2, date: "Jun 20", time: "20:00" },
  { fifaMatch: 35, group: "F", home: 1, away: 3, matchday: 2, date: "Jun 20", time: "13:00" },
  { fifaMatch: 36, group: "F", home: 4, away: 2, matchday: 2, date: "Jun 21", time: "00:00" },
  { fifaMatch: 37, group: "H", home: 4, away: 2, matchday: 2, date: "Jun 21", time: "18:00" },
  { fifaMatch: 38, group: "H", home: 1, away: 3, matchday: 2, date: "Jun 21", time: "12:00" },
  { fifaMatch: 39, group: "G", home: 1, away: 3, matchday: 2, date: "Jun 21", time: "15:00" },
  { fifaMatch: 40, group: "G", home: 4, away: 2, matchday: 2, date: "Jun 21", time: "21:00" },
  { fifaMatch: 41, group: "I", home: 4, away: 2, matchday: 2, date: "Jun 22", time: "20:00" },
  { fifaMatch: 42, group: "I", home: 1, away: 3, matchday: 2, date: "Jun 22", time: "17:00" },
  { fifaMatch: 43, group: "J", home: 1, away: 3, matchday: 2, date: "Jun 22", time: "13:00" },
  { fifaMatch: 44, group: "J", home: 4, away: 2, matchday: 2, date: "Jun 22", time: "23:00" },
  { fifaMatch: 45, group: "L", home: 1, away: 3, matchday: 2, date: "Jun 23", time: "16:00" },
  { fifaMatch: 46, group: "L", home: 4, away: 2, matchday: 2, date: "Jun 23", time: "19:00" },
  { fifaMatch: 47, group: "K", home: 1, away: 3, matchday: 2, date: "Jun 23", time: "13:00" },
  { fifaMatch: 48, group: "K", home: 4, away: 2, matchday: 2, date: "Jun 23", time: "22:00" },
  { fifaMatch: 49, group: "C", home: 4, away: 1, matchday: 3, date: "Jun 24", time: "18:00" },
  { fifaMatch: 50, group: "C", home: 2, away: 3, matchday: 3, date: "Jun 24", time: "18:00" },
  { fifaMatch: 51, group: "B", home: 4, away: 1, matchday: 3, date: "Jun 24", time: "15:00" },
  { fifaMatch: 52, group: "B", home: 2, away: 3, matchday: 3, date: "Jun 24", time: "15:00" },
  { fifaMatch: 53, group: "A", home: 4, away: 1, matchday: 3, date: "Jun 24", time: "21:00" },
  { fifaMatch: 54, group: "A", home: 2, away: 3, matchday: 3, date: "Jun 24", time: "21:00" },
  { fifaMatch: 55, group: "E", home: 2, away: 3, matchday: 3, date: "Jun 25", time: "16:00" },
  { fifaMatch: 56, group: "E", home: 4, away: 1, matchday: 3, date: "Jun 25", time: "16:00" },
  { fifaMatch: 57, group: "F", home: 2, away: 3, matchday: 3, date: "Jun 25", time: "19:00" },
  { fifaMatch: 58, group: "F", home: 4, away: 1, matchday: 3, date: "Jun 25", time: "19:00" },
  { fifaMatch: 59, group: "D", home: 4, away: 1, matchday: 3, date: "Jun 25", time: "22:00" },
  { fifaMatch: 60, group: "D", home: 2, away: 3, matchday: 3, date: "Jun 25", time: "22:00" },
  { fifaMatch: 61, group: "I", home: 4, away: 1, matchday: 3, date: "Jun 26", time: "15:00" },
  { fifaMatch: 62, group: "I", home: 2, away: 3, matchday: 3, date: "Jun 26", time: "15:00" },
  { fifaMatch: 63, group: "G", home: 2, away: 3, matchday: 3, date: "Jun 26", time: "23:00" },
  { fifaMatch: 64, group: "G", home: 4, away: 1, matchday: 3, date: "Jun 26", time: "23:00" },
  { fifaMatch: 65, group: "H", home: 2, away: 3, matchday: 3, date: "Jun 26", time: "20:00" },
  { fifaMatch: 66, group: "H", home: 4, away: 1, matchday: 3, date: "Jun 26", time: "20:00" },
  { fifaMatch: 67, group: "L", home: 4, away: 1, matchday: 3, date: "Jun 27", time: "17:00" },
  { fifaMatch: 68, group: "L", home: 2, away: 3, matchday: 3, date: "Jun 27", time: "17:00" },
  { fifaMatch: 69, group: "J", home: 2, away: 3, matchday: 3, date: "Jun 27", time: "22:00" },
  { fifaMatch: 70, group: "J", home: 4, away: 1, matchday: 3, date: "Jun 27", time: "22:00" },
  { fifaMatch: 71, group: "K", home: 4, away: 1, matchday: 3, date: "Jun 27", time: "19:30" },
  { fifaMatch: 72, group: "K", home: 2, away: 3, matchday: 3, date: "Jun 27", time: "19:30" },
];

export function generateGroupMatches() {
  return GROUP_MATCH_SCHEDULE.map((m) => {
    const teams = GROUPS[m.group];
    // Build a stable match ID per group (1-6 within each group)
    const groupMatchIndex = GROUP_MATCH_SCHEDULE
      .filter((s) => s.group === m.group)
      .findIndex((s) => s.fifaMatch === m.fifaMatch) + 1;
    return {
      id: `group-${m.group}-${groupMatchIndex}`,
      stage: "group",
      group: m.group,
      matchday: m.matchday,
      fifaMatch: m.fifaMatch,
      date: m.date,
      time: m.time,
      venue: MATCH_VENUES[m.fifaMatch] || null,
      homeTeam: teams[m.home - 1].code,
      awayTeam: teams[m.away - 1].code,
      homeScore: null,
      awayScore: null,
      played: false,
    };
  });
}

// ========== KNOCKOUT BRACKET ==========
// Based on official FIFA 2026 bracket
// Source: https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/knockout-stage-match-schedule-bracket

// Round of 32: 16 matches
// 8 fixed matches (runner-up vs runner-up or winner vs runner-up)
// 8 matches where a group winner plays a qualifying 3rd-place team
// (3rd-place opponent depends on which 8 of 12 third-placed teams qualify - 495 scenarios)
export const R32_MATCHES = [
  // === LEFT SIDE OF BRACKET ===
  {
    id: "R32-1",
    fifaMatch: 73,
    home: "2A",
    away: "2B",
    label: "2A vs 2B",
    date: "Jun 28",
  },
  {
    id: "R32-2",
    fifaMatch: 74,
    home: "1E",
    away: "3rd",
    label: "1E vs 3rd place",
    date: "Jun 28",
    thirdFrom: "A/B/C/D/F",
  },
  {
    id: "R32-3",
    fifaMatch: 75,
    home: "1F",
    away: "2C",
    label: "1F vs 2C",
    date: "Jun 29",
  },
  {
    id: "R32-4",
    fifaMatch: 76,
    home: "1C",
    away: "2F",
    label: "1C vs 2F",
    date: "Jun 29",
  },
  {
    id: "R32-5",
    fifaMatch: 77,
    home: "1I",
    away: "3rd",
    label: "1I vs 3rd place",
    date: "Jun 30",
    thirdFrom: "C/D/F/G/H",
  },
  {
    id: "R32-6",
    fifaMatch: 78,
    home: "2E",
    away: "2I",
    label: "2E vs 2I",
    date: "Jun 30",
  },
  {
    id: "R32-7",
    fifaMatch: 79,
    home: "1A",
    away: "3rd",
    label: "1A vs 3rd place",
    date: "Jun 30",
    thirdFrom: "C/E/F/H/I",
  },
  {
    id: "R32-8",
    fifaMatch: 80,
    home: "1L",
    away: "3rd",
    label: "1L vs 3rd place",
    date: "Jul 1",
    thirdFrom: "E/H/I/J/K",
  },

  // === RIGHT SIDE OF BRACKET ===
  {
    id: "R32-9",
    fifaMatch: 81,
    home: "1D",
    away: "3rd",
    label: "1D vs 3rd place",
    date: "Jul 1",
    thirdFrom: "B/E/F/I/J",
  },
  {
    id: "R32-10",
    fifaMatch: 82,
    home: "1G",
    away: "3rd",
    label: "1G vs 3rd place",
    date: "Jul 1",
    thirdFrom: "A/E/H/I/J",
  },
  {
    id: "R32-11",
    fifaMatch: 83,
    home: "2K",
    away: "2L",
    label: "2K vs 2L",
    date: "Jul 1",
  },
  {
    id: "R32-12",
    fifaMatch: 84,
    home: "1H",
    away: "2J",
    label: "1H vs 2J",
    date: "Jul 1",
  },
  {
    id: "R32-13",
    fifaMatch: 85,
    home: "1B",
    away: "3rd",
    label: "1B vs 3rd place",
    date: "Jul 2",
    thirdFrom: "E/F/G/I/J",
  },
  {
    id: "R32-14",
    fifaMatch: 86,
    home: "1J",
    away: "2H",
    label: "1J vs 2H",
    date: "Jul 2",
  },
  {
    id: "R32-15",
    fifaMatch: 87,
    home: "1K",
    away: "3rd",
    label: "1K vs 3rd place",
    date: "Jul 3",
    thirdFrom: "D/E/I/J/L",
  },
  {
    id: "R32-16",
    fifaMatch: 88,
    home: "2D",
    away: "2G",
    label: "2D vs 2G",
    date: "Jul 3",
  },
];

// Round of 16: winners of R32 pairs
export const R16_MATCHES = [
  // LEFT SIDE
  {
    id: "R16-1",
    fifaMatch: 89,
    homeFrom: "R32-2",
    awayFrom: "R32-5",
    label: "W74 vs W77",
    date: "Jul 4",
  },
  {
    id: "R16-2",
    fifaMatch: 90,
    homeFrom: "R32-1",
    awayFrom: "R32-3",
    label: "W73 vs W75",
    date: "Jul 4",
  },
  {
    id: "R16-3",
    fifaMatch: 91,
    homeFrom: "R32-4",
    awayFrom: "R32-6",
    label: "W76 vs W78",
    date: "Jul 5",
  },
  {
    id: "R16-4",
    fifaMatch: 92,
    homeFrom: "R32-7",
    awayFrom: "R32-8",
    label: "W79 vs W80",
    date: "Jul 5",
  },
  // RIGHT SIDE
  {
    id: "R16-5",
    fifaMatch: 93,
    homeFrom: "R32-11",
    awayFrom: "R32-12",
    label: "W83 vs W84",
    date: "Jul 6",
  },
  {
    id: "R16-6",
    fifaMatch: 94,
    homeFrom: "R32-9",
    awayFrom: "R32-10",
    label: "W81 vs W82",
    date: "Jul 6",
  },
  {
    id: "R16-7",
    fifaMatch: 95,
    homeFrom: "R32-14",
    awayFrom: "R32-16",
    label: "W86 vs W88",
    date: "Jul 7",
  },
  {
    id: "R16-8",
    fifaMatch: 96,
    homeFrom: "R32-13",
    awayFrom: "R32-15",
    label: "W85 vs W87",
    date: "Jul 7",
  },
];

// Quarter-finals
export const QF_MATCHES = [
  // LEFT SIDE
  {
    id: "QF-1",
    fifaMatch: 97,
    homeFrom: "R16-1",
    awayFrom: "R16-2",
    label: "W89 vs W90",
    date: "Jul 9",
  },
  {
    id: "QF-2",
    fifaMatch: 99,
    homeFrom: "R16-3",
    awayFrom: "R16-4",
    label: "W91 vs W92",
    date: "Jul 10",
  },
  // RIGHT SIDE
  {
    id: "QF-3",
    fifaMatch: 98,
    homeFrom: "R16-5",
    awayFrom: "R16-6",
    label: "W93 vs W94",
    date: "Jul 10",
  },
  {
    id: "QF-4",
    fifaMatch: 100,
    homeFrom: "R16-7",
    awayFrom: "R16-8",
    label: "W95 vs W96",
    date: "Jul 11",
  },
];

// Semi-finals
export const SF_MATCHES = [
  {
    id: "SF-1",
    fifaMatch: 101,
    homeFrom: "QF-1",
    awayFrom: "QF-3",
    label: "W97 vs W98",
    date: "Jul 14",
  },
  {
    id: "SF-2",
    fifaMatch: 102,
    homeFrom: "QF-2",
    awayFrom: "QF-4",
    label: "W99 vs W100",
    date: "Jul 15",
  },
];

// 3rd place & Final
export const FINAL_MATCHES = [
  {
    id: "3RD-1",
    fifaMatch: 103,
    homeFrom: "SF-1 loser",
    awayFrom: "SF-2 loser",
    label: "3rd Place Match",
    date: "Jul 18",
  },
  {
    id: "F-1",
    fifaMatch: 104,
    homeFrom: "SF-1",
    awayFrom: "SF-2",
    label: "Final",
    date: "Jul 19",
  },
];

// Generate all knockout match objects
export function generateKnockoutMatches() {
  const allTemplates = [
    ...R32_MATCHES.map((m) => ({ ...m, stage: "R32" })),
    ...R16_MATCHES.map((m) => ({ ...m, stage: "R16" })),
    ...QF_MATCHES.map((m) => ({ ...m, stage: "QF" })),
    ...SF_MATCHES.map((m) => ({ ...m, stage: "SF" })),
    ...FINAL_MATCHES.map((m) => ({
      ...m,
      stage: m.id.startsWith("3RD") ? "3RD" : "F",
    })),
  ];

  return allTemplates.map((template, index) => ({
    id: template.id,
    stage: template.stage,
    matchNumber: index + 1,
    fifaMatch: template.fifaMatch,
    label: template.label,
    date: template.date,
    time: KNOCKOUT_TIMES[template.fifaMatch] || null,
    venue: MATCH_VENUES[template.fifaMatch] || null,
    home: template.home || null,
    away: template.away || null,
    homeFrom: template.homeFrom || null,
    awayFrom: template.awayFrom || null,
    thirdFrom: template.thirdFrom || null,
    homeTeam: null, // filled in by admin as tournament progresses
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    played: false,
  }));
}

export const groupMatches = generateGroupMatches();
export const knockoutMatches = generateKnockoutMatches();

export const ALL_MATCHES = [...groupMatches, ...knockoutMatches];
export const TOTAL_MATCH_COUNT = ALL_MATCHES.length;

export const STAGES = {
  group: "שלב הבתים",
  R32: "שלב ה-32",
  R16: "שמינית גמר",
  QF: "רבע גמר",
  SF: "חצי גמר",
  "3RD": "מקום שלישי",
  F: "גמר",
};
