import { describe, it, expect } from "vitest";
import {
  liveStatusInfo,
  formatTimeLeft,
  findNextMatch,
  countLaterTodayMatches,
} from "./liveNow";
import { ALL_MATCHES } from "../data/matches";
import { getMatchKickoffUTC } from "./matchTime";
import { getMatchDateKey, getUserTimeZone } from "./userTime";

// Earliest kickoff shared by 2+ matches (a matchday-3 parallel pair).
function earliestSharedSlot() {
  const byKickoff = new Map<number, typeof ALL_MATCHES>();
  for (const m of ALL_MATCHES) {
    const k = getMatchKickoffUTC(m);
    if (k == null) continue;
    if (!byKickoff.has(k)) byKickoff.set(k, [] as any);
    byKickoff.get(k)!.push(m);
  }
  const kickoff = [...byKickoff.entries()]
    .filter(([, ms]) => ms.length >= 2)
    .map(([k]) => k)
    .sort((a, b) => a - b)[0];
  return { kickoff, matches: byKickoff.get(kickoff)! };
}

describe("liveStatusInfo", () => {
  it("falls back when there is no live entry or status", () => {
    expect(liveStatusInfo(null, "group").kind).toBe("fallback");
    expect(liveStatusInfo({}, "group").kind).toBe("fallback");
    expect(liveStatusInfo({ status: "SCHEDULED" }, "group").kind).toBe("fallback");
  });

  it("maps FINISHED and PAUSED", () => {
    expect(liveStatusInfo({ status: "FINISHED" }, "QF").kind).toBe("finished");
    expect(liveStatusInfo({ status: "PAUSED" }, "QF").kind).toBe("half");
  });

  it("reports live with minute for in-play regular time", () => {
    expect(liveStatusInfo({ status: "IN_PLAY", minute: 37 }, "group")).toEqual({
      kind: "live",
      minute: 37,
    });
  });

  it("only labels ET in knockout, never in group stage", () => {
    // group-stage minute > 90 is stoppage time, NOT extra time
    expect(liveStatusInfo({ status: "IN_PLAY", minute: 93 }, "group").kind).toBe("live");
    // knockout minute > 90 → ET
    expect(liveStatusInfo({ status: "IN_PLAY", minute: 93 }, "QF").kind).toBe("et");
    // knockout with explicit non-REGULAR duration → ET
    expect(
      liveStatusInfo({ status: "IN_PLAY", minute: 80, duration: "EXTRA_TIME" }, "SF").kind,
    ).toBe("et");
  });
});

describe("formatTimeLeft", () => {
  it("renders minutes under an hour", () => {
    expect(formatTimeLeft(45 * 60 * 1000)).toBe("45 דקות");
    expect(formatTimeLeft(60 * 1000)).toBe("1 דקות");
  });

  it("floors at one minute", () => {
    expect(formatTimeLeft(0)).toBe("1 דקות");
  });

  it("renders whole and partial hours", () => {
    expect(formatTimeLeft(3 * 60 * 60 * 1000)).toBe("3 שעות");
    expect(formatTimeLeft((2 * 60 + 5) * 60 * 1000)).toBe("2:05 שעות");
    expect(formatTimeLeft((2 * 60 + 30) * 60 * 1000)).toBe("2:30 שעות");
  });

  it("crosses to hours exactly at 60 minutes (boundary preserved)", () => {
    expect(formatTimeLeft(60 * 60 * 1000)).toBe("1 שעות");
  });
});

