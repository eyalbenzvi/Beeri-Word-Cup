import { getCachedBracket, getCachedChampion } from './bracketCache';
import { groupMatches, knockoutMatches, STAGES } from '../data/matches';
import { GROUPS, getTeamByCode } from '../data/teams';

const MONTH_NUM: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
};

function formatDate(d: string): string {
  const parts = d.split(' ');
  return parts.length === 2
    ? `${parts[1].padStart(2,'0')}/${MONTH_NUM[parts[0]] ?? '??'}`
    : d;
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildPrintHtml(form: any, userName?: string): string {
  const matchPredictions = form.matches || {};
  const bracketTeams = getCachedBracket(matchPredictions);
  const championCode = getCachedChampion(matchPredictions);
  const formName = esc((form.formName || 'ניחושים').slice(0, 50));
  const championName = esc(championCode ? (getTeamByCode(championCode)?.name || '?') : 'לא נקבע');

  let groupsHtml = '';
  for (const group of Object.keys(GROUPS)) {
    const matches = groupMatches.filter((m: any) => m.group === group);
    groupsHtml += `<div class="group-header">בית ${group}</div><table>`;
    let lastMatchday = 0;
    for (const match of matches) {
      if (match.matchday !== lastMatchday) {
        groupsHtml += `<tr class="matchday-row"><td colspan="5">מחזור ${match.matchday}</td></tr>`;
        lastMatchday = match.matchday;
      }
      const pred = matchPredictions[match.id];
      const home = esc(getTeamByCode(match.homeTeam)?.name || match.homeTeam || '?');
      const away = esc(getTeamByCode(match.awayTeam)?.name || match.awayTeam || '?');
      const score = pred?.homeScore != null && pred?.awayScore != null
        ? `${pred.homeScore}:${pred.awayScore}` : '-:-';
      groupsHtml += `<tr>
        <td class="meta">${formatDate(match.date || '')}${match.time ? `<br><span class="time">${match.time}</span>` : ''}</td>
        <td class="home">${home}</td>
        <td class="score">${score}</td>
        <td class="away">${away}</td>
        <td></td>
      </tr>`;
    }
    groupsHtml += '</table>';
  }

  const KO_ORDER = ['R32','R16','QF','SF','3RD','F'] as const;
  let koHtml = '';
  for (const stage of KO_ORDER) {
    const stageMatches = knockoutMatches.filter((m: any) => m.stage === stage);
    if (!stageMatches.length) continue;
    koHtml += `<div class="group-header">${esc((STAGES as any)[stage] || stage)}</div><table>`;
    for (const match of stageMatches) {
      const pred = matchPredictions[match.id];
      const entry = bracketTeams?.[match.id];
      const home = esc(entry?.home ? (getTeamByCode(entry.home)?.name || '?') : 'טרם נקבע');
      const away = esc(entry?.away ? (getTeamByCode(entry.away)?.name || '?') : 'טרם נקבע');
      const score = pred?.homeScore != null && pred?.awayScore != null
        ? `${pred.homeScore}:${pred.awayScore}` : '-:-';
      const advancing = pred?.advancingTeam ? esc(getTeamByCode(pred.advancingTeam)?.name || '') : '';
      koHtml += `<tr>
        <td class="meta">${formatDate(match.date || '')}${match.time ? `<br><span class="time">${match.time}</span>` : ''}</td>
        <td class="home">${home}</td>
        <td class="score">${score}</td>
        <td class="away">${away}</td>
        <td class="advancing">${advancing ? `עולה: ${advancing}` : ''}</td>
      </tr>`;
    }
    koHtml += '</table>';
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>ניחושים — ${formName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Heebo',Arial,sans-serif;direction:rtl;padding:20px;font-size:13px;color:#222}
    .print-btn{display:inline-block;margin-bottom:20px;padding:10px 24px;background:#58CC02;color:white;border:none;border-radius:6px;font-size:15px;font-family:inherit;cursor:pointer}
    h1{font-size:20px;font-weight:bold;margin-bottom:4px}
    .cover-meta{color:#555;font-size:13px;margin-bottom:20px}
    h2{font-size:15px;font-weight:bold;color:#58CC02;border-bottom:2px solid #58CC02;padding-bottom:3px;margin:18px 0 6px}
    .group-header{background:#58CC02;color:white;padding:3px 8px;font-weight:bold;font-size:12px;margin-top:8px}
    table{width:100%;border-collapse:collapse}
    tr{border-bottom:1px solid #eee}
    td{padding:4px 6px;vertical-align:middle}
    .meta{width:40px;font-size:10px;color:#888;text-align:center;line-height:1.2}
    .time{font-size:9px}
    .home{text-align:right;font-weight:500}
    .away{text-align:left}
    .score{width:48px;text-align:center;font-weight:bold;font-size:14px}
    .advancing{width:90px;text-align:left;font-size:11px;color:#58CC02;font-weight:bold}
    .matchday-row td{font-size:10px;color:#58CC02;font-weight:bold;padding:2px 6px;background:#f9fff4}
    @media print{
      .print-btn{display:none!important}
      body{padding:8px}
      tr{page-break-inside:avoid}
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">הדפס / שמור PDF</button>
  <h1>${formName}</h1>
  <div class="cover-meta">
    ${userName ? `${esc(userName)} · ` : ''}אלופה: <strong>${championName}</strong>${form.topScorer ? ` · מלך שערים: <strong>${esc(form.topScorer)}</strong>` : ''}
  </div>
  <h2>שלב הבתים</h2>
  ${groupsHtml}
  <h2>שלב ההמשך</h2>
  ${koHtml}
  <script>document.fonts.ready.then(function(){window.print();});</script>
</body>
</html>`;
}

export async function exportToPdf(form: any, userName?: string): Promise<void> {
  const html = buildPrintHtml(form, userName);
  const w = window.open('', '_blank');
  if (!w) {
    alert('אנא אפשר פתיחת חלונות (popup) בדפדפן כדי לייצא את הטופס');
    return;
  }
  w.document.write(html);
  w.document.close();
}
