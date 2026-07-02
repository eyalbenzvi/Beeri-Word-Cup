import { describe, it, expect } from "vitest";
import { canUseCompetitionAnalysis, getCompetitionAnalysisFlag } from "./featureFlags";

// The flag must FAIL CLOSED: any missing/garbage config → feature hidden.

const admin = { id: "admin1", isAdmin: true };
const member = { id: "user1" };
const other = { id: "user2" };

const withFlag = (flag: any) => ({ features: { competitionAnalysis: flag } });

describe("canUseCompetitionAnalysis", () => {
  it("fails closed on missing/garbage config", () => {
    expect(canUseCompetitionAnalysis(undefined, member)).toBe(false);
    expect(canUseCompetitionAnalysis({}, member)).toBe(false);
    expect(canUseCompetitionAnalysis({ features: null }, member)).toBe(false);
    expect(canUseCompetitionAnalysis({ features: { competitionAnalysis: "yes" } }, member)).toBe(false);
    expect(canUseCompetitionAnalysis(withFlag({ mode: "banana" }), member)).toBe(false);
    expect(canUseCompetitionAnalysis(withFlag({ mode: "off" }), admin)).toBe(false);
    expect(canUseCompetitionAnalysis(withFlag({}), admin)).toBe(false);
  });

  it("requires a signed-in user in every mode", () => {
    expect(canUseCompetitionAnalysis(withFlag({ mode: "all" }), null)).toBe(false);
    expect(canUseCompetitionAnalysis(withFlag({ mode: "all" }), {})).toBe(false);
  });

  it("admin mode: admin only", () => {
    const s = withFlag({ mode: "admin" });
    expect(canUseCompetitionAnalysis(s, admin)).toBe(true);
    expect(canUseCompetitionAnalysis(s, member)).toBe(false);
  });

  it("allowlist mode: listed users + admin; non-array allow fails closed", () => {
    const s = withFlag({ mode: "allowlist", allow: ["user1"] });
    expect(canUseCompetitionAnalysis(s, member)).toBe(true);
    expect(canUseCompetitionAnalysis(s, other)).toBe(false);
    expect(canUseCompetitionAnalysis(s, admin)).toBe(true);
    expect(
      canUseCompetitionAnalysis(withFlag({ mode: "allowlist", allow: "user1" }), member),
    ).toBe(false);
  });

  it("all mode: any signed-in user", () => {
    const s = withFlag({ mode: "all" });
    expect(canUseCompetitionAnalysis(s, member)).toBe(true);
    expect(canUseCompetitionAnalysis(s, admin)).toBe(true);
  });
});

describe("getCompetitionAnalysisFlag", () => {
  it("returns {} for anything malformed", () => {
    expect(getCompetitionAnalysisFlag(null)).toEqual({});
    expect(getCompetitionAnalysisFlag({ features: { competitionAnalysis: 5 } })).toEqual({});
  });
});
