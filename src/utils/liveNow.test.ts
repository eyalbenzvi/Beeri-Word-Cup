import { describe, it, expect } from "vitest";
import { liveStatusInfo, formatTimeLeft, findNextMatch } from "./liveNow";

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
    expect(next?.match?.id).toBeTruthy();
    expect(next?.kickoff).toBeGreaterThan(0);
  });

  it("skips matches that already have a result", () => {
    const first = findNextMatch({}, 0);
    expect(first).not.toBeNull();
    const skipped = findNextMatch({ [first!.match.id]: { homeScore: 1, awayScore: 0 } }, 0);
    // the next match must differ from (and kick off no earlier than) the first
    expect(skipped?.match?.id).not.toBe(first!.match.id);
    expect(skipped!.kickoff).toBeGreaterThanOrEqual(first!.kickoff);
  });
});
