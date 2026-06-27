import { describe, it, expect } from "vitest";
import { canAcquireLock, shouldRerun, SCENARIO_LOCK_TTL_MS } from "./scenarioLock";

describe("canAcquireLock", () => {
  const now = 1_000_000_000;
  it("acquires when there is no lock or no lockedAt", () => {
    expect(canAcquireLock(null, now)).toBe(true);
    expect(canAcquireLock(undefined, now)).toBe(true);
    expect(canAcquireLock({ lockedAt: null }, now)).toBe(true);
  });
  it("does NOT acquire when a fresh lock is held", () => {
    expect(canAcquireLock({ lockedAt: now - 1000 }, now)).toBe(false);
    expect(canAcquireLock({ lockedAt: now - (SCENARIO_LOCK_TTL_MS - 1) }, now)).toBe(false);
  });
  it("takes over a STALE lock (holder crashed)", () => {
    expect(canAcquireLock({ lockedAt: now - (SCENARIO_LOCK_TTL_MS + 1) }, now)).toBe(true);
  });
});

describe("shouldRerun", () => {
  it("is true only when a rerun was requested during the run", () => {
    expect(shouldRerun({ lockedAt: 1, rerunRequested: true })).toBe(true);
    expect(shouldRerun({ lockedAt: 1, rerunRequested: false })).toBe(false);
    expect(shouldRerun({ lockedAt: 1 })).toBe(false);
    expect(shouldRerun(null)).toBe(false);
  });
});
