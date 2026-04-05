// 2026 FIFA World Cup - 48 teams, 12 groups
// Groups based on the December 2025 draw
export const GROUPS = {
  A: [
    { code: 'MAR', name: 'Morocco', flag: '🇲🇦' },
    { code: 'COL', name: 'Colombia', flag: '🇨🇴' },
    { code: 'SEN', name: 'Senegal', flag: '🇸🇳' },
    { code: 'CAN', name: 'Canada', flag: '🇨🇦' },
  ],
  B: [
    { code: 'MEX', name: 'Mexico', flag: '🇲🇽' },
    { code: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { code: 'NGA', name: 'Nigeria', flag: '🇳🇬' },
    { code: 'GRE', name: 'Greece', flag: '🇬🇷' },
  ],
  C: [
    { code: 'USA', name: 'United States', flag: '🇺🇸' },
    { code: 'URU', name: 'Uruguay', flag: '🇺🇾' },
    { code: 'PAN', name: 'Panama', flag: '🇵🇦' },
    { code: 'BIH', name: 'Bosnia & Herzegovina', flag: '🇧🇦' },
  ],
  D: [
    { code: 'BRA', name: 'Brazil', flag: '🇧🇷' },
    { code: 'ITA', name: 'Italy', flag: '🇮🇹' },
    { code: 'ALB', name: 'Albania', flag: '🇦🇱' },
    { code: 'ECU', name: 'Ecuador', flag: '🇪🇨' },
  ],
  E: [
    { code: 'ARG', name: 'Argentina', flag: '🇦🇷' },
    { code: 'AUS', name: 'Australia', flag: '🇦🇺' },
    { code: 'PER', name: 'Peru', flag: '🇵🇪' },
    { code: 'DEN', name: 'Denmark', flag: '🇩🇰' },
  ],
  F: [
    { code: 'FRA', name: 'France', flag: '🇫🇷' },
    { code: 'TUN', name: 'Tunisia', flag: '🇹🇳' },
    { code: 'CRC', name: 'Costa Rica', flag: '🇨🇷' },
    { code: 'IDN', name: 'Indonesia', flag: '🇮🇩' },
  ],
  G: [
    { code: 'ESP', name: 'Spain', flag: '🇪🇸' },
    { code: 'TUR', name: 'Turkey', flag: '🇹🇷' },
    { code: 'CHN', name: 'China', flag: '🇨🇳' },
    { code: 'BOL', name: 'Bolivia', flag: '🇧🇴' },
  ],
  H: [
    { code: 'POR', name: 'Portugal', flag: '🇵🇹' },
    { code: 'NOR', name: 'Norway', flag: '🇳🇴' },
    { code: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: 'NZL', name: 'New Zealand', flag: '🇳🇿' },
  ],
  I: [
    { code: 'GER', name: 'Germany', flag: '🇩🇪' },
    { code: 'SUI', name: 'Switzerland', flag: '🇨🇭' },
    { code: 'CIV', name: "Côte d'Ivoire", flag: '🇨🇮' },
    { code: 'CMR', name: 'Cameroon', flag: '🇨🇲' },
  ],
  J: [
    { code: 'NED', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'JPN', name: 'Japan', flag: '🇯🇵' },
    { code: 'IRN', name: 'Iran', flag: '🇮🇷' },
    { code: 'PAR', name: 'Paraguay', flag: '🇵🇾' },
  ],
  K: [
    { code: 'CRO', name: 'Croatia', flag: '🇭🇷' },
    { code: 'BEL', name: 'Belgium', flag: '🇧🇪' },
    { code: 'SCO', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    { code: 'KOR', name: 'South Korea', flag: '🇰🇷' },
  ],
  L: [
    { code: 'SRB', name: 'Serbia', flag: '🇷🇸' },
    { code: 'CHI', name: 'Chile', flag: '🇨🇱' },
    { code: 'WAL', name: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
    { code: 'JPN2', name: 'Playoff Winner', flag: '🏳️' },
  ],
};

// Flatten all teams for lookup
export const ALL_TEAMS = Object.entries(GROUPS).flatMap(([group, teams]) =>
  teams.map(t => ({ ...t, group }))
);

export const getTeamByCode = (code) => ALL_TEAMS.find(t => t.code === code);

export const getTeamDisplay = (code) => {
  const team = getTeamByCode(code);
  return team ? `${team.flag} ${team.name}` : code || 'TBD';
};
