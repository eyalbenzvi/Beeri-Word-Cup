// Hand-rolled validators for QuerySpec. Lighter than Zod, drops a dependency.
// Returns { ok: true, value } | { ok: false, error: string }.

import type {
  QuerySpec,
  Predicate,
  Aggregate,
  FieldRef,
  Stage,
  ScoreComponent,
  ScoreExpr,
  GroupKey,
} from "./types";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const STAGES: Stage[] = ["groups", "R32", "R16", "QF", "SF", "F", "ALL"];
const COMPONENTS: ScoreComponent[] = [
  "teams",
  "matchupsBySlot",
  "pairings",
  "scores",
  "outcomes",
];
const TOP_FIELDS = new Set([
  "formId",
  "formName",
  "ownerName",
  "status",
  "champion",
  "topScorer",
  "correctChampion",
  "correctTopScorer",
  "totalPoints",
]);
const MATCH_FIELDS = new Set([
  "home",
  "away",
  "homeScore",
  "awayScore",
  "advancingTeam",
  "outcome",
  "correctScore",
  "correctOutcome",
  "wrongMatchup",
]);
const CMP_OPS = new Set(["eq", "ne", "gt", "gte", "lt", "lte"]);

function err<T>(msg: string): ValidationResult<T> {
  return { ok: false, error: msg };
}

/** Re-tag a known-failed ValidationResult to a different success-type slot.
 *  Safe because the error branch carries no value. Accepts any
 *  ValidationResult whose `ok` was already narrowed false at the call site
 *  (TS doesn't narrow generics across helper boundaries). */
function passErr<U>(r: ValidationResult<any>): ValidationResult<U> {
  if (r.ok) throw new Error("passErr called with ok=true");
  return { ok: false, error: (r as { ok: false; error: string }).error };
}

function validateFieldRef(f: any, path: string): ValidationResult<FieldRef> {
  if (typeof f === "string") {
    if (TOP_FIELDS.has(f)) return { ok: true, value: f as FieldRef };
    return err<FieldRef>(`${path}: unknown field "${f}"`);
  }
  if (f && typeof f === "object") {
    if ("stage" in f && f.teams === true) {
      if (!STAGES.includes(f.stage))
        return err<FieldRef>(`${path}: unknown stage "${f.stage}"`);
      return { ok: true, value: f };
    }
    if ("stage" in f && "metric" in f) {
      if (!STAGES.includes(f.stage))
        return err<FieldRef>(`${path}: unknown stage "${f.stage}"`);
      if (!COMPONENTS.includes(f.metric))
        return err<FieldRef>(`${path}: unknown component "${f.metric}"`);
      return { ok: true, value: f };
    }
    if ("match" in f && "field" in f) {
      if (typeof f.match !== "string")
        return err<FieldRef>(`${path}: match must be string`);
      if (!MATCH_FIELDS.has(f.field))
        return err<FieldRef>(`${path}: unknown match field "${f.field}"`);
      return { ok: true, value: f };
    }
  }
  return err<FieldRef>(`${path}: invalid FieldRef`);
}

function validateScoreExpr(s: any, path: string): ValidationResult<ScoreExpr> {
  if (!s || typeof s !== "object") return err(`${path}: missing ScoreExpr`);
  if (s.kind === "totalPoints") return { ok: true, value: { kind: "totalPoints" } };
  if (s.kind === "scoreComponent") {
    if (!COMPONENTS.includes(s.component))
      return err(`${path}.component: unknown "${s.component}"`);
    if (s.stage !== undefined && !STAGES.includes(s.stage))
      return err(`${path}.stage: unknown "${s.stage}"`);
    return { ok: true, value: s };
  }
  if (s.kind === "fieldValue") {
    const f = validateFieldRef(s.field, `${path}.field`);
    if (!f.ok) return passErr(f);
    return { ok: true, value: { kind: "fieldValue", field: f.value } };
  }
  return err(`${path}: unknown ScoreExpr.kind "${s.kind}"`);
}

function validateGroupKey(k: any, path: string): ValidationResult<GroupKey> {
  if (!k || typeof k !== "object") return err(`${path}: missing GroupKey`);
  if (k.kind === "matchPrediction") {
    if (typeof k.matchId !== "string")
      return err(`${path}.matchId: must be string`);
    if (!["outcome", "advancingTeam", "exactScore"].includes(k.aspect))
      return err(`${path}.aspect: invalid`);
    return { ok: true, value: k };
  }
  if (k.field !== undefined) {
    const f = validateFieldRef(k.field, `${path}.field`);
    if (!f.ok) return passErr(f);
    return { ok: true, value: { field: f.value } };
  }
  return err(`${path}: invalid GroupKey`);
}

