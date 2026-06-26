// Per-form metric registry + pure derivations for the admin "מידע ונתונים →
// טפסים" analytics table. Some metrics reuse leaderboard-scored fields (rank,
// totalPoints, exactScoreCount, outcomeCount); the two per-stage families are
// derived here directly from BRACKETS (not from scoring), so they reflect the
// current bracket — exactly like the Results tab — without waiting for the
// whole group stage to finish:
//   • teams-reached-stage counts  (predicted advancers ∩ the bracket's actual
//     advancers, per knockout round)
//   • correct-matchup counts      (form predicted the right team identities for
//     a knockout match, bucketed by stage — same ordered home/away test the
//     Stats/Results match panels use)
// Keeping the metric list, labels and value extraction in ONE place means the
// component and its tests share a single source of truth.

import { knockoutMatches } from "../data/matches";

// matchId → stage for every knockout match (R32-1 → "R32", 3RD-1 → "3RD", …).
const KO_STAGE_BY_ID: Record<string, string> = Object.fromEntries(
  knockoutMatches.map((m) => [m.id, m.stage]),
);

// A bracket slot's two teams (null until the slot is determined).
export type BracketEntry = { home?: string | null; away?: string | null };

// Knockout advancing rounds, in tournament order. Matches the keys produced by
// deriveAdvancingTeams / deriveActualAdvancing in bracket.ts.
export const ADVANCING_ROUNDS = ["R32", "R16", "QF", "SF", "F"] as const;

// Knockout stages that carry a dedicated "exact matches" metric. "3RD" is the
// third-place play-off (מקום 3-4). Group stage is covered by the overall
// exactTotal metric, not a per-stage column.
export const EXACT_STAGES = ["R32", "R16", "QF", "SF", "F", "3RD"] as const;

export type AdvancingRound = (typeof ADVANCING_ROUNDS)[number];
export type ExactStage = (typeof EXACT_STAGES)[number];

export type MetricFamily = "general" | "advancing" | "exact";

export interface FormMetricDef {
  key: string;
  /** Full Hebrew label shown in the metric picker. */
  label: string;
  /** Which picker section / column eyebrow the metric belongs to. */
  family: MetricFamily;
  /** Short header line shown in the table column. */
  col: string;
  /** Default sort direction when this metric becomes the sort key. */
  dir: "asc" | "desc";
}

// Picker section titles + column eyebrow per family. The eyebrow disambiguates
// the two stage families whose short labels collide (e.g. "שמינית" appears as
// both an advancing column and an exact-matches column).
export const FAMILY_TITLE: Record<MetricFamily, string> = {
  general: "כללי",
  advancing: "קבוצות שעלו",
  exact: "משחקים מדויקים",
};
export const FAMILY_EYEBROW: Record<MetricFamily, string> = {
  general: "",
  advancing: "עלו",
  exact: "מדויק",
};

// Compact, RTL-friendly stage tokens reused by both stage families.
const STAGE_COL: Record<string, string> = {
  R32: "32",
  R16: "שמינית",
  QF: "רבע",
  SF: "חצי",
  F: "גמר",
  "3RD": "מקום 3",
};

// The full, ordered metric registry. Order = default left-to-right column order
// and the order the picker lists them within each family.
export const FORM_METRICS: FormMetricDef[] = [
  { key: "rank", label: "דירוג", family: "general", col: "דירוג", dir: "asc" },
  { key: "points", label: "ניקוד", family: "general", col: "נקודות", dir: "desc" },
  { key: "exactTotal", label: "כמות תוצאות מדויקות", family: "general", col: "מדויקים", dir: "desc" },
  { key: "outcomeTotal", label: "כמות הכרעות", family: "general", col: "הכרעות", dir: "desc" },

  { key: "teamsR32", label: "כמות קבוצות שעלו לשלב ה-32", family: "advancing", col: STAGE_COL.R32, dir: "desc" },
  { key: "teamsR16", label: "כמות קבוצות שעלו לשמינית", family: "advancing", col: STAGE_COL.R16, dir: "desc" },
  { key: "teamsQF", label: "כמות קבוצות שעלו לרבע", family: "advancing", col: STAGE_COL.QF, dir: "desc" },
  { key: "teamsSF", label: "כמות קבוצות שעלו לחצי", family: "advancing", col: STAGE_COL.SF, dir: "desc" },
  { key: "teamsF", label: "כמות קבוצות שעלו לגמר", family: "advancing", col: STAGE_COL.F, dir: "desc" },

  { key: "exactR32", label: "כמות משחקים מדויקים בשלב ה-32", family: "exact", col: STAGE_COL.R32, dir: "desc" },
  { key: "exactR16", label: "כמות משחקים מדויקים בשמינית", family: "exact", col: STAGE_COL.R16, dir: "desc" },
  { key: "exactQF", label: "כמות משחקים מדויקים ברבע", family: "exact", col: STAGE_COL.QF, dir: "desc" },
  { key: "exactSF", label: "כמות משחקים מדויקים בחצי", family: "exact", col: STAGE_COL.SF, dir: "desc" },
  { key: "exactF", label: "כמות משחקים מדויקים בגמר", family: "exact", col: STAGE_COL.F, dir: "desc" },
  { key: "exact3RD", label: "כמות משחקים מדויקים במקום ה-3", family: "exact", col: STAGE_COL["3RD"], dir: "desc" },
];

