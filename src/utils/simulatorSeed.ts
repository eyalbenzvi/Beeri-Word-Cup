// One-shot hand-off channel from the best-case panel to the simulator.
//
// The best-case optimizer (Leaderboard → BestCasePanel) produces a full
// results scenario that lands a form at its highest achievable rank. To let
// the user then *explore* that scenario — tweak individual results and watch
// the whole leaderboard react — we transfer those results into the shared
// SimulatorPanel and navigate to the Simulator page.
//
// Navigation params are string/number only (see useNavigation.buildURL), so a
// full results map can't ride the URL. We hand it off through a tiny
// module-level holder instead — idiomatic here (mirrors bracketCache's
// module-scoped cache). It is intentionally in-memory: a page reload clears it,
// which matches the simulator's own contract ("changes are not saved and are
// cleared on refresh"). The seed is *taken* (read-and-cleared) so it is applied
// exactly once by the first simulator that mounts and opts in.

type SeedResults = Record<string, any>;

let pendingSeed: SeedResults | null = null;

// Stash a scenario for the next simulator mount. Passing an empty/nullish map
// clears any pending seed so a stale scenario can't leak into a later,
// unrelated navigation.
export function setSimulatorSeed(seed: SeedResults | null | undefined): void {
  pendingSeed = seed && Object.keys(seed).length > 0 ? seed : null;
}

// Read-and-clear. Returns the pending scenario (or null) and drops it so it is
// consumed exactly once — a second mount, or a re-render, gets nothing.
export function takeSimulatorSeed(): SeedResults | null {
  const s = pendingSeed;
  pendingSeed = null;
  return s;
}

// Non-destructive check — does not consume the seed.
export function hasSimulatorSeed(): boolean {
  return pendingSeed != null;
}

// Round ordering used to jump the simulator's stage selector to the first
// seeded match so the loaded scenario is visible without hunting.
const SEED_STAGE_ORDER = ["group", "R32", "R16", "QF", "SF", "3RD", "F"];

// Given a seeded override map, find the earliest round (and group, for group
// matches) that carries a result.
export function pickFirstSeededStage(
  seed: SeedResults,
): { stage: string; group: string | null } | null {
  let best: { stage: string; group: string | null } | null = null;
  let bestIdx = Infinity;
  for (const entry of Object.values(seed)) {
    const stage = (entry as any)?.stage || "group";
    const idx = SEED_STAGE_ORDER.indexOf(stage);
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      best = { stage, group: stage === "group" ? (entry as any)?.group || null : null };
    }
  }
  return best;
}
