import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isScoreValid,
  normalizeStatus,
  preferredScrollBehavior,
  randomScore,
} from "./helpers";

describe("isScoreValid", () => {
  it("rejects null / undefined predictions", () => {
    expect(isScoreValid(null)).toBe(false);
    expect(isScoreValid(undefined)).toBe(false);
  });

  it("rejects predictions with missing scores", () => {
    expect(isScoreValid({ homeScore: 1, awayScore: null })).toBe(false);
    expect(isScoreValid({ homeScore: null, awayScore: 1 })).toBe(false);
    expect(isScoreValid({ homeScore: "", awayScore: 0 })).toBe(false);
  });

  it("accepts a valid 0-0 prediction", () => {
    expect(isScoreValid({ homeScore: 0, awayScore: 0 })).toBe(true);
  });

  it("accepts predictions with numeric scores", () => {
    expect(isScoreValid({ homeScore: 3, awayScore: 1 })).toBe(true);
  });
});

describe("normalizeStatus", () => {
  it("maps the legacy `approved` status to `submitted`", () => {
    // The store historically used `approved`; the rest of the app reads
    // `submitted`. This shim is the single point of normalization.
    expect(normalizeStatus("approved")).toBe("submitted");
  });

  it("returns the input status unchanged when not legacy", () => {
    expect(normalizeStatus("draft")).toBe("draft");
    expect(normalizeStatus("submitted")).toBe("submitted");
    expect(normalizeStatus("pending")).toBe("pending");
  });

  it("falls back to `draft` for empty / nullish", () => {
    expect(normalizeStatus(null)).toBe("draft");
    expect(normalizeStatus(undefined)).toBe("draft");
    expect(normalizeStatus("")).toBe("draft");
  });
});

describe("preferredScrollBehavior", () => {
  let origMatchMedia;
  beforeEach(() => {
    origMatchMedia = window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = origMatchMedia;
  });

  it('returns "smooth" when the user has no motion preference', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(preferredScrollBehavior()).toBe("smooth");
  });

  it('returns "auto" when prefers-reduced-motion: reduce', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(preferredScrollBehavior()).toBe("auto");
  });

  it("falls back safely if matchMedia throws", () => {
    window.matchMedia = vi.fn().mockImplementation(() => {
      throw new Error("matchMedia broken");
    });
    expect(preferredScrollBehavior()).toBe("smooth");
  });
});

describe("randomScore", () => {
  it("returns an integer in 0..5 — the weighted sample range", () => {
    for (let i = 0; i < 200; i++) {
      const s = randomScore();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(5);
    }
  });
});