export const FORM_METRIC_KEYS = FORM_METRICS.map((m) => m.key);
export const FORM_METRIC_MAP: Record<string, FormMetricDef> = Object.fromEntries(
  FORM_METRICS.map((m) => [m.key, m]),
);
export const MAX_SELECTED_METRICS = 3;

// Count of correctly-predicted advancing teams per round: the intersection of
// the form's predicted advancers and the actual advancers. A round with no
// actual advancers yet contributes 0 for every form (nothing determined).
export function computeAdvancingCounts(
  predAdvancing: Record<string, string[]> | null | undefined,
  actualAdvancing: Record<string, string[]> | null | undefined,
): Record<AdvancingRound, number> {
  const out = { R32: 0, R16: 0, QF: 0, SF: 0, F: 0 } as Record<AdvancingRound, number>;
  for (const round of ADVANCING_ROUNDS) {
    const actual = actualAdvancing?.[round];
    if (!actual || actual.length === 0) continue;
    const actualSet = new Set(actual);
    const predicted = predAdvancing?.[round] || [];
    let n = 0;
    for (const team of predicted) if (actualSet.has(team)) n++;
    out[round] = n;
  }
  return out;
}

// Count of knockout matches whose TEAM IDENTITIES the form predicted correctly,
// bucketed by stage. A match counts only when the actual bracket slot is
// determined (both teams known) and the form's predicted bracket has the same
// two teams in the same home/away slots — the identical ordered test the
// Stats/Results match panels use (bracketMatchesActual). This is bracket-based,
// so it tracks the live bracket without waiting for the group stage to end.
export function computeMatchupHitsByStage(
  predBracket: Record<string, BracketEntry> | null | undefined,
  actualBracket: Record<string, BracketEntry> | null | undefined,
): Record<ExactStage, number> {
  const out = { R32: 0, R16: 0, QF: 0, SF: 0, F: 0, "3RD": 0 } as Record<ExactStage, number>;
  if (!actualBracket) return out;
  for (const [matchId, at] of Object.entries(actualBracket)) {
    if (!at || !at.home || !at.away) continue; // slot not determined yet
    const stage = KO_STAGE_BY_ID[matchId];
    if (!stage || !(stage in out)) continue;
    const pt = predBracket?.[matchId];
    if (pt && pt.home === at.home && pt.away === at.away) {
      out[stage as ExactStage]++;
    }
  }
  return out;
}

// Flatten a scored leaderboard entry + the two derivations into the flat
// metric-key → number record the table reads. Single source for "what value
// does metric X have for this form", shared by the component and the tests.
export function computeFormMetricValues(
  base: {
    rank: number;
    totalPoints: number;
    exactScoreCount: number;
    outcomeCount: number;
  },
  advancingCounts: Record<AdvancingRound, number>,
  matchupByStage: Record<ExactStage, number>,
): Record<string, number> {
  return {
    rank: base.rank,
    points: base.totalPoints,
    exactTotal: base.exactScoreCount,
    outcomeTotal: base.outcomeCount,
    teamsR32: advancingCounts.R32,
    teamsR16: advancingCounts.R16,
    teamsQF: advancingCounts.QF,
    teamsSF: advancingCounts.SF,
    teamsF: advancingCounts.F,
    exactR32: matchupByStage.R32,
    exactR16: matchupByStage.R16,
    exactQF: matchupByStage.QF,
    exactSF: matchupByStage.SF,
    exactF: matchupByStage.F,
    exact3RD: matchupByStage["3RD"],
  };
}

// Sort a list of rows by a chosen metric key + direction, with a deterministic
// fallback to official rank then formId so equal-metric rows never shuffle.
export function sortFormMetricRows<
  T extends { formId: string; rank: number; values: Record<string, number> },
>(rows: T[], sortKey: string, dir: "asc" | "desc"): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a.values[sortKey] ?? 0;
    const bv = b.values[sortKey] ?? 0;
    if (av !== bv) return (av - bv) * factor;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.formId.localeCompare(b.formId);
  });
}
