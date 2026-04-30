// Pure evaluator. Takes a validated QuerySpec + FlatForm[]; returns a result.
// No I/O, no fetch, no field access except through the FieldRef whitelist.

import type {
  QuerySpec,
  Predicate,
  Aggregate,
  FieldRef,
  FlatForm,
  EvalResult,
  ScoreExpr,
  Stage,
  GroupKey,
  Literal,
} from "./types";

// ---------- Field resolution ----------

const STAGE_TEAMS_KEY: Record<string, keyof FlatForm> = {
  R32: "r32Teams",
  R16: "r16Teams",
  QF: "qfTeams",
  SF: "sfTeams",
  F: "finalTeams",
};

function resolveField(form: FlatForm, ref: FieldRef): any {
  if (typeof ref === "string") {
    return (form as any)[ref];
  }
  if ("teams" in ref && ref.teams === true) {
    if (ref.stage === "ALL") {
      // Dedupe: a team that reached SF appears in r32+r16+qf+sf rosters,
      // so concatenation would 4x-inflate any contains/containsAtLeast count.
      const seen = new Set<string>();
      const out: (string | null)[] = [];
      for (const t of [
        ...form.r32Teams,
        ...form.r16Teams,
        ...form.qfTeams,
        ...form.sfTeams,
        ...form.finalTeams,
      ]) {
        if (t == null) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
      }
      return out;
    }
    const key = STAGE_TEAMS_KEY[ref.stage as string];
    return key ? (form as any)[key] : [];
  }
  if ("metric" in ref) {
    if (ref.stage === "ALL") {
      let total = 0;
      for (const s of ["groups", "R32", "R16", "QF", "SF", "F"] as Stage[]) {
        total += form.stageScore[s as Exclude<Stage, "ALL">]?.[ref.metric] ?? 0;
      }
      return total;
    }
    const stage = ref.stage as Exclude<Stage, "ALL">;
    return form.stageScore[stage]?.[ref.metric] ?? 0;
  }
  if ("match" in ref) {
    const m = form.matches[ref.match];
    return m ? (m as any)[ref.field] : null;
  }
  return undefined;
}

function resolveScoreExpr(form: FlatForm, expr: ScoreExpr): number {
  if (expr.kind === "totalPoints") return form.totalPoints;
  if (expr.kind === "scoreComponent") {
    return resolveField(form, {
      stage: (expr.stage ?? "ALL") as Stage,
      metric: expr.component,
    } as any);
  }
  if (expr.kind === "fieldValue") {
    const v = resolveField(form, expr.field);
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    return 0;
  }
  return 0;
}

function resolveGroupKey(form: FlatForm, key: GroupKey): string {
  if ("kind" in key && key.kind === "matchPrediction") {
    const m = form.matches[key.matchId];
    if (!m) return "ללא ניחוש";
    if (key.aspect === "outcome") return m.outcome ?? "ללא ניחוש";
    if (key.aspect === "advancingTeam") return m.advancingTeam ?? "ללא ניחוש";
    if (key.aspect === "exactScore")
      return m.homeScore != null && m.awayScore != null
        ? `${m.homeScore}-${m.awayScore}`
        : "ללא ניחוש";
  }
  if ("field" in key) {
    const v = resolveField(form, key.field);
    if (v == null) return "ללא ניחוש";
    if (Array.isArray(v)) return v.filter(Boolean).sort().join(",") || "ללא ניחוש";
    return String(v);
  }
  return "ללא ניחוש";
}

// ---------- Predicate evaluation ----------

