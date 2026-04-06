import { GROUPS } from "./teams";

export function generateGroupMatches() {
  const matches = [];

  const matchdays = [
    [0, 3],
    [1, 2],

    [3, 2],
    [0, 1],

    [2, 0],
    [3, 1],
  ];

  for (const [groupName, teams] of Object.entries(GROUPS)) {
    matchdays.forEach(([homeIdx, awayIdx], matchIdx) => {
      const matchday = Math.floor(matchIdx / 2) + 1;
      matches.push({
        id: `group-${groupName}-${matchIdx + 1}`,
        stage: "group",
        group: groupName,
        matchday,
        homeTeam: teams[homeIdx].code,
        awayTeam: teams[awayIdx].code,
        homeScore: null,
        awayScore: null,
        played: false,
      });
    });
  }
  return matches;
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

// Knockout stage naming for display
export const KNOCKOUT_ROUNDS = [
  { id: "R32", name: "שלב ה-32", matches: 16 },
  { id: "R16", name: "שמינית גמר", matches: 8 },
  { id: "QF", name: "רבע גמר", matches: 4 },
  { id: "SF", name: "חצי גמר", matches: 2 },
  { id: "3RD", name: "מקום שלישי", matches: 1 },
  { id: "F", name: "גמר", matches: 1 },
];
