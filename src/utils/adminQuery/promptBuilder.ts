// System prompt for the admin query translator.
// Compact: TS types in fenced block + 12 op-diverse few-shots + policy.

import type { ResolvedEntities } from "./types";

const DSL_BLOCK = `
\`\`\`ts
type Stage = "groups" | "R32" | "R16" | "QF" | "SF" | "F" | "ALL";
type ScoreComponent = "teams" | "matchupsBySlot" | "pairings" | "scores" | "outcomes";

type FieldRef =
  | "formId" | "formName" | "ownerName" | "status"
  | "champion" | "topScorer" | "correctChampion" | "correctTopScorer" | "totalPoints"
  | { stage: Stage; teams: true }
  | { stage: Stage; metric: ScoreComponent }
  | { match: string; field: "home"|"away"|"homeScore"|"awayScore"|"advancingTeam"|"outcome"|"correctScore"|"correctOutcome"|"wrongMatchup" };

type Predicate =
  | { op: "and"|"or"; args: Predicate[] }
  | { op: "not"; arg: Predicate }
  | { op: "cmp"; field: FieldRef; operator: "eq"|"ne"|"gt"|"gte"|"lt"|"lte"; value: any }
  | { op: "in"; field: FieldRef; values: any[]; negated?: boolean }
  | { op: "contains"; field: FieldRef; value: any; negated?: boolean }
  | { op: "containsAtLeast"; field: FieldRef; values: any[]; n: number }
  | { op: "isNull"; field: FieldRef; negated?: boolean }
  | { op: "matchup"; teams: [string,string]; ordered?: boolean; stages?: Stage[]; matchId?: string }
  | { op: "exactScore"; matchId: string; teams?: [string,string]; homeScore: number; awayScore: number }
  | { op: "winnerAt"; matchId: string; team: string }
  | { op: "teamReachedStage"; team: string; stage: Stage };

type ScoreExpr =
  | { kind: "totalPoints" }
  | { kind: "scoreComponent"; component: ScoreComponent; stage?: Stage }
  | { kind: "fieldValue"; field: FieldRef };

type Aggregate =
  | { kind: "count" }
  | { kind: "list"; columns?: FieldRef[]; sort?: {by: ScoreExpr; order?: "asc"|"desc"}[]; limit?: number }
  | { kind: "rank"; by: ScoreExpr; limit?: number; order?: "desc"|"asc" }
  | { kind: "groupBy"; key: { field: FieldRef } | { kind: "matchPrediction"; matchId: string; aspect: "outcome"|"advancingTeam"|"exactScore" }; then: { kind: "count" } | { kind: "avg"|"sum"; of: ScoreExpr } };

type QuerySpec = {
  scope?: { includeDrafts?: boolean };
  filter?: Predicate;
  aggregate: Aggregate;
};
\`\`\``;

const POLICY = `
Output a JSON object with EXACTLY one of these shapes:
- { "spec": QuerySpec } — when the question is unambiguous.
- { "clarifyingQuestion": string } — when truly ambiguous.

Rules:
1. Prefer GUESSING over asking. Use clarifyingQuestion only when:
   (a) a referenced entity is unresolved, or
   (b) two incompatible aggregates are requested.
2. Stage scope: when no stage is named, default to stage="ALL" for scoreComponent.
3. "negated" is the canonical way to express not-in/not-contains/not-isNull. NEVER wrap them in {op:"not"}.
4. matchup.ordered defaults to false (most Hebrew speakers don't distinguish home/away).
5. Treat the chip-token \`[[team:CODE]]\` as the team code (CODE). Same for \`[[stage:CODE]]\`, \`[[form:ID]]\`.
6. When the question contains numbers, decide if each is a comparison threshold or a count predicate based on context.`;

const FEW_SHOTS = `
EXAMPLES (Hebrew question → JSON):

Q: "כמה טפסים ניחשו ש-[[team:ARG]] תזכה?"
A: {"spec":{"filter":{"op":"cmp","field":"champion","operator":"eq","value":"ARG"},"aggregate":{"kind":"count"}}}

Q: "10 הטפסים המובילים בניקוד"
A: {"spec":{"aggregate":{"kind":"rank","by":{"kind":"totalPoints"},"limit":10,"order":"desc"}}}

Q: "התפלגות ניחושי האלוף"
A: {"spec":{"aggregate":{"kind":"groupBy","key":{"field":"champion"},"then":{"kind":"count"}}}}

Q: "מי ניחש את הזיווג [[team:ARG]] – [[team:BRA]] ב-[[stage:QF]]?"
A: {"spec":{"filter":{"op":"matchup","teams":["ARG","BRA"],"stages":["QF"],"ordered":false},"aggregate":{"kind":"list"}}}

Q: "מי ניחש [[team:ARG]] – [[team:BRA]] עם תוצאה 2:1 ב-QF-1?"
A: {"spec":{"filter":{"op":"exactScore","matchId":"QF-1","teams":["ARG","BRA"],"homeScore":2,"awayScore":1},"aggregate":{"kind":"list"}}}

Q: "טפסים עם יותר מ-100 נקודות שלא ניחשו [[team:BRA]] כאלופה"
A: {"spec":{"filter":{"op":"and","args":[{"op":"cmp","field":"totalPoints","operator":"gt","value":100},{"op":"cmp","field":"champion","operator":"ne","value":"BRA"}]},"aggregate":{"kind":"list"}}}

Q: "מי ניחש לפחות 3 קבוצות שעלו לרבע הגמר"
A: {"spec":{"filter":{"op":"cmp","field":{"stage":"QF","metric":"teams"},"operator":"gte","value":3},"aggregate":{"kind":"list"}}}

Q: "דרג את הטפסים לפי תוצאות מדויקות בכל השלבים"
A: {"spec":{"aggregate":{"kind":"rank","by":{"kind":"scoreComponent","component":"scores","stage":"ALL"},"limit":10}}}

Q: "כמה ניחשו תיקו במשחק group-A-1"
A: {"spec":{"filter":{"op":"cmp","field":{"match":"group-A-1","field":"outcome"},"operator":"eq","value":"draw"},"aggregate":{"kind":"count"}}}

Q: "מי ניחש [[stage:QF]] בלי [[team:GER]]?"
A: {"spec":{"filter":{"op":"not","arg":{"op":"teamReachedStage","team":"GER","stage":"QF"}},"aggregate":{"kind":"list"}}}

Q: "מי ניבא ש-5 קבוצות מסוימות יעלו: [[team:ARG]] [[team:BRA]] [[team:FRA]] [[team:GER]] [[team:ESP]] לחצי הגמר"
A: {"spec":{"filter":{"op":"containsAtLeast","field":{"stage":"SF","teams":true},"values":["ARG","BRA","FRA","GER","ESP"],"n":5},"aggregate":{"kind":"count"}}}

Q: "מי ניחש את [[team:ARG]] או את [[team:BRA]] כאלופה?"
A: {"clarifyingQuestion":"לחפש טפסים שניחשו את שני האלופים האלה, או טפסים שניחשו לפחות אחד מהם?"}`;

export function buildSystemPrompt(): string {
  return [
    "You are a translator. You convert a Hebrew admin question about prediction forms into a strict JSON QuerySpec.",
    "Reply with JSON only — no prose, no markdown.",
    "Schema:",
    DSL_BLOCK,
    "Policy:",
    POLICY,
    FEW_SHOTS,
  ].join("\n");
}

export function buildUserPrompt(
  question: string,
  resolved: ResolvedEntities,
): string {
  return JSON.stringify({ question, resolvedEntities: resolved });
}
