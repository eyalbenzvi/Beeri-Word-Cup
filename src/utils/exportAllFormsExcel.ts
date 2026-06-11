import { calcBracketTeams, deriveChampion } from "./bracket";
import { groupMatches, knockoutMatches, ALL_MATCHES, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { normalizeStatus, isScoreValid } from "./helpers";

// Pure workbook builder for the one-off "export everyone's predictions"
// admin script (scripts/export-all-forms.ts). Returns plain arrays-of-arrays
// per sheet — no xlsx dependency — so it is directly unit-testable.
//
// Sheets:
//   1. סיכום         — one row per submitted form (owner, champion, top scorer…)
//   2. שלב הבתים     — matrix: row per group match, column per form ("2:1")
//   3. נוקאאוט       — matrix: row per KO match, column per form. Each form has
//                      its own bracket, so cells embed the team names.
//   4. נתונים גולמיים — long format (form × match) for pivot tables.

type SheetSpec = {
  name: string;
  rows: any[][];
  cols: { wch: number }[];
};

const KO_ORDER = ["R32", "R16", "QF", "SF", "3RD", "F"];

function teamName(code: string | null | undefined): string {
  if (!code) return "טרם נקבע";
  return getTeamByCode(code)?.name || code;
}

function scoreStr(pred: any): string {
  if (!isScoreValid(pred)) return "—";
  return `${pred.homeScore}:${pred.awayScore}`;
}

function advancingName(pred: any, homeName: string, awayName: string): string {
  if (pred?.advancingTeam) return teamName(pred.advancingTeam);
  if (!isScoreValid(pred)) return "";
  const h = Number(pred.homeScore);
  const a = Number(pred.awayScore);
  if (h > a) return homeName;
  if (a > h) return awayName;
  return "";
}

function koCell(pred: any, bracketEntry: any): string {
  const home = bracketEntry?.home || null;
  const away = bracketEntry?.away || null;
  const hasScore = isScoreValid(pred);
  if (!home && !away && !hasScore) return "—";
  const homeName = teamName(home);
  const awayName = teamName(away);
  if (!hasScore) return `${homeName} — ${awayName}`;
  let cell = `${homeName} ${pred.homeScore}:${pred.awayScore} ${awayName}`;
  // On a predicted tie the advancing pick is the only way to know who
  // the form sends through — surface it inline.
  if (Number(pred.homeScore) === Number(pred.awayScore) && pred.advancingTeam) {
    cell += ` (עולה: ${teamName(pred.advancingTeam)})`;
  }
  return cell;
}

function ownerName(directory: Record<string, any>, userId: string | undefined): string {
  const entry = userId ? directory?.[userId] : null;
  if (entry?.displayName) return entry.displayName;
  const full = [entry?.firstName, entry?.lastName].filter(Boolean).join(" ");
  return full || "משתמש";
}

export function buildAllFormsWorkbook(
  formsById: Record<string, any>,
  directory: Record<string, any>,
): SheetSpec[] {
  const forms = Object.entries(formsById)
    .filter(([, form]) => normalizeStatus((form as any)?.status) === "submitted")
    .map(([formId, form]) => {
      const f = form as any;
      const matches = f.matches || {};
      const userId = f.userId || formId.split("__")[0];
      return {
        formId,
        form: f,
        matches,
        owner: ownerName(directory, userId),
        bracket: calcBracketTeams(matches),
      };
    })
    .sort((a, b) =>
      (a.form.formName || "").localeCompare(b.form.formName || "", "he"),
    );

  const formNames = forms.map((f) => f.form.formName || f.formId);
  const ownerNames = forms.map((f) => f.owner);

  // ── SHEET 1: סיכום ────────────────────────────────────────────────────────

  const summaryRows: any[][] = [
    ["שם טופס", "מנחש", "תאריך הגשה", "אלופה", "מלך שערים", "מספר תקציב", "ניחושים שמולאו"],
  ];
  for (const f of forms) {
    const championCode = deriveChampion(f.matches, f.bracket);
    const submittedDate = f.form.submittedAt
      ? new Date(f.form.submittedAt).toLocaleDateString("he-IL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "—";
    const filled = ALL_MATCHES.reduce(
      (n, m) => n + (isScoreValid(f.matches[m.id]) ? 1 : 0),
      0,
    );
    summaryRows.push([
      f.form.formName || f.formId,
      f.owner,
      submittedDate,
      championCode ? teamName(championCode) : "לא נקבע",
      f.form.topScorer || "—",
      f.form.budgetNumber || "—",
      `${filled}/${ALL_MATCHES.length}`,
    ]);
  }

  // ── SHEET 2: שלב הבתים (מטריצה) ──────────────────────────────────────────

  const groupFixedCols = ["בית", "תאריך", "קבוצת בית", "קבוצת חוץ"];
  const groupRows: any[][] = [
    [...groupFixedCols, ...formNames],
    [...groupFixedCols.map(() => ""), ...ownerNames],
  ];
  const groupKeys = Object.keys(GROUPS);
  for (const group of groupKeys) {
    if (group !== groupKeys[0]) groupRows.push([]);
    for (const match of groupMatches.filter((m: any) => m.group === group)) {
      groupRows.push([
        `בית ${group}`,
        match.date || "",
        teamName(match.homeTeam),
        teamName(match.awayTeam),
        ...forms.map((f) => scoreStr(f.matches[match.id])),
      ]);
    }
  }

  // ── SHEET 3: נוקאאוט (מטריצה) ────────────────────────────────────────────

  const koFixedCols = ["שלב", "תאריך", "מס' משחק"];
  const koRows: any[][] = [
    [...koFixedCols, ...formNames],
    [...koFixedCols.map(() => ""), ...ownerNames],
  ];
  let firstKoStage = true;
  for (const stage of KO_ORDER) {
    const stageMatches = knockoutMatches.filter((m: any) => m.stage === stage);
    if (stageMatches.length === 0) continue;
    if (!firstKoStage) koRows.push([]);
    firstKoStage = false;
    for (const match of stageMatches) {
      koRows.push([
        STAGES[stage as keyof typeof STAGES] || stage,
        match.date || "",
        match.fifaMatch ?? "",
        ...forms.map((f) => koCell(f.matches[match.id], f.bracket?.[match.id])),
      ]);
    }
  }

  // ── SHEET 4: נתונים גולמיים (פורמט ארוך) ─────────────────────────────────

  const rawRows: any[][] = [
    ["שם טופס", "מנחש", "שלב", "בית", "תאריך", "קבוצת בית", "שערי בית", "שערי חוץ", "קבוצת חוץ", "עולה"],
  ];
  for (const f of forms) {
    for (const match of ALL_MATCHES) {
      const pred = f.matches[match.id];
      const isGroup = match.stage === "group";
      const bracketEntry = isGroup ? null : f.bracket?.[match.id];
      const homeName = isGroup
        ? teamName(match.homeTeam)
        : teamName(bracketEntry?.home);
      const awayName = isGroup
        ? teamName(match.awayTeam)
        : teamName(bracketEntry?.away);
      rawRows.push([
        f.form.formName || f.formId,
        f.owner,
        STAGES[match.stage as keyof typeof STAGES] || match.stage,
        isGroup ? (match as any).group : "",
        match.date || "",
        homeName,
        isScoreValid(pred) ? pred.homeScore : "—",
        isScoreValid(pred) ? pred.awayScore : "—",
        awayName,
        isGroup ? "" : advancingName(pred, homeName, awayName),
      ]);
    }
  }

  const formCol = (wch: number) => forms.map(() => ({ wch }));
  return [
    {
      name: "סיכום",
      rows: summaryRows,
      cols: [
        { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 14 },
        { wch: 18 }, { wch: 12 }, { wch: 14 },
      ],
    },
    {
      name: "שלב הבתים",
      rows: groupRows,
      cols: [
        { wch: 8 }, { wch: 11 }, { wch: 18 }, { wch: 18 },
        ...formCol(10),
      ],
    },
    {
      name: "נוקאאוט",
      rows: koRows,
      cols: [{ wch: 12 }, { wch: 11 }, { wch: 9 }, ...formCol(32)],
    },
    {
      name: "נתונים גולמיים",
      rows: rawRows,
      cols: [
        { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 6 }, { wch: 11 },
        { wch: 18 }, { wch: 9 }, { wch: 9 }, { wch: 18 }, { wch: 18 },
      ],
    },
  ];
}
