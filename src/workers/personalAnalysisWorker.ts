/// <reference lib="webworker" />
// Runs the personal competition-analysis Monte-Carlo off the main thread.
// Mirrors the scenarioWorker pattern: cumulative {type:"partial"} snapshots
// after every chunk (the UI paints on the first one), then {type:"done"}.
// Any throw is caught and reported as {type:"error"} — the hook degrades the
// page to its deterministic sections, never an eternal spinner.
import { runPersonalAnalysis } from "../utils/personalAnalysis";

// Wall-clock budget: on slow devices we stop refining once exceeded — the
// last posted snapshot is the final one (still ≥ first-paint quality).
const WALL_CLOCK_BUDGET_MS = 30000;

self.onmessage = (e: MessageEvent) => {
  const {
    allPredictions,
    results,
    actualBonuses,
    targetFormIds,
    watchMatches,
    simCount,
    seed,
  } = e.data;
  try {
    const startedAt = Date.now();
    const final = runPersonalAnalysis({
      allPredictions,
      results,
      actualBonuses,
      targetFormIds,
      watchMatches,
      simCount,
      seed,
      onChunk: (agg, done, total) => {
        self.postMessage({ type: "partial", agg, done, total });
        return Date.now() - startedAt < WALL_CLOCK_BUDGET_MS;
      },
    });
    self.postMessage({ type: "done", agg: final });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};