describe("findNextMatch", () => {
  it("returns null when every match is in the past", () => {
    expect(findNextMatch({}, 8.64e15)).toBeNull();
  });

  it("finds the earliest unresolved future match", () => {
    const next = findNextMatch({}, 0);
    expect(next).not.toBeNull();
    expect(next?.matches?.length).toBeGreaterThan(0);
    expect(next?.matches?.[0]?.id).toBeTruthy();
    expect(next?.kickoff).toBeGreaterThan(0);
    // Every returned match shares the reported kickoff.
    for (const m of next!.matches) {
      expect(getMatchKickoffUTC(m)).toBe(next!.kickoff);
    }
  });

  it("skips matches that already have a result", () => {
    const first = findNextMatch({}, 0);
    expect(first).not.toBeNull();
    const resolved = Object.fromEntries(
      first!.matches.map((m) => [m.id, { homeScore: 1, awayScore: 0 }]),
    );
    const skipped = findNextMatch(resolved, 0);
    // the next set must differ from (and kick off no earlier than) the first
    expect(skipped).not.toBeNull();
    const firstIds = new Set(first!.matches.map((m) => m.id));
    expect(skipped!.matches.some((m) => firstIds.has(m.id))).toBe(false);
    expect(skipped!.kickoff).toBeGreaterThan(first!.kickoff);
  });

  it("returns EVERY match sharing the earliest eligible kickoff (matchday-3 parallel pairs)", () => {
    // Group matches by exact kickoff and find the earliest slot with 2+ games.
    const byKickoff = new Map<number, typeof ALL_MATCHES>();
    for (const m of ALL_MATCHES) {
      const k = getMatchKickoffUTC(m);
      if (k == null) continue;
      if (!byKickoff.has(k)) byKickoff.set(k, [] as any);
      byKickoff.get(k)!.push(m);
    }
    const sharedKickoff = [...byKickoff.entries()]
      .filter(([, ms]) => ms.length >= 2)
      .map(([k]) => k)
      .sort((a, b) => a - b)[0];
    expect(sharedKickoff).toBeTruthy();

    // Mark everything before that slot resolved so it becomes "the next set".
    const results: Record<string, any> = {};
    for (const m of ALL_MATCHES) {
      const k = getMatchKickoffUTC(m);
      if (k != null && k < sharedKickoff) results[m.id] = { homeScore: 0, awayScore: 0 };
    }
    const next = findNextMatch(results, sharedKickoff - 1);
    expect(next).not.toBeNull();
    expect(next!.kickoff).toBe(sharedKickoff);
    expect(next!.matches.length).toBe(byKickoff.get(sharedKickoff)!.length);
    expect(next!.matches.length).toBeGreaterThanOrEqual(2);
    for (const m of next!.matches) {
      expect(getMatchKickoffUTC(m)).toBe(sharedKickoff);
    }
  });

  it("excludes already-resolved matches from a shared-kickoff set", () => {
    const byKickoff = new Map<number, typeof ALL_MATCHES>();
    for (const m of ALL_MATCHES) {
      const k = getMatchKickoffUTC(m);
      if (k == null) continue;
      if (!byKickoff.has(k)) byKickoff.set(k, [] as any);
      byKickoff.get(k)!.push(m);
    }
    const sharedKickoff = [...byKickoff.entries()]
      .filter(([, ms]) => ms.length >= 2)
      .map(([k]) => k)
      .sort((a, b) => a - b)[0];
    const results: Record<string, any> = {};
    for (const m of ALL_MATCHES) {
      const k = getMatchKickoffUTC(m);
      if (k != null && k < sharedKickoff) results[m.id] = { homeScore: 0, awayScore: 0 };
    }
    // Resolve ONE of the parallel pair — the set must shrink, not vanish.
    const slot = byKickoff.get(sharedKickoff)!;
    results[slot[0].id] = { homeScore: 1, awayScore: 1 };
    const next = findNextMatch(results, sharedKickoff - 1);
    expect(next).not.toBeNull();
    expect(next!.kickoff).toBe(sharedKickoff);
    expect(next!.matches.length).toBe(slot.length - 1);
    expect(next!.matches.some((m) => m.id === slot[0].id)).toBe(false);
  });
});

describe("countLaterTodayMatches", () => {
  it("excludes the shown simultaneous set so its twin isn't double-counted", () => {
    const tz = getUserTimeZone();
    const { kickoff, matches } = earliestSharedSlot();
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // Treat the slot's day as "today" and stand just before its kickoff so
    // every match in the slot counts as "later today".
    const todayKey = getMatchDateKey(matches[0], tz)!;
    const now = kickoff - 1;

    const withNothingExcluded = countLaterTodayMatches(
      {},
      now,
      todayKey,
      tz,
      new Set(),
    );
    const slotIds = new Set(matches.map((m) => m.id));
    const withSetExcluded = countLaterTodayMatches({}, now, todayKey, tz, slotIds);

    // Excluding the whole slot drops exactly the slot's matches from the count.
    expect(withNothingExcluded).toBeGreaterThanOrEqual(matches.length);
    expect(withSetExcluded).toBe(withNothingExcluded - matches.length);
  });

  it("does not count matches that already have a result", () => {
    const tz = getUserTimeZone();
    const { kickoff, matches } = earliestSharedSlot();
    const todayKey = getMatchDateKey(matches[0], tz)!;
    const now = kickoff - 1;
    const base = countLaterTodayMatches({}, now, todayKey, tz, new Set());
    // Record a result for one later-today match → it drops out of the count.
    const resolved = { [matches[0].id]: { homeScore: 0, awayScore: 0 } };
    const after = countLaterTodayMatches(resolved, now, todayKey, tz, new Set());
    expect(after).toBe(base - 1);
  });
});
