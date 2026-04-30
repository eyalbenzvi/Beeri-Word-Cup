// Canonicalize an LLM-emitted (or hand-written) QuerySpec: fix common synonyms,
// fill defaults, lift singleton boolean wrappers, normalize stage strings.
// Designed to be IDEMPOTENT (canonicalize(canonicalize(x)) === canonicalize(x)).
//
// This runs BEFORE schema validation. Anything we can't repair here is rejected
// downstream.

import type { QuerySpec, Predicate, Aggregate, Stage, ScoreComponent } from "./types";

const OPERATOR_SYNONYMS: Record<string, string> = {
  equals: "eq",
  equal: "eq",
  "=": "eq",
  "==": "eq",
  notequals: "ne",
  notequal: "ne",
  "!=": "ne",
  greaterthan: "gt",
  ">": "gt",
  greaterthanorequal: "gte",
  greaterorequal: "gte",
  ">=": "gte",
  lessthan: "lt",
  "<": "lt",
  lessthanorequal: "lte",
  lessorequal: "lte",
  "<=": "lte",
};

const OP_SYNONYMS: Record<string, string> = {
  notin: "in",
  notcontains: "contains",
  doesnotcontain: "contains",
  notisnull: "isNull",
  matchat: "matchup",
  matchAt: "matchup",
  matchupAt: "matchup",
  matchupInForm: "matchup",
};

const STAGE_SYNONYMS: Record<string, Stage> = {
  group: "groups",
  groupstage: "groups",
  groupStage: "groups",
  GROUPS: "groups",
  Final: "F",
  final: "F",
  FINAL: "F",
  semi: "SF",
  Semi: "SF",
  semifinal: "SF",
  semiFinal: "SF",
  SEMIFINAL: "SF",
  quarter: "QF",
  quarterfinal: "QF",
  quarterFinal: "QF",
  QUARTERFINAL: "QF",
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  F: "F",
  ALL: "ALL",
  all: "ALL",
};

const COMPONENT_SYNONYMS: Record<string, ScoreComponent> = {
  teams: "teams",
  set: "teams",
  matchups: "matchupsBySlot",
  matchupsBySlot: "matchupsBySlot",
  bySlot: "matchupsBySlot",
  ordered: "matchupsBySlot",
  matchupsOrdered: "matchupsBySlot",
  pairings: "pairings",
  unordered: "pairings",
  matchupsUnordered: "pairings",
  scores: "scores",
  exactScores: "scores",
  outcomes: "outcomes",
};

function normalizeStage(s: any): Stage | undefined {
  if (typeof s !== "string") return undefined;
  return STAGE_SYNONYMS[s] || (s as Stage);
}

function normalizeComponent(s: any): ScoreComponent | undefined {
  if (typeof s !== "string") return undefined;
  return COMPONENT_SYNONYMS[s] || (s as ScoreComponent);
}

function canonicalizePredicate(p: any): any {
  if (!p || typeof p !== "object") return p;
  let op = String(p.op || "");
  // Normalize op aliases.
  const lower = op.toLowerCase();
  if (OP_SYNONYMS[lower]) op = OP_SYNONYMS[lower];
  if (OP_SYNONYMS[op]) op = OP_SYNONYMS[op];

  // notIn → in negated
  if (lower === "notin") return canonicalizePredicate({ ...p, op: "in", negated: true });
  if (lower === "notcontains" || lower === "doesnotcontain")
    return canonicalizePredicate({ ...p, op: "contains", negated: true });

  // Lift not(in/contains/isNull) → negated flag (JS reviewer's canonical-form rule).
  if (op === "not" && p.arg && typeof p.arg === "object") {
    const inner = p.arg;
    if (inner.op === "in" || inner.op === "contains" || inner.op === "isNull") {
      return canonicalizePredicate({ ...inner, negated: !inner.negated });
    }
    return { op: "not", arg: canonicalizePredicate(inner) };
  }

  // Lift singleton and/or wrappers.
  if ((op === "and" || op === "or") && Array.isArray(p.args)) {
    const args = p.args.map(canonicalizePredicate).filter(Boolean);
    if (args.length === 1) return args[0];
    return { op, args };
  }

  // cmp: normalize operator string; collapse legacy {op:"eq"|"ne"|"gt"|...}
  // from earlier shapes into the cmp envelope.
  if (["eq", "ne", "gt", "gte", "lt", "lte"].includes(op)) {
    return {
      op: "cmp",
      field: p.field,
      operator: op,
      value: p.value,
    };
  }
  if (op === "cmp") {
    const operator =
      OPERATOR_SYNONYMS[String(p.operator).toLowerCase()] || p.operator;
    return { op: "cmp", field: p.field, operator, value: p.value };
  }

  // matchup: normalize stages, default ordered=false.
  if (op === "matchup") {
    const stages = Array.isArray(p.stages)
      ? (p.stages.map(normalizeStage).filter(Boolean) as Stage[])
      : undefined;
    return {
      op: "matchup",
      teams: p.teams,
      ordered: !!p.ordered,
      stages,
      matchId: p.matchId,
    };
  }

  // teamReachedStage: normalize stage.
  if (op === "teamReachedStage") {
    return { op: "teamReachedStage", team: p.team, stage: normalizeStage(p.stage) };
  }

  return { ...p, op };
}

function canonicalizeAggregate(a: any): Aggregate {
  if (!a || typeof a !== "object") return { kind: "count" };
  const kind = String(a.kind || "count");
  if (kind === "rank") {
    return {
      kind: "rank",
      by: canonicalizeScoreExpr(a.by) || { kind: "totalPoints" },
      limit: typeof a.limit === "number" ? a.limit : 10,
      order: a.order === "asc" ? "asc" : "desc",
    };
  }
  if (kind === "list") {
    return {
      kind: "list",
      columns: Array.isArray(a.columns) ? a.columns : undefined,
      sort: Array.isArray(a.sort)
        ? a.sort.map((s: any) => ({
            by: canonicalizeScoreExpr(s.by) || { kind: "totalPoints" },
            order: s.order === "asc" ? "asc" : "desc",
          }))
        : undefined,
      limit: typeof a.limit === "number" ? a.limit : undefined,
    };
  }
  if (kind === "groupBy") {
    const then = a.then?.kind === "avg" || a.then?.kind === "sum"
      ? { kind: a.then.kind, of: canonicalizeScoreExpr(a.then.of) || { kind: "totalPoints" } }
      : { kind: "count" as const };
    return { kind: "groupBy", key: a.key, then } as Aggregate;
  }
  return { kind: "count" };
}

function canonicalizeScoreExpr(s: any): any {
  if (!s || typeof s !== "object") return undefined;
  if (s.kind === "scoreComponent") {
    return {
      kind: "scoreComponent",
      component: normalizeComponent(s.component) || s.component,
      stage: s.stage ? normalizeStage(s.stage) : undefined,
    };
  }
  return s;
}

export function canonicalize(spec: any): QuerySpec {
  if (!spec || typeof spec !== "object") {
    return { aggregate: { kind: "count" } };
  }
  return {
    scope: spec.scope ? { includeDrafts: !!spec.scope.includeDrafts } : undefined,
    filter: spec.filter ? canonicalizePredicate(spec.filter) : undefined,
    aggregate: canonicalizeAggregate(spec.aggregate),
  };
}
