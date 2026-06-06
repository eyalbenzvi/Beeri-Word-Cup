// Dependency-free indirection for the auto-fill trigger.
//
// The real implementation (maybeTriggerAutoFill) lives in the store and pulls
// in Firebase + the auth token + fetch. Pure compute utilities (scoring.ts,
// bracket.ts) are imported directly by the ~2340-test node harness, which has
// no Firebase/browser environment. To let those modules "poke" the auto-fill
// check at the top of their main compute without dragging Firebase into the
// pure layer (and breaking every test), they call triggerAutoFillCheck() here.
//
// The store registers the real implementation via registerAutoFillTrigger()
// at app init. Until registration (and always in the test environment) this is
// a no-op, so the compute functions stay pure and side-effect-free for tests.

type TriggerFn = () => void;

let registered: TriggerFn | null = null;

export function registerAutoFillTrigger(fn: TriggerFn): void {
  registered = fn;
}

// Cheap, never-throwing. Safe to call from the hot path of a computation.
export function triggerAutoFillCheck(): void {
  if (!registered) return;
  try {
    registered();
  } catch {
    // A computation must never break because of an opportunistic side effect.
  }
}
