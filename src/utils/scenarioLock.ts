// Pure decision logic for the server-side scenario-recompute lock, extracted
// so the concurrency rules are unit-testable without Firestore.
//
// The recompute is triggered after every result entry. Runs are expensive
// (the automatic run is ~3 min for 35k sims; an admin can request up to 200k),
// so at most ONE runs at a time. The lock doc lives at
// gameData/scenarioLock = { lockedAt: number|null, rerunRequested: boolean }.
//
//   - A trigger that finds the lock free (or STALE — held longer than the TTL,
//     meaning the holder probably crashed) acquires it and runs.
//   - A trigger that finds a fresh lock does NOT run; it sets rerunRequested so
//     the active run knows newer results arrived and re-runs once on finish.
// This collapses a burst of result entries into "run now + one more run after",
// always converging on the latest data without piling up concurrent runs.

// TTL window for a held lock. It must sit ABOVE the realistic run time of the
// automatic 35k run (≈3 min) so a still-running job is never reclaimed mid-run,
// and BELOW Netlify's 15-min background-function hard kill so a crashed/killed
// holder is always reclaimable by the next poke (otherwise the lock would wedge
// recompute forever). 10 min satisfies both. NOTE: an admin-requested run near
// MAX_SIM_COUNT (200k ≈ 16 min) can exceed BOTH this TTL and the Netlify kill;
// such a run would be killed and its lock later reclaimed as stale.
export const SCENARIO_LOCK_TTL_MS = 10 * 60 * 1000;

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
