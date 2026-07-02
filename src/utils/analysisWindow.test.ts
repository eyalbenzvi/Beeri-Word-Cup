import { describe, it, expect } from "vitest";
import { selectWatchMatches, WATCH_WINDOW_MS } from "./analysisWindow";

// Israel time is UTC+3 for the whole tournament. Kickoff parsing goes through
// the real matchTime util, so dates here are the schedule format ("Jul 3").

const NOW = Date.UTC(2026, 6, 2, 12, 0, 0); // Jul 2 2026, 15:00 Israel

const group = (id: string, date: string, time: string) => ({
  id,
  stage: "group",
  group: "A",
  date,
  time,
  homeTeam: "MEX",
  awayTeam: "RSA",
});
const ko = (id: string, date: string, time: string) => ({
  id,
  stage: "R32",
  date,
  time,
});

describe("selectWatchMatches", () => {
  it("keeps unplayed matches inside the 48h window, sorted by kickoff", () => {
    const matches = [
      ko("R32-2", "Jul 3", "22:00"),
      ko("R32-1", "Jul 2", "20:00"),
      ko("R32-9", "Jul 9", "20:00"), // outside window
    ];
    const bracket = {
      "R32-1": { home: "FRA", away: "GER" },
      "R32-2": { home: "BRA", away: "ESP" },
      "R32-9": { home: "ARG", away: "POR" },
    };
    const out = selectWatchMatches(matches, {}, bracket, NOW);
    expect(out.map((w) => w.id)).toEqual(["R32-1", "R32-2"]);
    expect(out[0].home).toBe("FRA");
    expect(out[0].kickoffUTC).toBeGreaterThan(NOW);
  });

  it("excludes played matches and unknown knockout matchups", () => {
    const matches = [ko("R32-1", "Jul 2", "20:00"), ko("R32-2", "Jul 3", "22:00")];
    const bracket = { "R32-1": { home: "FRA", away: "GER" }, "R32-2": { home: null, away: "ESP" } };
    const results = { "R32-1": { homeScore: 1, awayScore: 0 } };
    expect(selectWatchMatches(matches, results, bracket, NOW)).toEqual([]);
  });

  it("keeps a live match (kicked off, no result) within the grace window", () => {
    const matches = [ko("R32-1", "Jul 2", "13:00")]; // 2h before NOW (Israel 13:00 = 10:00 UTC → 2h ago)
    const bracket = { "R32-1": { home: "FRA", away: "GER" } };
    const out = selectWatchMatches(matches, {}, bracket, NOW);
    expect(out.map((w) => w.id)).toEqual(["R32-1"]);
  });

  it("group matches use the fixed fixture teams", () => {
    const matches = [group("G-1", "Jul 3", "20:00")];
    const out = selectWatchMatches(matches, {}, {}, NOW);
    expect(out[0]).toMatchObject({ id: "G-1", home: "MEX", away: "RSA", stage: "group" });
  });

  it("falls back to the next matchday when the 48h window is empty", () => {
    const matches = [
      ko("R32-7", "Jul 9", "20:00"),
      ko("R32-8", "Jul 9", "23:00"),
      ko("R32-9", "Jul 10", "20:00"),
    ];
    const bracket = {
      "R32-7": { home: "FRA", away: "GER" },
      "R32-8": { home: "BRA", away: "ESP" },
      "R32-9": { home: "ARG", away: "POR" },
    };
    const out = selectWatchMatches(matches, {}, bracket, NOW);
    // Only the earliest upcoming Israel day (Jul 9).
    expect(out.map((w) => w.id)).toEqual(["R32-7", "R32-8"]);
  });

  it("returns [] when nothing remains", () => {
    expect(selectWatchMatches([], {}, {}, NOW)).toEqual([]);
  });

  it("window constant stays 48h (product contract)", () => {
    expect(WATCH_WINDOW_MS).toBe(48 * 3600000);
  });
});
