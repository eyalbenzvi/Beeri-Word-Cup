import { describe, it, expect } from "vitest";
import {
  normalizeIsraeliMobile,
  isValidIsraeliMobile,
  sanitizePhoneInput,
  ISRAELI_MOBILE_PREFIXES,
} from "./phone";

describe("ISRAELI_MOBILE_PREFIXES", () => {
  it("includes the active commercial-mobile prefixes", () => {
    expect(ISRAELI_MOBILE_PREFIXES).toEqual(
      expect.arrayContaining(["050", "052", "053", "054", "055", "058"]),
    );
  });

  it("excludes 051 / 056 / 057 / 059 (not assigned to mobile)", () => {
    expect(ISRAELI_MOBILE_PREFIXES).not.toContain("051");
    expect(ISRAELI_MOBILE_PREFIXES).not.toContain("056");
    expect(ISRAELI_MOBILE_PREFIXES).not.toContain("057");
    expect(ISRAELI_MOBILE_PREFIXES).not.toContain("059");
  });
});

describe("normalizeIsraeliMobile — accepted formats", () => {
  it.each([
    ["0501234567", "0501234567"],
    ["050-123-4567", "0501234567"],
    ["050 123 4567", "0501234567"],
    ["050.123.4567", "0501234567"],
    ["(050) 123-4567", "0501234567"],
    ["+972501234567", "0501234567"],
    ["+972-50-123-4567", "0501234567"],
    ["00972501234567", "0501234567"],
    ["972501234567", "0501234567"],
  ])("normalizes %j -> %j", (input, expected) => {
    expect(normalizeIsraeliMobile(input)).toBe(expected);
  });
});

describe("normalizeIsraeliMobile — rejected input", () => {
  it.each([
    [null],
    [undefined],
    [""],
    ["abc"],
    ["050-not-a-number"],
    // Wrong prefix (not commercial mobile):
    ["0511234567"],
    ["0571234567"],
    // Too short / too long:
    ["050123"],
    ["05012345678"],
    // Arabic-Indic digits — not normalized:
    ["٠٥٠١٢٣٤٥٦٧"],
  ])("rejects %j", (input) => {
    expect(normalizeIsraeliMobile(input)).toBeNull();
  });
});

describe("normalizeIsraeliMobile — invisible chars stripped", () => {
  it("strips zero-width space embedded in pasted phone numbers", () => {
    const withZwsp = "050​123​4567";
    expect(normalizeIsraeliMobile(withZwsp)).toBe("0501234567");
  });

  it("strips LRM / RLM marks", () => {
    expect(normalizeIsraeliMobile("‎0501234567‏")).toBe("0501234567");
  });
});

describe("isValidIsraeliMobile", () => {
  it("returns true for a normalizable number", () => {
    expect(isValidIsraeliMobile("050-123-4567")).toBe(true);
    expect(isValidIsraeliMobile("+972501234567")).toBe(true);
  });

  it("returns false for invalid input", () => {
    expect(isValidIsraeliMobile("abc")).toBe(false);
    expect(isValidIsraeliMobile("0511234567")).toBe(false);
    expect(isValidIsraeliMobile(null)).toBe(false);
  });
});

describe("sanitizePhoneInput — live filter", () => {
  it("preserves digits and accepted formatting glyphs", () => {
    expect(sanitizePhoneInput("+972 (50) 123-4567")).toBe("+972 (50) 123-4567");
  });

  it("strips letters / emoji / control chars in real time", () => {
    expect(sanitizePhoneInput("050abc1234567")).toBe("0501234567");
    expect(sanitizePhoneInput("050😀1234567")).toBe("0501234567");
  });

  it("caps length at 20 (longest sane format is 17)", () => {
    const input = "1234567890123456789012345";
    expect(sanitizePhoneInput(input).length).toBe(20);
  });

  it("returns empty string for null / undefined", () => {
    expect(sanitizePhoneInput(null)).toBe("");
    expect(sanitizePhoneInput(undefined)).toBe("");
  });
});
