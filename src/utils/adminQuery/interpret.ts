// Hebrew interpreter — produces a sentence and a structured echo from a
// canonical QuerySpec. Deterministic and pure (snapshot-friendly).
//
// Two views:
//   - `sentence`: natural Hebrew for the verification panel header
//   - `structured`: itemized rows for the per-filter checkbox UI

import type {
  QuerySpec,
  Predicate,
  Aggregate,
  FieldRef,
  ScoreExpr,
  Stage,
  ScoreComponent,
  GroupKey,
} from "./types";
import { ALL_TEAMS } from "../../data/teams";

const STAGE_LABELS: Record<Stage, string> = {
  groups: "שלב הבתים",
  R32: "שלב ה-32",
  R16: "שמינית גמר",
  QF: "רבע גמר",
  SF: "חצי גמר",
  F: "גמר",
  ALL: "כל השלבים",
};

const COMPONENT_LABELS: Record<ScoreComponent, string> = {
  teams: "קבוצות שעלו",
  matchupsBySlot: "זיווגים מדויקים (כולל בית/חוץ)",
  pairings: "זיווגים (ללא בית/חוץ)",
  scores: "תוצאות מדויקות",
  outcomes: "תוצאות נכונות",
};

const FIELD_LABELS: Record<string, string> = {
  formId: "מזהה טופס",
  formName: "שם טופס",
  ownerName: "שם בעל הטופס",
  status: "סטטוס",
  champion: "אלוף",
  topScorer: "מלך השערים",
  correctChampion: "ניחוש אלוף נכון",
  correctTopScorer: "ניחוש מלך שערים נכון",
  totalPoints: "ניקוד כולל",
};

const MATCH_FIELD_LABELS: Record<string, string> = {
  home: "קבוצה בית",
  away: "קבוצה חוץ",
  homeScore: "שערי הבית",
  awayScore: "שערי החוץ",
  advancingTeam: "קבוצה מעפילה",
  outcome: "הכרעה",
  correctScore: "תוצאה מדויקת",
  correctOutcome: "הכרעה נכונה",
  wrongMatchup: "משחק שגוי (קבוצות לא תואמות)",
};

const CMP_LABELS: Record<string, string> = {
  eq: "שווה ל-",
  ne: "שונה מ-",
  gt: "גדול מ-",
  gte: "גדול או שווה ל-",
  lt: "קטן מ-",
  lte: "קטן או שווה ל-",
};

function teamLabel(code: string): string {
  const t = ALL_TEAMS.find((x: any) => x.code === code);
  return t ? `${t.name}` : code;
}

function fieldLabel(f: FieldRef): string {
  if (typeof f === "string") return FIELD_LABELS[f] || f;
  if ("teams" in f) return `קבוצות ב${STAGE_LABELS[f.stage as Stage]}`;
  if ("metric" in f)
    return `${COMPONENT_LABELS[f.metric]} (${STAGE_LABELS[f.stage as Stage]})`;
  if ("match" in f)
    return `${MATCH_FIELD_LABELS[f.field] || f.field} ב-${f.match}`;
  return "?";
}

function valueLabel(v: any): string {
  if (v == null) return "ריק";
  if (typeof v === "boolean") return v ? "כן" : "לא";
  if (typeof v === "string" && /^[A-Z]{3}$/.test(v)) return teamLabel(v);
  return String(v);
}

