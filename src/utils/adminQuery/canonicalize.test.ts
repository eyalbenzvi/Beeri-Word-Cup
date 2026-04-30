import { describe, it, expect } from "vitest";
import { canonicalize } from "./canonicalize";
import { validateQuerySpec } from "./schemas";

describe("canonicalize", () => {
  it("is idempotent for varied inputs (Bug #7)", () => {
    const inputs = [
      { aggregate: { kind: "count" } },
      { filter: { op: "eq", field: "champion", value: "ARG" }, aggregate: { kind: "count" } },
      {
        filter: {
          op: "and",
          args: [
            { op: "in", field: "status", values: ["submitted"] },
            { op: "not", arg: { op: "in", field: "champion", values: ["ARG"] } },
          ],
        },
        aggregate: { kind: "rank", by: { kind: "totalPoints" } },
      },
      {
        aggregate: {
          kind: "rank",
          by: { kind: "scoreComponent", component: "matchupsOrdered", stage: "QF" },
        },
      },
    ];
    for (const inp of inputs) {
      const a = canonicalize(inp);
      const b = canonicalize(a);
      expect(b).toEqual(a);
    }
  });

  it("normalizes operator synonyms (equals→eq, >→gt)", () => {
    const a = canonicalize({
      filter: { op: "cmp", field: "totalPoints", operator: "greaterThan", value: 10 },
      aggregate: { kind: "count" },
    });
    expect((a.filter as any).operator).toBe("gt");
  });

  it("collapses {op:'eq', field, value} into cmp envelope", () => {
    const a = canonicalize({
      filter: { op: "eq", field: "champion", value: "ARG" },
      aggregate: { kind: "count" },
    });
    expect((a.filter as any).op).toBe("cmp");
    expect((a.filter as any).operator).toBe("eq");
  });

  it("lifts not(in) into in.negated (canonical encoding)", () => {
    const a = canonicalize({
      filter: { op: "not", arg: { op: "in", field: "status", values: ["draft"] } },
      aggregate: { kind: "count" },
    });
    expect((a.filter as any).op).toBe("in");
    expect((a.filter as any).negated).toBe(true);
  });

  it("normalizes stage synonyms (final → F, quarter → QF)", () => {
    const a = canonicalize({
      aggregate: {
        kind: "rank",
        by: { kind: "scoreComponent", component: "teams", stage: "final" },
      },
    });
    expect(((a.aggregate as any).by as any).stage).toBe("F");
  });

  it("normalizes component synonyms (matchupsOrdered → matchupsBySlot)", () => {
    const a = canonicalize({
      aggregate: {
        kind: "rank",
        by: { kind: "scoreComponent", component: "matchupsOrdered", stage: "QF" },
      },
    });
    expect(((a.aggregate as any).by as any).component).toBe("matchupsBySlot");
  });

  it("lifts singleton and/or wrappers", () => {
    const a = canonicalize({
      filter: {
        op: "and",
        args: [{ op: "cmp", field: "champion", operator: "eq", value: "ARG" }],
      },
      aggregate: { kind: "count" },
    });
    expect((a.filter as any).op).toBe("cmp");
  });

  it("converts notIn → in negated", () => {
    const a = canonicalize({
      filter: { op: "notIn", field: "status", values: ["draft"] },
      aggregate: { kind: "count" },
    });
    expect((a.filter as any).op).toBe("in");
    expect((a.filter as any).negated).toBe(true);
  });
});

describe("validateQuerySpec", () => {
  it("accepts a canonical spec", () => {
    const spec = canonicalize({
      filter: { op: "cmp", field: "champion", operator: "eq", value: "ARG" },
      aggregate: { kind: "count" },
    });
    const r = validateQuerySpec(spec);
    expect(r.ok).toBe(true);
  });

  it("rejects unknown field name (Bug #11)", () => {
    const r = validateQuerySpec({
      filter: { op: "cmp", field: "fooBar", operator: "eq", value: 1 },
      aggregate: { kind: "count" },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown stage", () => {
    const r = validateQuerySpec({
      aggregate: {
        kind: "rank",
        by: { kind: "scoreComponent", component: "teams", stage: "octofinal" },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-canonical not(in) (Bug #8)", () => {
    const r = validateQuerySpec({
      filter: { op: "not", arg: { op: "in", field: "status", values: ["draft"] } },
      aggregate: { kind: "count" },
    });
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(/non-canonical/);
  });

  it("accepts canonical in.negated", () => {
    const r = validateQuerySpec({
      filter: { op: "in", field: "status", values: ["draft"], negated: true },
      aggregate: { kind: "count" },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty and/or filter (vacuous truth)", () => {
    const r = validateQuerySpec({
      filter: { op: "and", args: [] },
      aggregate: { kind: "count" },
    });
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(/at least one/);
  });
});
