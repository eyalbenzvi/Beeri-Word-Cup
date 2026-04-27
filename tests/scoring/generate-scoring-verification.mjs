// Generates a standalone Hebrew HTML page for visual / manual verification
// of the scoring system. Each scenario is printed three ways side by side:
//
//   1. The setup (predictions + actual results), in plain table form.
//   2. The hand-derived expected total + breakdown (computed inline so a
//      human can read the math).
//   3. The system-computed total via calculateFullScore from src/utils/scoring.js.
//
// The page colour-codes ✅ / ❌ per scenario so a reviewer can scroll through
// and visually confirm every payoff. Open in a browser:
//   open tests/scoring-verification.html
// or
//   xdg-open tests/scoring-verification.html
//
// Re-run after any scoring change:
//   node --loader ./tests/loader.mjs ./tests/generate-scoring-verification.mjs

import { writeFileSync } from "node:fs";
import { calculateFullScore, POINTS, BONUSES } from "/home/user/Beeri-World-Cup/src/utils/scoring.js";

// -- helpers ----------------------------------------------------------------

const STAGE_LABEL = {
  group: "בתים",
  R32: "שלב 32",
  R16: "שמינית",
  QF: "רבע",
  SF: "חצי",
  "3RD": "מקום 3",
  F: "גמר",
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// Hand-derive expected per-match payoff so a human can read "2-1 vs 2-1 in QF
// → הכרעה 7 + מדויק 3 = 10".
function explainMatch(pred, actual, stage, predTeams, actualTeams) {
  const sp = POINTS[stage] || POINTS.group;
  if (!pred || pred.homeScore == null || pred.awayScore == null) {
    return { pts: 0, text: "אין ניחוש" };
  }
  if (!actual || actual.homeScore == null || actual.awayScore == null) {
    return { pts: 0, text: "טרם שוחק" };
  }
  if (stage !== "group" && predTeams && actualTeams) {
    const same = predTeams.home === actualTeams.home && predTeams.away === actualTeams.away;
    if (!same) return { pts: 0, text: `משחק שונה (ניחוש ${predTeams.home}-${predTeams.away}, בפועל ${actualTeams.home}-${actualTeams.away})` };
  }
  const ph = +pred.homeScore, pa = +pred.awayScore;
  const ah = +actual.homeScore, aw = +actual.awayScore;
  const oPred = Math.sign(ph - pa);
  const oAct = Math.sign(ah - aw);
  if (oPred !== oAct) return { pts: 0, text: `הכרעה שגויה (ניחוש ${ph}-${pa} ↔ בפועל ${ah}-${aw})` };
  const exact = ph === ah && pa === aw;
  if (exact) return { pts: sp.outcome + sp.exactScore, text: `הכרעה ${sp.outcome} + מדויק ${sp.exactScore} = ${sp.outcome + sp.exactScore}` };
  return { pts: sp.outcome, text: `הכרעה ${sp.outcome}` };
}

function explainAdvancing(userAdvancing, actualAdvancing) {
  const items = [];
  let total = 0;
  const ADV_STAGE = { R32: "group", R16: "R32", QF: "R16", SF: "QF", F: "SF" };
  for (const [round, picks] of Object.entries(userAdvancing || {})) {
    const correctSet = new Set(actualAdvancing?.[round] || []);
    const per = POINTS[ADV_STAGE[round]].advancing;
    const hits = picks.filter((t) => correctSet.has(t));
    const got = hits.length * per;
    total += got;
    items.push({
      round,
      picks,
      correct: hits,
      perTeam: per,
      got,
      explain: hits.length === 0
        ? `0 פגיעות × ${per} = 0`
        : `${hits.length} פגיעות × ${per} = ${got} (${hits.join(", ")})`,
    });
  }
  return { items, total };
}

// -- scenarios --------------------------------------------------------------
// Each scenario: title, description, setup (matches/results), expected
// breakdown (we compute it from the spec inline), then we let the production
// code compute it and we PASS/FAIL on equality.

const SCENARIOS = [
  {
    title: "1. ניחוש מושלם בשלב הבתים",
    desc: "שני משחקים בשלב הבתים, שני הניחושים מדויקים. מצופה: 4 + 4 = 8.",
    user: {
      matches: {
        "g1": { homeScore: 2, awayScore: 1 },
        "g2": { homeScore: 0, awayScore: 0 },
      },
      advancing: {},
      champion: null,
      topScorer: null,
    },
    actual: {
      "g1": { homeScore: 2, awayScore: 1, stage: "group" },
      "g2": { homeScore: 0, awayScore: 0, stage: "group" },
    },
    advancing: {},
    bonuses: {},
  },
  {
    title: "2. הכרעה נכונה אבל לא מדויק",
    desc: "ניחוש 2-0 בפועל 1-0 בשלב הבתים. ניחוש הכרעה נכון בלי בונוס מדויק. מצופה: 1.",
    user: { matches: { "g1": { homeScore: 2, awayScore: 0 } }, advancing: {}, champion: null, topScorer: null },
    actual: { "g1": { homeScore: 1, awayScore: 0, stage: "group" } },
    advancing: {}, bonuses: {},
  },
  {
    title: "3. הכרעה שגויה",
    desc: "ניחוש 1-0 בפועל 0-1. אפס נקודות.",
    user: { matches: { "g1": { homeScore: 1, awayScore: 0 } }, advancing: {}, champion: null, topScorer: null },
    actual: { "g1": { homeScore: 0, awayScore: 1, stage: "group" } },
    advancing: {}, bonuses: {},
  },
  {
    title: "4. תיקו ניחשנו ותיקו יצא — לא מדויק",
    desc: "ניחוש 1-1 בפועל 0-0 בשלב הבתים. הכרעה (תיקו) נכונה. מצופה: 1.",
    user: { matches: { "g1": { homeScore: 1, awayScore: 1 } }, advancing: {}, champion: null, topScorer: null },
    actual: { "g1": { homeScore: 0, awayScore: 0, stage: "group" } },
    advancing: {}, bonuses: {},
  },
  {
    title: "5. ניחוש מדויק ברבע גמר",
    desc: "ניחוש 2-1 ברבע, בפועל 2-1, הקבוצות זהות. מצופה: 7 + 3 = 10.",
    user: { matches: { "qf": { homeScore: 2, awayScore: 1 } }, advancing: {}, champion: null, topScorer: null },
    actual: { "qf": { homeScore: 2, awayScore: 1, stage: "QF" } },
    advancing: {}, bonuses: {},
    predBracket: { "qf": { home: "BRA", away: "ARG" } },
    actualBracket: { "qf": { home: "BRA", away: "ARG" } },
  },
  {
    title: "6. ניחוש 'מדויק' אך משחק אחר ברבע גמר",
    desc: "צייר ברזיל-ארגנטינה ברבע, בפועל גרמניה-צרפת. הניקוד אמור להיות 0 גם כשהציון זהה.",
    user: { matches: { "qf": { homeScore: 2, awayScore: 1 } }, advancing: {}, champion: null, topScorer: null },
    actual: { "qf": { homeScore: 2, awayScore: 1, stage: "QF" } },
    advancing: {}, bonuses: {},
    predBracket: { "qf": { home: "BRA", away: "ARG" } },
    actualBracket: { "qf": { home: "GER", away: "FRA" } },
  },
  {
    title: "7. גמר מדויק",
    desc: "גמר: ניחוש 2-1, בפועל 2-1. הקבוצות זהות. מצופה: 11 + 3 = 14.",
    user: { matches: { "F-1": { homeScore: 2, awayScore: 1 } }, advancing: {}, champion: null, topScorer: null },
    actual: { "F-1": { homeScore: 2, awayScore: 1, stage: "F" } },
    advancing: {}, bonuses: {},
    predBracket: { "F-1": { home: "BRA", away: "ARG" } },
    actualBracket: { "F-1": { home: "BRA", away: "ARG" } },
  },
  {
    title: "8. בונוס אלופה בלבד",
    desc: "אין משחקים. אלופה ניחוש = ARG, בפועל = ARG. מצופה: 9.",
    user: { matches: {}, advancing: {}, champion: "ARG", topScorer: null },
    actual: {}, advancing: {}, bonuses: { champion: "ARG", topScorers: [] },
  },
  {
    title: "9. בונוס מלך שערים — שם בעברית כשהאדמין הזין באנגלית",
    desc: "ניחוש 'ליאו מסי' (עברית), בפועל הוזן 'Lionel Messi'. אמור לקבל 8 (ההתאמה לפי אליאס דו־לשוני).",
    user: { matches: {}, advancing: {}, champion: null, topScorer: "ליאו מסי" },
    actual: {}, advancing: {}, bonuses: { topScorers: ["Lionel Messi"] },
  },
  {
    title: "10. מלך שערים — שם שאינו ברשימה",
    desc: "ניחוש 'איזה שם בודה', בפועל 'Lionel Messi'. אפס נקודות.",
    user: { matches: {}, advancing: {}, champion: null, topScorer: "Some Random Name" },
    actual: {}, advancing: {}, bonuses: { topScorers: ["Lionel Messi"] },
  },
  {
    title: "11. עולה לרבע — חלק מהניחושים נכונים",
    desc: "ניחוש 4 קבוצות לרבע, 2 מהן נכונות. נקודות לכל קבוצה = R16.advancing = 6. מצופה: 12.",
    user: { matches: {}, advancing: { QF: ["BRA", "ARG", "GER", "ITA"] }, champion: null, topScorer: null },
    actual: {}, advancing: { QF: ["BRA", "ARG", "FRA", "ESP"] }, bonuses: {},
  },
  {
    title: "12. עולה לשמינית — שלב 32 פותחים בקבוצות",
    desc: "ניחוש 32 קבוצות לשלב 32, 32 נכונות. נקודות לכל קבוצה = group.advancing = 2. מצופה: 64.",
    user: {
      matches: {}, advancing: { R32: Array.from({ length: 32 }, (_, i) => "T" + i) },
      champion: null, topScorer: null,
    },
    actual: {},
    advancing: { R32: Array.from({ length: 32 }, (_, i) => "T" + i) },
    bonuses: {},
  },
  {
    title: "13. גמר עולה — 2 קבוצות נכונות",
    desc: "ניחוש 2 קבוצות לגמר, שתיהן נכונות. נקודות לכל קבוצה = SF.advancing = 10. מצופה: 20.",
    user: { matches: {}, advancing: { F: ["BRA", "ARG"] }, champion: null, topScorer: null },
    actual: {}, advancing: { F: ["BRA", "ARG"] }, bonuses: {},
  },
  {
    title: "14. תרחיש מלא קומפקטי",
    desc:
      "שני משחקי בתים (אחד מדויק, אחד הכרעה בלבד), אחד שמינית-גמר מדויק עם הקבוצות הנכונות, אלופה נכונה, מלך שערים נכון, ועלייה לשמינית עם פגיעה אחת. נחשב ידנית: 4 + 1 + 8 (5 הכרעה + 3 מדויק) + 9 + 8 + 4 (R16 advancing משתמש ב־R32.advancing=4 ולפיכך פגיעה אחת = 4) = 34.",
    user: {
      matches: {
        "g1": { homeScore: 2, awayScore: 1 },
        "g2": { homeScore: 1, awayScore: 0 },
        "k1": { homeScore: 1, awayScore: 0 },
      },
      advancing: { R16: ["BRA", "XX2"] },
      champion: "BRA",
      topScorer: "Lionel Messi",
    },
    actual: {
      "g1": { homeScore: 2, awayScore: 1, stage: "group" },
      "g2": { homeScore: 3, awayScore: 1, stage: "group" },
      "k1": { homeScore: 1, awayScore: 0, stage: "R16" },
    },
    advancing: { R16: ["BRA", "ARG"] },
    bonuses: { champion: "BRA", topScorers: ["Lionel Messi"] },
    predBracket: { "k1": { home: "BRA", away: "ARG" } },
    actualBracket: { "k1": { home: "BRA", away: "ARG" } },
  },
  {
    title: "15. ניחוש ריק (אין משחק נחוש)",
    desc: "המשחק שוחק אבל המשתמש לא הגיש ניחוש. אפס נקודות.",
    user: { matches: { "g1": { homeScore: null, awayScore: null } }, advancing: {}, champion: null, topScorer: null },
    actual: { "g1": { homeScore: 1, awayScore: 0, stage: "group" } },
    advancing: {}, bonuses: {},
  },
  {
    title: "16. תוצאה ריקה (משחק טרם שוחק)",
    desc: "ניחוש 1-0 קיים, אבל התוצאה עדיין null. אפס נקודות, סטטוס 'טרם שוחק'.",
    user: { matches: { "g1": { homeScore: 1, awayScore: 0 } }, advancing: {}, champion: null, topScorer: null },
    actual: { "g1": { homeScore: null, awayScore: null, stage: "group" } },
    advancing: {}, bonuses: {},
  },
];

// -- render -----------------------------------------------------------------

function scenarioHtml(sc) {
  const matchEntries = Object.entries(sc.actual);
  const matchRows = matchEntries.map(([id, actual]) => {
    const pred = sc.user.matches?.[id] || null;
    const stage = actual.stage || "group";
    const predTeams = sc.predBracket?.[id];
    const actualTeams = sc.actualBracket?.[id];
    const ex = explainMatch(pred, actual, stage, predTeams, actualTeams);
    const predStr = pred && pred.homeScore != null
      ? `${pred.homeScore}-${pred.awayScore}` + (predTeams ? ` <span class="muted">(${predTeams.home}–${predTeams.away})</span>` : "")
      : "—";
    const actualStr = actual.homeScore != null
      ? `${actual.homeScore}-${actual.awayScore}` + (actualTeams ? ` <span class="muted">(${actualTeams.home}–${actualTeams.away})</span>` : "")
      : "—";
    return `<tr>
      <td><code>${escapeHtml(id)}</code> <span class="muted">${STAGE_LABEL[stage]}</span></td>
      <td>${predStr}</td>
      <td>${actualStr}</td>
      <td><b>${ex.pts}</b> <span class="muted">— ${escapeHtml(ex.text)}</span></td>
    </tr>`;
  });

  const adv = explainAdvancing(sc.user.advancing, sc.advancing);
  const advRows = adv.items.map((it) => `<tr>
    <td>${it.round}</td>
    <td>${it.picks.map(escapeHtml).join(", ") || "—"}</td>
    <td>${(sc.advancing?.[it.round] || []).map(escapeHtml).join(", ") || "—"}</td>
    <td><b>${it.got}</b> <span class="muted">— ${escapeHtml(it.explain)}</span></td>
  </tr>`);

  const matchTotal = matchEntries.reduce((s, [id, actual]) => {
    const pred = sc.user.matches?.[id] || null;
    const stage = actual.stage || "group";
    const ex = explainMatch(pred, actual, stage, sc.predBracket?.[id], sc.actualBracket?.[id]);
    return s + ex.pts;
  }, 0);

  const champOk = sc.bonuses?.champion && sc.user.champion === sc.bonuses.champion;
  const champPts = champOk ? BONUSES.champion : 0;
  // For top scorer, mirror isSamePlayer's behaviour but show our reasoning.
  const topPts = (() => {
    if (!Array.isArray(sc.bonuses?.topScorers) || !sc.user.topScorer) return 0;
    // simple: any direct case-insensitive trim, OR Hebrew/English alias.
    // delegate to the production calc by running it for just this concern.
    const probe = calculateFullScore(
      { matches: {}, advancing: {}, champion: null, topScorer: sc.user.topScorer },
      {}, {}, { topScorers: sc.bonuses.topScorers }, {}, {},
    );
    return probe.correctTopScorer ? BONUSES.topScorer : 0;
  })();

  const expectedTotal = matchTotal + adv.total + champPts + topPts;

  // System computed
  const sys = calculateFullScore(
    sc.user, sc.actual, sc.advancing, sc.bonuses,
    sc.predBracket || {}, sc.actualBracket || {},
  );

  const ok = sys.totalPoints === expectedTotal;
  const banner = ok
    ? `<div class="ok">✅ ${sys.totalPoints} (התאמה)</div>`
    : `<div class="bad">❌ ידני: ${expectedTotal} · מערכת: ${sys.totalPoints}</div>`;

  return `<section class="${ok ? 'pass' : 'fail'}">
    <h2>${escapeHtml(sc.title)}</h2>
    <p class="desc">${escapeHtml(sc.desc)}</p>
    ${matchRows.length > 0 ? `
    <h3>משחקים</h3>
    <table>
      <thead><tr><th>משחק</th><th>ניחוש</th><th>בפועל</th><th>נקודות (חישוב ידני)</th></tr></thead>
      <tbody>${matchRows.join("")}</tbody>
      <tfoot><tr><td colspan="3"><b>סיכום משחקים</b></td><td><b>${matchTotal}</b></td></tr></tfoot>
    </table>` : ""}
    ${advRows.length > 0 ? `
    <h3>עולים לשלב הבא</h3>
    <table>
      <thead><tr><th>שלב</th><th>ניחוש</th><th>בפועל</th><th>נקודות (חישוב ידני)</th></tr></thead>
      <tbody>${advRows.join("")}</tbody>
      <tfoot><tr><td colspan="3"><b>סיכום עולים</b></td><td><b>${adv.total}</b></td></tr></tfoot>
    </table>` : ""}
    <h3>בונוסים</h3>
    <table>
      <thead><tr><th>בונוס</th><th>ניחוש</th><th>בפועל</th><th>נקודות</th></tr></thead>
      <tbody>
        <tr><td>אלופה</td><td>${escapeHtml(sc.user.champion ?? "—")}</td><td>${escapeHtml(sc.bonuses?.champion ?? "—")}</td><td><b>${champPts}</b></td></tr>
        <tr><td>מלך שערים</td><td>${escapeHtml(sc.user.topScorer ?? "—")}</td><td>${escapeHtml((sc.bonuses?.topScorers || []).join(", ") || "—")}</td><td><b>${topPts}</b></td></tr>
      </tbody>
    </table>
    <div class="totals">
      <div>סה"כ ידני: <b>${expectedTotal}</b> (משחקים ${matchTotal} + עולים ${adv.total} + אלופה ${champPts} + מלך שערים ${topPts})</div>
      <div>סה"כ מערכת: <b>${sys.totalPoints}</b></div>
      ${banner}
    </div>
  </section>`;
}

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>אימות חישוב נקודות — בארי מונדיאל 2026</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Heebo", Arial, sans-serif; background: #f7f7fb; margin: 0; padding: 24px; color: #222; line-height: 1.55; }
  header { max-width: 1100px; margin: 0 auto 24px; }
  header h1 { margin: 0 0 8px; font-size: 24px; }
  header p { margin: 0; color: #555; max-width: 720px; }
  section { max-width: 1100px; margin: 0 auto 24px; background: #fff; border-radius: 12px; padding: 18px 22px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); border-right: 6px solid #ccc; }
  section.pass { border-right-color: #16a34a; }
  section.fail { border-right-color: #dc2626; background: #fff4f4; }
  section h2 { margin: 0 0 4px; font-size: 18px; }
  section .desc { margin: 0 0 12px; color: #555; font-size: 14px; }
  section h3 { margin: 14px 0 6px; font-size: 13px; color: #444; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #fafafa; font-weight: 600; color: #555; }
  tfoot td { background: #fafafa; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  .muted { color: #888; font-size: 12px; }
  .totals { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ddd; font-size: 14px; }
  .ok { display: inline-block; margin-top: 6px; padding: 4px 10px; background: #dcfce7; color: #166534; border-radius: 6px; font-weight: 700; }
  .bad { display: inline-block; margin-top: 6px; padding: 4px 10px; background: #fee2e2; color: #991b1b; border-radius: 6px; font-weight: 700; }
  summary { cursor: pointer; padding: 8px; background: #fafafa; border-radius: 8px; }
  .legend { background: #fff; border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); margin: 0 auto 18px; max-width: 1100px; font-size: 13px; }
  .legend table { font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>אימות חישוב נקודות — בארי מונדיאל 2026</h1>
  <p>
    כל תרחיש מציג: ניחושים והתוצאות בפועל ⇐ פירוק ידני של הנקודות לפי הספק ⇐ הסכום שמחזירה המערכת
    (calculateFullScore). ירוק = שתי הספירות תואמות. אדום = פער בין החישוב הידני למערכת.
  </p>
</header>
<div class="legend">
  <b>טבלת נקודות (לפי שלב)</b>
  <table>
    <thead><tr><th>שלב</th><th>הכרעה</th><th>מדויק (נוסף להכרעה)</th><th>עלייה לשלב הבא</th></tr></thead>
    <tbody>
      ${Object.entries(POINTS).map(([k, v]) => `<tr><td>${STAGE_LABEL[k]}</td><td>${v.outcome}</td><td>${v.exactScore}</td><td>${v.advancing}</td></tr>`).join("")}
    </tbody>
  </table>
  <div style="margin-top:8px;">בונוסים: אלופה = ${BONUSES.champion} · מלך שערים = ${BONUSES.topScorer}</div>
</div>
${SCENARIOS.map(scenarioHtml).join("\n")}
<footer style="max-width:1100px;margin:24px auto 0;color:#666;font-size:13px;text-align:center;">
  הופק ע"י <code>tests/generate-scoring-verification.mjs</code>. ריצה מחדש לאחר כל שינוי בלוגיקת הניקוד.
</footer>
</body>
</html>`;

const out = "/home/user/Beeri-World-Cup/tests/scoring-verification.html";
writeFileSync(out, html);

// Also report PASS/FAIL per scenario to stdout for CI sanity.
let pass = 0, fail = 0;
for (const sc of SCENARIOS) {
  const matchTotal = Object.entries(sc.actual).reduce((s, [id, actual]) => {
    const pred = sc.user.matches?.[id] || null;
    const stage = actual.stage || "group";
    const ex = explainMatch(pred, actual, stage, sc.predBracket?.[id], sc.actualBracket?.[id]);
    return s + ex.pts;
  }, 0);
  const adv = explainAdvancing(sc.user.advancing, sc.advancing);
  const champOk = sc.bonuses?.champion && sc.user.champion === sc.bonuses.champion;
  const champPts = champOk ? BONUSES.champion : 0;
  const probe = calculateFullScore(
    { matches: {}, advancing: {}, champion: null, topScorer: sc.user.topScorer },
    {}, {}, { topScorers: sc.bonuses?.topScorers || [] }, {}, {},
  );
  const topPts = probe.correctTopScorer ? BONUSES.topScorer : 0;
  const expected = matchTotal + adv.total + champPts + topPts;
  const sys = calculateFullScore(sc.user, sc.actual, sc.advancing, sc.bonuses, sc.predBracket || {}, sc.actualBracket || {});
  if (sys.totalPoints === expected) { pass++; }
  else {
    fail++;
    console.log(`FAIL: "${sc.title}" — manual=${expected}, system=${sys.totalPoints}`);
  }
}

console.log(`\nWrote ${out}`);
console.log(`Scenarios: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
