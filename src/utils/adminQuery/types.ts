// Type definitions for the admin query feature.
// Kept isolated from app types — none of these leak outside src/utils/adminQuery
// or src/components/adminQuery.

export type TeamCode = string;
export type Stage = "groups" | "R32" | "R16" | "QF" | "SF" | "F" | "ALL";
export type ScoreComponent =
  | "teams"
  | "matchupsBySlot"
  | "pairings"
  | "scores"
  | "outcomes";
export type FormStatus = "draft" | "pending" | "submitted" | "approved";

// ---------- Flat form (precomputed admin-side view) ----------

export interface FlatMatch {
  /** Bracket-resolved home team for this form (null if upstream undecided). */
  home: TeamCode | null;
  away: TeamCode | null;
  /** Form's score prediction. */
  homeScore: number | null;
  awayScore: number | null;
  advancingTeam: TeamCode | null;
  /** "home" | "away" | "draw" | null when no prediction. */
  outcome: "home" | "away" | "draw" | null;
  /** Per-match correctness — null when actual result unknown. */
  correctScore: boolean | null;
  correctOutcome: boolean | null;
  /** True when this is a knockout match and form's bracket teams differ from
   *  the actual bracket teams (form predicted teams that didn't reach this slot). */
  wrongMatchup: boolean | null;
}

export interface StageScore {
  /** Set membership: |form.stageTeams ∩ actual.stageTeams|. */
  teams: number;
  /** Slot-correct pairings: home AND away match actual at the same slot. */
  matchupsBySlot: number;
  /** Pair-correct (unordered): {home,away} pair appears in actual at any slot of the stage. */
  pairings: number;
  /** Match scores correct (exact). */
  scores: number;
  /** Match outcomes correct (home/away/draw). */
  outcomes: number;
}

export interface FlatForm {
  formId: string;
  formName: string;
  /** Display name from userDirectory (or fallback). */
  ownerName: string;
  status: FormStatus;

  champion: TeamCode | null;
  topScorer: string | null;
  /** null when result is not yet known (champion bonus not yet awarded). */
  correctChampion: boolean | null;
  correctTopScorer: boolean | null;

  /** Stage rosters from form's bracket. (TeamCode | null)[]; nulls preserved. */
  r32Teams: (TeamCode | null)[];
  r16Teams: (TeamCode | null)[];
  qfTeams: (TeamCode | null)[];
  sfTeams: (TeamCode | null)[];
  finalTeams: (TeamCode | null)[];

  stageScore: {
    groups: StageScore;
    R32: StageScore;
    R16: StageScore;
    QF: StageScore;
    SF: StageScore;
    F: StageScore;
  };

  matches: Record<string, FlatMatch>;
  totalPoints: number;
}

// ---------- DSL ----------

export type Literal = string | number | boolean | null;

export type FieldRef =
  | "formId"
  | "formName"
  | "ownerName"
  | "status"
  | "champion"
  | "topScorer"
  | "correctChampion"
  | "correctTopScorer"
  | "totalPoints"
  | { stage: Stage; teams: true }
  | { stage: Stage; metric: ScoreComponent }
  | { match: string; field: MatchField };

export type MatchField =
  | "home"
  | "away"
  | "homeScore"
  | "awayScore"
  | "advancingTeam"
  | "outcome"
  | "correctScore"
  | "correctOutcome"
  | "wrongMatchup";

export type Predicate =
  | { op: "and"; args: Predicate[] }
  | { op: "or"; args: Predicate[] }
  | { op: "not"; arg: Predicate }
  | {
      op: "cmp";
      field: FieldRef;
      operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
      value: Literal;
    }
  | { op: "in"; field: FieldRef; values: Literal[]; negated?: boolean }
  | { op: "contains"; field: FieldRef; value: Literal; negated?: boolean }
  | {
      op: "containsAtLeast";
      field: FieldRef;
      values: Literal[];
      n: number;
    }
  | { op: "isNull"; field: FieldRef; negated?: boolean }
  | {
      op: "matchup";
      teams: [TeamCode, TeamCode];
      ordered?: boolean;
      stages?: Stage[];
      matchId?: string;
    }
  | {
      op: "exactScore";
      matchId: string;
      teams?: [TeamCode, TeamCode];
      homeScore: number;
      awayScore: number;
    }
  | { op: "winnerAt"; matchId: string; team: TeamCode }
  | { op: "teamReachedStage"; team: TeamCode; stage: Stage };

export type ScoreExpr =
  | { kind: "totalPoints" }
  | { kind: "scoreComponent"; component: ScoreComponent; stage?: Stage }
  | { kind: "fieldValue"; field: FieldRef };

export type SortSpec = { by: ScoreExpr; order?: "asc" | "desc" };

export type GroupKey =
  | { field: FieldRef }
  | {
      kind: "matchPrediction";
      matchId: string;
      aspect: "outcome" | "advancingTeam" | "exactScore";
    };

export type Aggregate =
  | { kind: "count" }
  | {
      kind: "list";
      columns?: FieldRef[];
      sort?: SortSpec[];
      limit?: number;
    }
  | {
      kind: "rank";
      by: ScoreExpr;
      limit?: number;
      order?: "desc" | "asc";
    }
  | {
      kind: "groupBy";
      key: GroupKey;
      then:
        | { kind: "count" }
        | { kind: "avg"; of: ScoreExpr }
        | { kind: "sum"; of: ScoreExpr };
    };

export interface QuerySpec {
  scope?: { includeDrafts?: boolean };
  filter?: Predicate;
  aggregate: Aggregate;
}

// ---------- Evaluator results ----------

export type CountResult = { kind: "count"; value: number; matchedFormIds: string[] };
export type ListResult = {
  kind: "list";
  rows: Array<Record<string, Literal | Literal[]>>;
  total: number;
};
export type RankResult = {
  kind: "rank";
  rows: Array<{ formId: string; formName: string; score: number }>;
};
export type GroupByResult = {
  kind: "groupBy";
  groups: Array<{ key: string; value: number }>;
};

export type EvalResult = CountResult | ListResult | RankResult | GroupByResult;

// ---------- Resolver / chip types ----------

export type ChipKind = "team" | "stage" | "form";

export interface Chip {
  kind: ChipKind;
  /** Canonical code (TeamCode for team, Stage enum for stage, formId for form). */
  code: string;
  /** Display label (Hebrew name). */
  label: string;
}

export interface ResolvedEntities {
  chips: Chip[];
  scores: Array<{ token: string; pair: [number, number] }>;
  /** Bare stage names found in the question text (un-chipped). */
  stages: Array<{ token: string; stage: Stage }>;
  /** Bare numbers in the question text. */
  numbers: number[];
  /** Pre-LLM warnings (e.g., quantifier-scope ambiguity). */
  warnings: string[];
}

// ---------- LLM contract ----------

export type LLMResponse =
  | { spec: QuerySpec }
  | { clarifyingQuestion: string };
