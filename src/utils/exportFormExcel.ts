import { getCachedBracket, getCachedChampion } from './bracketCache';
import { groupMatches, knockoutMatches, STAGES } from '../data/matches';
import { GROUPS, getTeamByCode } from '../data/teams';
import { formatMatchDateShort, formatMatchClock, getUserTimeZone } from './userTime';
import { r32SlotLabel } from './matchSlot';

// XLSX RTL note: this version of xlsx applies rightToLeft at workbook level via
// wb.Workbook.Views[0].RTL. Since all content is Hebrew we set all sheets RTL.

export async function exportToExcel(form: any): Promise<void> {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();
  wb.Props = { Title: form.formName || 'ניחושים' };

  const matchPredictions = form.matches || {};
  // Match date/time columns render in the viewer's timezone, matching what
  // the same user sees on screen.
  const tz = getUserTimeZone();
  const bracketTeams = getCachedBracket(matchPredictions);
  const championCode = getCachedChampion(matchPredictions);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const submittedDate = form.submittedAt
    ? new Date(form.submittedAt).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'לא ידוע';

  const scoreStr = (home: any, away: any): string => {
    if (home == null || away == null) return '—';
    return `${home}:${away}`;
  };

  const outcome = (home: any, away: any): string => {
    if (home == null || away == null) return '?';
    const h = Number(home);
    const a = Number(away);
    if (h > a) return 'ניצחון בית';
    if (h < a) return 'ניצחון חוץ';
    return 'תיקו';
  };

  // ── SHEET 1: פרטי טופס ───────────────────────────────────────────────────

  const championName = championCode
    ? (getTeamByCode(championCode)?.name || championCode)
    : 'לא נקבע';

  const sheet1Data: any[][] = [
    ['פרטי טופס', ''],
    ['שם טופס', form.formName || ''],
    ['תאריך הגשה', submittedDate],
    ['מספר תקציב', form.budgetNumber || ''],
    ['אלופה', championName],
    ['מלך שערים', form.topScorer || 'לא הוכנס'],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [{ wch: 18 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'פרטי טופס');

  // ── SHEET 2: שלב הבתים ───────────────────────────────────────────────────

  const sheet2Header = [
    'בית',
    'מחזור',
    'תאריך',
    'שעה (ישראל)',
    'קבוצת בית',
    'שערי בית',
    'שערי חוץ',
    'קבוצת חוץ',
    'תוצאת המשחק',
  ];
  const sheet2Rows: any[][] = [sheet2Header];

  const groupKeys = Object.keys(GROUPS); // ['A','B',...,'L']
  for (const group of groupKeys) {
    // blank separator row between groups (except before the first)
    if (group !== groupKeys[0]) {
      sheet2Rows.push(['', '', '', '', '', '', '', '', '']);
    }
    const matches = groupMatches.filter((m: any) => m.group === group);
    for (const match of matches) {
      const pred = matchPredictions[match.id];
      const homeTeam = match.homeTeam ? getTeamByCode(match.homeTeam) : null;
      const awayTeam = match.awayTeam ? getTeamByCode(match.awayTeam) : null;
      const homeName = homeTeam?.name || match.homeTeam || '?';
      const awayName = awayTeam?.name || match.awayTeam || '?';
      sheet2Rows.push([
        `בית ${group}`,
        match.matchday ?? '',
        formatMatchDateShort(match, tz),
        formatMatchClock(match, tz),
        homeName,
        pred?.homeScore ?? '—',
        pred?.awayScore ?? '—',
        awayName,
        outcome(pred?.homeScore, pred?.awayScore),
      ]);
    }
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  ws2['!cols'] = [
    { wch: 8 },
    { wch: 7 },
    { wch: 10 },
    { wch: 12 },
    { wch: 20 },
    { wch: 7 },
    { wch: 7 },
    { wch: 20 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'שלב הבתים');

  // ── SHEET 3: שלב ההמשך (Knockout) ────────────────────────────────────────

  const KO_ORDER = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'] as const;
  const sheet3Header = [
    'שלב',
    'תאריך',
    'שעה',
    'קבוצה א׳',
    'שערי א׳',
    'שערי ב׳',
    'קבוצה ב׳',
    'עולה',
    'בעיטות הכרעה',
  ];
  const sheet3Rows: any[][] = [sheet3Header];

  let firstKoStage = true;
  for (const stage of KO_ORDER) {
    const stageMatches = knockoutMatches.filter((m: any) => m.stage === stage);
    if (stageMatches.length === 0) continue;

    // Stage separator row (skip before the very first stage)
    if (!firstKoStage) {
      sheet3Rows.push(['', '', '', '', '', '', '', '', '']);
    }
    firstKoStage = false;

    for (const match of stageMatches) {
      const pred = matchPredictions[match.id];
      const stageTeamEntry = bracketTeams?.[match.id];
      const homeCode = stageTeamEntry?.home || null;
      const awayCode = stageTeamEntry?.away || null;
      const homeName = homeCode
        ? (getTeamByCode(homeCode)?.name || homeCode)
        : (r32SlotLabel(match, 'home') || 'טרם נקבע');
      const awayName = awayCode
        ? (getTeamByCode(awayCode)?.name || awayCode)
        : (r32SlotLabel(match, 'away') || 'טרם נקבע');

      const isTie =
        pred?.homeScore != null &&
        pred?.awayScore != null &&
        Number(pred.homeScore) === Number(pred.awayScore) &&
        !!pred?.advancingTeam;

      const advancingName = pred?.advancingTeam
        ? (getTeamByCode(pred.advancingTeam)?.name || pred.advancingTeam)
        : pred?.homeScore != null && pred?.awayScore != null
          ? Number(pred.homeScore) > Number(pred.awayScore)
            ? homeName
            : Number(pred.awayScore) > Number(pred.homeScore)
              ? awayName
              : ''
          : '';

      sheet3Rows.push([
        STAGES[stage as keyof typeof STAGES] || stage,
        formatMatchDateShort(match, tz),
        formatMatchClock(match, tz),
        homeName,
        pred?.homeScore ?? '—',
        pred?.awayScore ?? '—',
        awayName,
        advancingName,
        isTie ? '✓' : '—',
      ]);
    }
  }

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Rows);
  ws3['!cols'] = [
    { wch: 16 },
    { wch: 10 },
    { wch: 8 },
    { wch: 20 },
    { wch: 7 },
    { wch: 7 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'שלב ההמשך');

  // ── SHEET 4: טבלאות הבתים (חיזוי) ────────────────────────────────────────

  const sheet4Rows: any[][] = [];

  for (const group of groupKeys) {
    if (sheet4Rows.length > 0) {
      sheet4Rows.push(['', '', '', '', '', '', '', '', '']);
    }
    sheet4Rows.push([`בית ${group}`, '', '', '', '', '', '', '', '']);
    sheet4Rows.push(['מקום', 'קבוצה', 'מ', 'נ', 'ת', 'ה', 'ז', 'ס', 'נקודות']);

    const matches = groupMatches.filter((m: any) => m.group === group);
    const teamObjects = GROUPS[group as keyof typeof GROUPS]; // {code, name, flag}[]
    const teamCodes = teamObjects.map((t: any) => t.code);

    // Simple standings from predictions
    const stats: Record<
      string,
      { w: number; d: number; l: number; gf: number; ga: number; pts: number }
    > = {};
    for (const code of teamCodes) {
      stats[code] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    }

    for (const match of matches) {
      const pred = matchPredictions[match.id];
      if (pred?.homeScore == null || pred?.awayScore == null) continue;
      const h = Number(pred.homeScore);
      const a = Number(pred.awayScore);
      if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
      const home = match.homeTeam;
      const away = match.awayTeam;
      if (!home || !away || !stats[home] || !stats[away]) continue;
      stats[home].gf += h;
      stats[home].ga += a;
      stats[away].gf += a;
      stats[away].ga += h;
      if (h > a) {
        stats[home].w++;
        stats[home].pts += 3;
        stats[away].l++;
      } else if (h < a) {
        stats[away].w++;
        stats[away].pts += 3;
        stats[home].l++;
      } else {
        stats[home].d++;
        stats[home].pts += 1;
        stats[away].d++;
        stats[away].pts += 1;
      }
    }

    const sorted = [...teamCodes].sort((a, b) => {
      const sa = stats[a];
      const sb = stats[b];
      if (sb.pts !== sa.pts) return sb.pts - sa.pts;
      const gdA = sa.gf - sa.ga;
      const gdB = sb.gf - sb.ga;
      if (gdB !== gdA) return gdB - gdA;
      if (sb.gf !== sa.gf) return sb.gf - sa.gf;
      return a < b ? -1 : 1;
    });

    sorted.forEach((code, i) => {
      const s = stats[code];
      const teamName = getTeamByCode(code)?.name || code;
      const qualifies = i < 2 ? '✓' : i === 2 ? '(ייתכן)' : '';
      sheet4Rows.push([
        `${i + 1}. ${qualifies}`,
        teamName,
        s.w + s.d + s.l,
        s.w,
        s.d,
        s.l,
        s.gf,
        s.ga,
        s.pts,
      ]);
    });
  }

  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Rows);
  ws4['!cols'] = [
    { wch: 10 },
    { wch: 22 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'טבלאות הבתים (חיזוי)');

  // ── SHEET 5: מפתח ניקוד ──────────────────────────────────────────────────

  const sheet5Data: any[][] = [
    ['שלב', 'תוצאה נכונה', 'תוצאה מדויקת', 'קידום'],
    ['שלב הבתים', 1, 3, 2],
    ['שלב ה-32', 3, 3, 4],
    ['שמינית הגמר', 5, 3, 6],
    ['רבע הגמר', 7, 3, 8],
    ['חצי הגמר', 9, 3, 10],
    ['מקום שלישי', 9, 3, '—'],
    ['גמר', 11, 3, '—'],
    ['', '', '', ''],
    ['בונוסים', 'נקודות', '', ''],
    ['אלופה נכונה', 9, '', ''],
    ['מלך שערים נכון', 8, '', ''],
    ['', '', '', ''],
    ['* "קידום" = ניחוש נכון מי עולה לשלב הבא', '', '', ''],
    [
      '* "תוצאה נכונה" = ניחוש נכון מי מנצח/תיקו (לפי תוצאת 90 דקות בבתים; לפי זוכה המשחק בנוקאאוט)',
      '',
      '',
      '',
    ],
  ];

  const ws5 = XLSX.utils.aoa_to_sheet(sheet5Data);
  ws5['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'מפתח ניקוד');

  // ── Workbook RTL & active tab ─────────────────────────────────────────────

  // RTL is applied at workbook level (all sheets) — all content is Hebrew
  wb.Workbook = {
    Views: [{ RTL: true }],
  };

  // Safari mangles non-ASCII a.download filenames — use ASCII fallback on WebKit.
  const isSafari =
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const fileName = isSafari
    ? `predictions-${form.formId || 'form'}.xlsx`
    : `ניחושים-${form.formId || 'form'}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
