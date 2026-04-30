// Hand-authored QuerySpec gallery. These are the high-value queries an admin
// is likely to want; they double as a fallback when the LLM is offline AND
// as test fixtures (validator + evaluator must accept all of them).

import type { QuerySpec } from "./types";

export interface CannedQuery {
  id: string;
  title: string; // Hebrew
  description: string;
  spec: QuerySpec;
}

export const CANNED_QUERIES: CannedQuery[] = [
  {
    id: "total-submitted",
    title: "כמה טפסים הוגשו",
    description: "ספירת כל הטפסים שהוגשו (לא כולל טיוטות).",
    spec: { aggregate: { kind: "count" } },
  },
  {
    id: "total-with-drafts",
    title: "כמה טפסים בסך הכל (כולל טיוטות)",
    description: "כל הטפסים, כולל טיוטות שלא הוגשו.",
    spec: { scope: { includeDrafts: true }, aggregate: { kind: "count" } },
  },
  {
    id: "champion-distribution",
    title: "התפלגות ניחושי האלוף",
    description: "כמה טפסים ניחשו כל קבוצה כאלופה.",
    spec: {
      aggregate: {
        kind: "groupBy",
        key: { field: "champion" },
        then: { kind: "count" },
      },
    },
  },
  {
    id: "topscorer-distribution",
    title: "התפלגות ניחושי מלך השערים",
    description: "כמה טפסים ניחשו כל שחקן כמלך שערים.",
    spec: {
      aggregate: {
        kind: "groupBy",
        key: { field: "topScorer" },
        then: { kind: "count" },
      },
    },
  },
  {
    id: "top-10-points",
    title: "10 הטפסים המובילים בניקוד",
    description: "דירוג ניקוד כולל, 10 ראשונים.",
    spec: {
      aggregate: { kind: "rank", by: { kind: "totalPoints" }, limit: 10, order: "desc" },
    },
  },
  {
    id: "zero-points",
    title: "טפסים עם 0 נקודות",
    description: "טפסים שלא צברו אף נקודה (כשיש כבר תוצאות).",
    spec: {
      filter: { op: "cmp", field: "totalPoints", operator: "eq", value: 0 },
      aggregate: { kind: "list", limit: 50 },
    },
  },
  {
    id: "correct-champion",
    title: "מי ניחש את האלוף",
    description: "טפסים שניחשו נכונה את האלופה (זמין רק אחרי הגמר).",
    spec: {
      filter: { op: "cmp", field: "correctChampion", operator: "eq", value: true },
      aggregate: { kind: "list" },
    },
  },
  {
    id: "qf-teams-rank",
    title: "מי ניחש הכי הרבה קבוצות שעלו לרבע הגמר",
    description: "דירוג לפי מספר הקבוצות שניחש שעלו לרבע גמר.",
    spec: {
      aggregate: {
        kind: "rank",
        by: { kind: "scoreComponent", component: "teams", stage: "QF" },
        limit: 10,
      },
    },
  },
  {
    id: "exact-scores-rank",
    title: "מי ניחש הכי הרבה תוצאות מדויקות",
    description: "דירוג לפי מספר התוצאות המדויקות בכל השלבים.",
    spec: {
      aggregate: {
        kind: "rank",
        by: { kind: "scoreComponent", component: "scores", stage: "ALL" },
        limit: 10,
      },
    },
  },
  {
    id: "draws-distribution-groups",
    title: "כמה ניחשו תיקו במשחק הראשון של בית A",
    description: "התפלגות הכרעה במשחק group-A-1.",
    spec: {
      aggregate: {
        kind: "groupBy",
        key: { kind: "matchPrediction", matchId: "group-A-1", aspect: "outcome" },
        then: { kind: "count" },
      },
    },
  },
  {
    id: "champion-arg",
    title: "מי ניחש שארגנטינה תהיה אלופה",
    description: "טפסים שניחשו את ARG כאלופה.",
    spec: {
      filter: { op: "cmp", field: "champion", operator: "eq", value: "ARG" },
      aggregate: { kind: "list" },
    },
  },
  {
    id: "champion-bra",
    title: "מי ניחש שברזיל תהיה אלופה",
    description: "טפסים שניחשו את BRA כאלופה.",
    spec: {
      filter: { op: "cmp", field: "champion", operator: "eq", value: "BRA" },
      aggregate: { kind: "list" },
    },
  },
  {
    id: "qf-arg-bra",
    title: "מי ניחש ארגנטינה–ברזיל ברבע הגמר",
    description: "טפסים שבהם ARG ו-BRA נפגשו ברבע גמר (לא משנה הסדר).",
    spec: {
      filter: { op: "matchup", teams: ["ARG", "BRA"], stages: ["QF"], ordered: false },
      aggregate: { kind: "list" },
    },
  },
  {
    id: "submitted-vs-draft",
    title: "התפלגות סטטוס טפסים",
    description: "כמה טפסים בכל סטטוס.",
    spec: {
      scope: { includeDrafts: true },
      aggregate: {
        kind: "groupBy",
        key: { field: "status" },
        then: { kind: "count" },
      },
    },
  },
  {
    id: "avg-points-by-champion",
    title: "ממוצע נקודות לפי אלוף שניחשו",
    description: "ממוצע ניקוד כולל לכל אלוף שניחשו.",
    spec: {
      aggregate: {
        kind: "groupBy",
        key: { field: "champion" },
        then: { kind: "avg", of: { kind: "totalPoints" } },
      },
    },
  },
];
