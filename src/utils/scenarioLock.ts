// Pure decision logic for the server-side scenario-recompute lock, extracted
// so the concurrency rules are unit-testable without Firestore.
//
// The recompute is triggered after every result entry. Runs are expensive
// (~3 min for 100k sims), so at most ONE runs at a time. The lock doc lives at
// gameData/scenarioLock = { lockedAt: number|null, rerunRequested: boolean }.
//
//   - A trigger that finds the lock free (or STALE — held longer than the TTL,
//     meaning the holder probably crashed) acquires it and runs.
//   - A trigger that finds a fresh lock does NOT run; it sets rerunRequested so
//     the active run knows newer results arrived and re-runs once on finish.
// This collapses a burst of result entries into "run now + one more run after",
// always converging on the latest data without piling up concurrent runs.

export const SCENARIO_LOCK_TTL_MS = 20 * 60 * 1000; // > worst-case run time

export type ScenarioLock = { lockedAt: number | null; rerunRequested?: boolean };

// May this trigger acquire the lock and run now?
export function canAcquireLock(
  lock: ScenarioLock | null | undefined,
  now: number,
  ttlMs: number = SCENARIO_LOCK_TTL_MS,
): boolean {
  if (!lock || !lock.lockedAt) return true; // free
  return now - lock.lockedAt > ttlMs; // stale → take over
}

// After a run finishes, should we immediately trigger another (because newer
// results arrived while we were computing)?
export function shouldRerun(lock: ScenarioLock | null | undefined): boolean {
  return !!lock && lock.rerunRequested === true;
}
