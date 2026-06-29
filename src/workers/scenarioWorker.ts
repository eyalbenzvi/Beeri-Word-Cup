/// <reference lib="webworker" />
// Runs the Monte-Carlo scenario simulation off the main thread so the admin
// UI stays responsive during the ~1–2 minute run. Mirrors the bestCaseWorker
// pattern: post {type:"progress"} ticks, then a single {type:"result"}.
import { runScenarioSimulation } from "../utils/scenarioSim";

self.onmessage = (e: MessageEvent) => {
  const { allPredictions, results, actualBonuses, simCount, seed } = e.data;
  try {
    const result = runScenarioSimulation({
      allPredictions,
      results,
      actualBonuses,
      simCount,
      seed,
      onProgress: (done, total) =>
        self.postMessage({ type: "progress", done, total }),
    });
    self.postMessage({ type: "result", result });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};
