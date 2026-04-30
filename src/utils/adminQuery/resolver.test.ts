import { describe, it, expect } from "vitest";
import { resolveResidual } from "./resolveResidual";
import { parseChipsFromText, defaultLabelLookup } from "./chipSerialize";
import { detectQuantifierAmbiguity } from "./quantifierCheck";

describe("chip serialize", () => {
  it("round-trip parse: text with chip markers preserves codes (Bug #6)", () => {
    const text = "כמה ניחשו ש-[[team:ARG]] תזכה ב-[[stage:F]]";
    const { chips } = parseChipsFromText(text, defaultLabelLookup);
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ kind: "team", code: "ARG" });
    expect(chips[1]).toMatchObject({ kind: "stage", code: "F" });
  });

  it("resolves Hebrew labels for known team and stage codes", () => {
    expect(defaultLabelLookup("team", "ARG")).toBe("ארגנטינה");
    expect(defaultLabelLookup("stage", "QF")).toBe("רבע גמר");
  });
});

describe("residual resolver", () => {
  it("detects scores in 2:1 and 2-1 patterns", () => {
    const r = resolveResidual("מי ניחש את התוצאה 2:1");
    expect(r.scores.length).toBeGreaterThan(0);
    expect(r.scores[0].pair).toEqual([2, 1]);
  });

  it("detects bare stage names", () => {
    const r = resolveResidual("כמה טפסים ניחשו את רבע הגמר");
    expect(r.stages.find((s) => s.stage === "QF")).toBeTruthy();
  });

  it("does not double-count score digits as bare numbers", () => {
    const r = resolveResidual("תוצאה 2:1 בגמר");
    expect(r.numbers.includes(2)).toBe(false);
    expect(r.numbers.includes(1)).toBe(false);
  });

  it("ignores numbers inside chip tokens", () => {
    const r = resolveResidual("[[team:ARG]] [[form:abc123]] תפסה את הראש");
    expect(r.numbers).not.toContain(123);
  });
});

describe("quantifier scope check", () => {
  it("flags או between two chips of same kind (Bug equivalent)", () => {
    const text = "[[team:ARG]] או [[team:BRA]] תזכה";
    const w = detectQuantifierAmbiguity(text);
    expect(w.length).toBe(1);
  });

  it("does NOT flag ו-conjunction", () => {
    const text = "[[team:ARG]] ו-[[team:BRA]] תזכה";
    const w = detectQuantifierAmbiguity(text);
    expect(w.length).toBe(0);
  });

  it("does NOT flag chips of different kinds with או", () => {
    const text = "[[team:ARG]] או [[stage:F]]";
    const w = detectQuantifierAmbiguity(text);
    expect(w.length).toBe(0);
  });

  it("does NOT match the substring או inside מאוד", () => {
    const text = "[[team:ARG]] מאוד טוב [[team:BRA]]";
    const w = detectQuantifierAmbiguity(text);
    expect(w.length).toBe(0);
  });
});