function evalPredicate(form: FlatForm, p: Predicate): boolean {
  switch (p.op) {
    case "and":
      return p.args.every((a) => evalPredicate(form, a));
    case "or":
      return p.args.some((a) => evalPredicate(form, a));
    case "not":
      return !evalPredicate(form, p.arg);
    case "cmp": {
      const v = resolveField(form, p.field);
      if (v == null) return false;
      switch (p.operator) {
        case "eq": return v === p.value;
        case "ne": return v !== p.value;
        case "gt": return typeof v === "number" && typeof p.value === "number" && v > p.value;
        case "gte": return typeof v === "number" && typeof p.value === "number" && v >= p.value;
        case "lt": return typeof v === "number" && typeof p.value === "number" && v < p.value;
        case "lte": return typeof v === "number" && typeof p.value === "number" && v <= p.value;
      }
      return false;
    }
    case "in": {
      const v = resolveField(form, p.field);
      let result: boolean;
      if (Array.isArray(v)) {
        result = v.some((x) => p.values.includes(x as Literal));
      } else {
        result = p.values.includes(v as Literal);
      }
      return p.negated ? !result : result;
    }
    case "contains": {
      const v = resolveField(form, p.field);
      let result = false;
      if (Array.isArray(v)) result = v.includes(p.value as any);
      else if (typeof v === "string" && typeof p.value === "string")
        result = v.includes(p.value);
      return p.negated ? !result : result;
    }
    case "containsAtLeast": {
      const v = resolveField(form, p.field);
      if (!Array.isArray(v)) return false;
      let hits = 0;
      for (const target of p.values) if (v.includes(target as any)) hits++;
      return hits >= p.n;
    }
    case "isNull": {
      const v = resolveField(form, p.field);
      const isNullish = v == null || (Array.isArray(v) && v.length === 0);
      return p.negated ? !isNullish : isNullish;
    }
    case "matchup": {
      const [a, b] = p.teams;
      const stages: Stage[] =
        p.stages && p.stages.length ? p.stages : (["R32", "R16", "QF", "SF", "F"] as Stage[]);
      const ids: string[] = [];
      if (p.matchId) ids.push(p.matchId);
      else {
        for (const s of stages) {
          for (const id of Object.keys(form.matches)) {
            if (matchIsAtStage(id, s as Exclude<Stage, "ALL" | "groups">))
              ids.push(id);
          }
        }
      }
      for (const id of ids) {
        const m = form.matches[id];
        if (!m || !m.home || !m.away) continue;
        if (p.ordered) {
          if (m.home === a && m.away === b) return true;
        } else {
          const matchSet = new Set([m.home, m.away]);
          if (matchSet.has(a) && matchSet.has(b)) return true;
        }
      }
      return false;
    }
    case "exactScore": {
      const m = form.matches[p.matchId];
      if (!m) return false;
      if (p.teams) {
        const [a, b] = p.teams;
        const ok = m.home === a && m.away === b;
        if (!ok) return false;
      }
      return m.homeScore === p.homeScore && m.awayScore === p.awayScore;
    }
    case "winnerAt": {
      const m = form.matches[p.matchId];
      if (!m) return false;
      if (m.advancingTeam === p.team) return true;
      if (m.outcome === "home" && m.home === p.team) return true;
      if (m.outcome === "away" && m.away === p.team) return true;
      return false;
    }
    case "teamReachedStage": {
      if (p.stage === "ALL") return false;
      const arr = resolveField(form, { stage: p.stage, teams: true } as any);
      return Array.isArray(arr) && arr.includes(p.team);
    }
  }
  return false;
}

function matchIsAtStage(id: string, stage: Exclude<Stage, "ALL" | "groups">): boolean {
  if (stage === "F") return id === "F-1";
  return id.startsWith(stage + "-");
}

// ---------- Aggregation ----------

function applyAggregate(forms: FlatForm[], agg: Aggregate): EvalResult {
  switch (agg.kind) {
    case "count":
      return { kind: "count", value: forms.length, matchedFormIds: forms.map((f) => f.formId) };
    case "list": {
      const sorted = agg.sort
        ? [...forms].sort((a, b) => {
            for (const s of agg.sort!) {
              const av = resolveScoreExpr(a, s.by);
              const bv = resolveScoreExpr(b, s.by);
              if (av !== bv) return s.order === "asc" ? av - bv : bv - av;
            }
            return 0;
          })
        : forms;
      const limited = agg.limit ? sorted.slice(0, agg.limit) : sorted;
      const cols: FieldRef[] = agg.columns ?? ["formId", "formName", "ownerName", "totalPoints"];
      const rows = limited.map((f) => {
        const row: Record<string, any> = {};
        for (const c of cols) {
          const k = typeof c === "string" ? c : JSON.stringify(c);
          row[k] = resolveField(f, c);
        }
        return row;
      });
      return { kind: "list", rows, total: forms.length };
    }
    case "rank": {
      const scored = forms.map((f) => ({
        formId: f.formId,
        formName: f.formName,
        score: resolveScoreExpr(f, agg.by),
      }));
      scored.sort((a, b) => (agg.order === "asc" ? a.score - b.score : b.score - a.score));
      const limited = agg.limit ? scored.slice(0, agg.limit) : scored;
      return { kind: "rank", rows: limited };
    }
    case "groupBy": {
      const buckets: Record<string, FlatForm[]> = {};
      for (const f of forms) {
        const key = resolveGroupKey(f, agg.key);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(f);
      }
      const groups = Object.entries(buckets).map(([key, items]) => {
        const then = agg.then;
        let value: number;
        if (then.kind === "count") value = items.length;
        else if (then.kind === "sum")
          value = items.reduce((s, f) => s + resolveScoreExpr(f, then.of), 0);
        else
          value = items.length
            ? items.reduce((s, f) => s + resolveScoreExpr(f, then.of), 0) /
              items.length
            : 0;
        return { key, value };
      });
      groups.sort((a, b) => b.value - a.value);
      return { kind: "groupBy", groups };
    }
  }
}

export function evaluate(spec: QuerySpec, allForms: FlatForm[]): EvalResult {
  const includeDrafts = !!spec.scope?.includeDrafts;
  const inScope = includeDrafts
    ? allForms
    : allForms.filter((f) => f.status !== "draft");
  const filtered = spec.filter
    ? inScope.filter((f) => evalPredicate(f, spec.filter!))
    : inScope;
  return applyAggregate(filtered, spec.aggregate);
}