function validatePredicate(p: any, path: string): ValidationResult<Predicate> {
  if (!p || typeof p !== "object") return err(`${path}: not an object`);
  switch (p.op) {
    case "and":
    case "or": {
      if (!Array.isArray(p.args)) return err(`${path}.args: must be array`);
      // Empty and/or evaluates vacuously (and→true, or→false), which would
      // silently match all forms or none. Require at least one arg so admin
      // never gets a surprise "all forms" result from an empty filter.
      if (p.args.length === 0)
        return err(`${path}.args: must have at least one predicate`);
      for (let i = 0; i < p.args.length; i++) {
        const r = validatePredicate(p.args[i], `${path}.args[${i}]`);
        if (!r.ok) return passErr(r);
      }
      return { ok: true, value: p };
    }
    case "not": {
      // After canonicalize, only `not` over and/or/cmp/matchup/etc remains —
      // not(in|contains|isNull) was lifted to negated. Reject those here so
      // we keep one canonical form.
      const inner = p.arg;
      if (inner && typeof inner === "object") {
        if (
          inner.op === "in" ||
          inner.op === "contains" ||
          inner.op === "isNull"
        ) {
          return err(
            `${path}: use {op:"${inner.op}", negated:true}; not-wrapper is non-canonical`,
          );
        }
      }
      const r = validatePredicate(p.arg, `${path}.arg`);
      if (!r.ok) return passErr(r);
      return { ok: true, value: p };
    }
    case "cmp": {
      if (!CMP_OPS.has(p.operator))
        return err(`${path}.operator: invalid "${p.operator}"`);
      const f = validateFieldRef(p.field, `${path}.field`);
      if (!f.ok) return passErr(f);
      return { ok: true, value: p };
    }
    case "in": {
      const f = validateFieldRef(p.field, `${path}.field`);
      if (!f.ok) return passErr(f);
      if (!Array.isArray(p.values)) return err(`${path}.values: must be array`);
      return { ok: true, value: p };
    }
    case "contains": {
      const f = validateFieldRef(p.field, `${path}.field`);
      if (!f.ok) return passErr(f);
      return { ok: true, value: p };
    }
    case "containsAtLeast": {
      const f = validateFieldRef(p.field, `${path}.field`);
      if (!f.ok) return passErr(f);
      if (!Array.isArray(p.values)) return err(`${path}.values: must be array`);
      if (typeof p.n !== "number" || p.n < 1)
        return err(`${path}.n: must be positive integer`);
      return { ok: true, value: p };
    }
    case "isNull": {
      const f = validateFieldRef(p.field, `${path}.field`);
      if (!f.ok) return passErr(f);
      return { ok: true, value: p };
    }
    case "matchup": {
      if (!Array.isArray(p.teams) || p.teams.length !== 2)
        return err(`${path}.teams: must be [TeamCode, TeamCode]`);
      if (p.stages && !Array.isArray(p.stages))
        return err(`${path}.stages: must be array`);
      if (p.stages) {
        for (const s of p.stages)
          if (!STAGES.includes(s)) return err(`${path}.stages: unknown "${s}"`);
      }
      return { ok: true, value: p };
    }
    case "exactScore": {
      if (typeof p.matchId !== "string")
        return err(`${path}.matchId: must be string`);
      if (typeof p.homeScore !== "number" || typeof p.awayScore !== "number")
        return err(`${path}: scores must be numbers`);
      return { ok: true, value: p };
    }
    case "winnerAt": {
      if (typeof p.matchId !== "string")
        return err(`${path}.matchId: must be string`);
      if (typeof p.team !== "string")
        return err(`${path}.team: must be string`);
      return { ok: true, value: p };
    }
    case "teamReachedStage": {
      if (typeof p.team !== "string")
        return err(`${path}.team: must be string`);
      if (!STAGES.includes(p.stage))
        return err(`${path}.stage: unknown "${p.stage}"`);
      return { ok: true, value: p };
    }
    default:
      return err(`${path}.op: unknown "${p.op}"`);
  }
}

function validateAggregate(a: any, path: string): ValidationResult<Aggregate> {
  if (!a || typeof a !== "object") return err(`${path}: missing aggregate`);
  switch (a.kind) {
    case "count":
      return { ok: true, value: { kind: "count" } };
    case "list": {
      if (a.columns) {
        if (!Array.isArray(a.columns)) return err(`${path}.columns: must be array`);
        for (let i = 0; i < a.columns.length; i++) {
          const f = validateFieldRef(a.columns[i], `${path}.columns[${i}]`);
          if (!f.ok) return passErr(f);
        }
      }
      if (a.sort) {
        if (!Array.isArray(a.sort)) return err(`${path}.sort: must be array`);
        for (let i = 0; i < a.sort.length; i++) {
          const r = validateScoreExpr(a.sort[i].by, `${path}.sort[${i}].by`);
          if (!r.ok) return passErr(r);
        }
      }
      return { ok: true, value: a };
    }
    case "rank": {
      const r = validateScoreExpr(a.by, `${path}.by`);
      if (!r.ok) return passErr(r);
      return { ok: true, value: a };
    }
    case "groupBy": {
      const k = validateGroupKey(a.key, `${path}.key`);
      if (!k.ok) return passErr(k);
      if (!a.then || !["count", "avg", "sum"].includes(a.then.kind))
        return err(`${path}.then.kind: must be count|avg|sum`);
      if (a.then.kind !== "count") {
        const r = validateScoreExpr(a.then.of, `${path}.then.of`);
        if (!r.ok) return passErr(r);
      }
      return { ok: true, value: a };
    }
    default:
      return err(`${path}.kind: unknown "${a.kind}"`);
  }
}

export function validateQuerySpec(spec: any): ValidationResult<QuerySpec> {
  if (!spec || typeof spec !== "object") return err("spec: not an object");
  if (spec.filter) {
    const f = validatePredicate(spec.filter, "filter");
    if (!f.ok) return passErr(f);
  }
  const a = validateAggregate(spec.aggregate, "aggregate");
  if (!a.ok) return passErr(a);
  return { ok: true, value: spec as QuerySpec };
}
