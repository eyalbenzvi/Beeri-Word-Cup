// 2026 FIFA World Cup - 48 teams, 12 groups
// Official draw: December 5, 2025, Washington D.C.
// Tournament: June 11 - July 19, 2026
export const GROUPS = {
  A: [
    { code: 'MEX', name: 'Mexico', flag: '🇲🇽' },
    { code: 'RSA', name: 'South Africa', flag: '🇿🇦' },
    { code: 'KOR', name: 'South Korea', flag: '🇰🇷' },
    { code: 'CZE', name: 'Czechia', flag: '🇨🇿' },
  ],
  B: [
    { code: 'CAN', name: 'Canada', flag: '🇨🇦' },
    { code: 'BIH', name: 'Bosnia & Herzegovina', flag: '🇧🇦' },
    { code: 'QAT', name: 'Qatar', flag: '🇶🇦' },
    { code: 'SUI', name: 'Switzerland', flag: '🇨🇭' },
  ],
  C: [
    { code: 'BRA', name: 'Brazil', flag: '🇧🇷' },
    { code: 'MAR', name: 'Morocco', flag: '🇲🇦' },
    { code: 'HAI', name: 'Haiti', flag: '🇭🇹' },
    { code: 'SCO', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  ],
  D: [
    { code: 'USA', name: 'United States', flag: '🇺🇸' },
    { code: 'PAR', name: 'Paraguay', flag: '🇵🇾' },
    { code: 'AUS', name: 'Australia', flag: '🇦🇺' },
    { code: 'TUR', name: 'Türkiye', flag: '🇹🇷' },
  ],
  E: [
    { code: 'GER', name: 'Germany', flag: '🇩🇪' },
    { code: 'ECU', name: 'Ecuador', flag: '🇪🇨' },
    { code: 'CIV', name: "Côte d'Ivoire", flag: '🇨🇮' },
    { code: 'CUR', name: 'Curaçao', flag: '🇨🇼' },
  ],
  F: [
    { code: 'NED', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'JPN', name: 'Japan', flag: '🇯🇵' },
    { code: 'SWE', name: 'Sweden', flag: '🇸🇪' },
    { code: 'TUN', name: 'Tunisia', flag: '🇹🇳' },
  ],
  G: [
    { code: 'BEL', name: 'Belgium', flag: '🇧🇪' },
    { code: 'EGY', name: 'Egypt', flag: '🇪🇬' },
    { code: 'IRN', name: 'Iran', flag: '🇮🇷' },
    { code: 'NZL', name: 'New Zealand', flag: '🇳🇿' },
  ],
  H: [
    { code: 'ESP', name: 'Spain', flag: '🇪🇸' },
    { code: 'CPV', name: 'Cape Verde', flag: '🇨🇻' },
    { code: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: 'URU', name: 'Uruguay', flag: '🇺🇾' },
  ],
  I: [
    { code: 'FRA', name: 'France', flag: '🇫🇷' },
    { code: 'SEN', name: 'Senegal', flag: '🇸🇳' },
    { code: 'IRQ', name: 'Iraq', flag: '🇮🇶' },
    { code: 'NOR', name: 'Norway', flag: '🇳🇴' },
  ],
  J: [
    { code: 'ARG', name: 'Argentina', flag: '🇦🇷' },
    { code: 'ALG', name: 'Algeria', flag: '🇩🇿' },
    { code: 'AUT', name: 'Austria', flag: '🇦🇹' },
    { code: 'JOR', name: 'Jordan', flag: '🇯🇴' },
  ],
  K: [
    { code: 'POR', name: 'Portugal', flag: '🇵🇹' },
    { code: 'COD', name: 'DR Congo', flag: '🇨🇩' },
    { code: 'UZB', name: 'Uzbekistan', flag: '🇺🇿' },
    { code: 'COL', name: 'Colombia', flag: '🇨🇴' },
  ],
  L: [
    { code: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { code: 'CRO', name: 'Croatia', flag: '🇭🇷' },
    { code: 'GHA', name: 'Ghana', flag: '🇬🇭' },
    { code: 'PAN', name: 'Panama', flag: '🇵🇦' },
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
