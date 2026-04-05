// 2026 FIFA World Cup - 48 teams, 12 groups
// Official draw: December 5, 2025, Washington D.C.
// Tournament: June 11 - July 19, 2026
export const GROUPS = {
  A: [
    { code: 'MEX', name: 'מקסיקו', flag: '🇲🇽' },
    { code: 'RSA', name: 'דרום אפריקה', flag: '🇿🇦' },
    { code: 'KOR', name: 'דרום קוריאה', flag: '🇰🇷' },
    { code: 'CZE', name: 'צ\'כיה', flag: '🇨🇿' },
  ],
  B: [
    { code: 'CAN', name: 'קנדה', flag: '🇨🇦' },
    { code: 'BIH', name: 'בוסניה', flag: '🇧🇦' },
    { code: 'QAT', name: 'קטאר', flag: '🇶🇦' },
    { code: 'SUI', name: 'שוויץ', flag: '🇨🇭' },
  ],
  C: [
    { code: 'BRA', name: 'ברזיל', flag: '🇧🇷' },
    { code: 'MAR', name: 'מרוקו', flag: '🇲🇦' },
    { code: 'HAI', name: 'האיטי', flag: '🇭🇹' },
    { code: 'SCO', name: 'סקוטלנד', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  ],
  D: [
    { code: 'USA', name: 'ארה״ב', flag: '🇺🇸' },
    { code: 'PAR', name: 'פרגוואי', flag: '🇵🇾' },
    { code: 'AUS', name: 'אוסטרליה', flag: '🇦🇺' },
    { code: 'TUR', name: 'טורקיה', flag: '🇹🇷' },
  ],
  E: [
    { code: 'GER', name: 'גרמניה', flag: '🇩🇪' },
    { code: 'ECU', name: 'אקוודור', flag: '🇪🇨' },
    { code: 'CIV', name: 'חוף השנהב', flag: '🇨🇮' },
    { code: 'CUR', name: 'קוראסאו', flag: '🇨🇼' },
  ],
  F: [
    { code: 'NED', name: 'הולנד', flag: '🇳🇱' },
    { code: 'JPN', name: 'יפן', flag: '🇯🇵' },
    { code: 'SWE', name: 'שבדיה', flag: '🇸🇪' },
    { code: 'TUN', name: 'תוניסיה', flag: '🇹🇳' },
  ],
  G: [
    { code: 'BEL', name: 'בלגיה', flag: '🇧🇪' },
    { code: 'EGY', name: 'מצרים', flag: '🇪🇬' },
    { code: 'IRN', name: 'איראן', flag: '🇮🇷' },
    { code: 'NZL', name: 'ניו זילנד', flag: '🇳🇿' },
  ],
  H: [
    { code: 'ESP', name: 'ספרד', flag: '🇪🇸' },
    { code: 'CPV', name: 'כף ורדה', flag: '🇨🇻' },
    { code: 'KSA', name: 'ערב הסעודית', flag: '🇸🇦' },
    { code: 'URU', name: 'אורוגוואי', flag: '🇺🇾' },
  ],
  I: [
    { code: 'FRA', name: 'צרפת', flag: '🇫🇷' },
    { code: 'SEN', name: 'סנגל', flag: '🇸🇳' },
    { code: 'IRQ', name: 'עיראק', flag: '🇮🇶' },
    { code: 'NOR', name: 'נורבגיה', flag: '🇳🇴' },
  ],
  J: [
    { code: 'ARG', name: 'ארגנטינה', flag: '🇦🇷' },
    { code: 'ALG', name: 'אלג\'יריה', flag: '🇩🇿' },
    { code: 'AUT', name: 'אוסטריה', flag: '🇦🇹' },
    { code: 'JOR', name: 'ירדן', flag: '🇯🇴' },
  ],
  K: [
    { code: 'POR', name: 'פורטוגל', flag: '🇵🇹' },
    { code: 'COD', name: 'קונגו', flag: '🇨🇩' },
    { code: 'UZB', name: 'אוזבקיסטן', flag: '🇺🇿' },
    { code: 'COL', name: 'קולומביה', flag: '🇨🇴' },
  ],
  L: [
    { code: 'ENG', name: 'אנגליה', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { code: 'CRO', name: 'קרואטיה', flag: '🇭🇷' },
    { code: 'GHA', name: 'גאנה', flag: '🇬🇭' },
    { code: 'PAN', name: 'פנמה', flag: '🇵🇦' },
  ],
};

// Flatten all teams for lookup
export const ALL_TEAMS = Object.entries(GROUPS).flatMap(([group, teams]) =>
  teams.map(t => ({ ...t, group }))
);

export const getTeamByCode = (code) => ALL_TEAMS.find(t => t.code === code);

export const getTeamDisplay = (code) => {
  const team = getTeamByCode(code);
  return team ? `${team.flag} ${team.name}` : 'טרם נקבע';
};