function predicateLabel(p: Predicate): string {
  switch (p.op) {
    case "and":
      return p.args.map((a) => `(${predicateLabel(a)})`).join(" וגם ");
    case "or":
      return p.args.map((a) => `(${predicateLabel(a)})`).join(" או ");
    case "not":
      return `לא: ${predicateLabel(p.arg)}`;
    case "cmp":
      return `${fieldLabel(p.field)} ${CMP_LABELS[p.operator]}${valueLabel(p.value)}`;
    case "in":
      return `${fieldLabel(p.field)} ${p.negated ? "לא " : ""}אחד מ-[${p.values.map(valueLabel).join(", ")}]`;
    case "contains":
      return `${fieldLabel(p.field)} ${p.negated ? "לא " : ""}מכיל ${valueLabel(p.value)}`;
    case "containsAtLeast":
      return `${fieldLabel(p.field)} מכיל לפחות ${p.n} מתוך [${p.values.map(valueLabel).join(", ")}]`;
    case "isNull":
      return `${fieldLabel(p.field)} ${p.negated ? "אינו" : ""} ריק`;
    case "matchup": {
      const [a, b] = p.teams;
      const stageStr = p.stages
        ? `ב${p.stages.map((s) => STAGE_LABELS[s]).join("/")}`
        : "בכל שלב נוקאאוט";
      const orderStr = p.ordered ? " (סדר בית/חוץ)" : "";
      return `הזיווג ${teamLabel(a)} – ${teamLabel(b)} ${stageStr}${orderStr}`;
    }
    case "exactScore": {
      const teamsStr = p.teams
        ? `${teamLabel(p.teams[0])}-${teamLabel(p.teams[1])} `
        : "";
      return `במשחק ${p.matchId}: ${teamsStr}${p.homeScore}:${p.awayScore}`;
    }
    case "winnerAt":
      return `${teamLabel(p.team)} מנצחת ב-${p.matchId}`;
    case "teamReachedStage":
      return `${teamLabel(p.team)} ניחשה ב${STAGE_LABELS[p.stage]}`;
  }
}

function predicateRows(p: Predicate, depth = 0): string[] {
  switch (p.op) {
    case "and":
      return p.args.flatMap((a) => predicateRows(a, depth));
    case "or":
      return [predicateLabel(p)];
    case "not":
      return [`לא: ${predicateLabel(p.arg)}`];
    default:
      return [predicateLabel(p)];
  }
}

function scoreExprLabel(s: ScoreExpr): string {
  if (s.kind === "totalPoints") return "ניקוד כולל";
  if (s.kind === "scoreComponent") {
    const stage = s.stage ?? "ALL";
    return `${COMPONENT_LABELS[s.component]} ב${STAGE_LABELS[stage]}`;
  }
  if (s.kind === "fieldValue") return fieldLabel(s.field);
  return "?";
}

function groupKeyLabel(k: GroupKey): string {
  if ("kind" in k && k.kind === "matchPrediction") {
    const aspect =
      k.aspect === "outcome"
        ? "הכרעה"
        : k.aspect === "advancingTeam"
          ? "קבוצה מעפילה"
          : "תוצאה מדויקת";
    return `${aspect} במשחק ${k.matchId}`;
  }
  if ("field" in k) return fieldLabel(k.field);
  return "?";
}

function aggregateLabel(a: Aggregate): string {
  switch (a.kind) {
    case "count":
      return "ספירה";
    case "list":
      return `רשימה${a.limit ? ` (עד ${a.limit})` : ""}`;
    case "rank":
      return `דירוג לפי ${scoreExprLabel(a.by)}${a.limit ? `, ${a.limit} ראשונים` : ""}`;
    case "groupBy":
      return `קיבוץ לפי ${groupKeyLabel(a.key)}, ${a.then.kind === "count" ? "ספירה" : `${a.then.kind === "avg" ? "ממוצע" : "סכום"} של ${scoreExprLabel(a.then.of)}`}`;
  }
}

export interface InterpretedSpec {
  sentence: string;
  /** Itemized rows: one per filter clause, plus aggregate row, plus options. */
  structured: { label: string; value: string }[];
}

export function interpretSpec(spec: QuerySpec): InterpretedSpec {
  const rows: { label: string; value: string }[] = [];

  rows.push({ label: "פעולה", value: aggregateLabel(spec.aggregate) });

  if (spec.filter) {
    const filterRows = predicateRows(spec.filter);
    filterRows.forEach((r, i) => {
      rows.push({ label: `מסנן ${filterRows.length > 1 ? i + 1 : ""}`.trim(), value: r });
    });
  } else {
    rows.push({ label: "מסנן", value: "כל הטפסים" });
  }

  rows.push({
    label: "טפסי טיוטה",
    value: spec.scope?.includeDrafts ? "נכללים" : "לא נכללים",
  });

  // Sentence form: short and natural.
  const aggSentence = aggregateLabel(spec.aggregate);
  const filterSentence = spec.filter
    ? ` כאשר ${predicateLabel(spec.filter)}`
    : "";
  const draftsSentence = spec.scope?.includeDrafts ? " (כולל טיוטות)" : "";
  const sentence = `${aggSentence} של טפסים${filterSentence}${draftsSentence}.`;

  return { sentence, structured: rows };
}
