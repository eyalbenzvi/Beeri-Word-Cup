import { useState, useCallback, useRef, useEffect } from "react";
import type { ScenarioRunResult } from "../utils/scenarioSim";
import { useAllPredictions, useMatchResults, useActualBonuses } from "./useStore";
import { saveScenarioRun, loadScenarioRun } from "../store";

// Default run size. 50,000 sims ≈ ~2 min single-threaded in the worker (see
// the benchmark in the design discussion). A FIXED default seed makes a run
// reproducible/auditable: re-running on the same results yields the same
// numbers. The stored seed lives in result.meta.seed.
const DEFAULT_SIM_COUNT = 50000;
const DEFAULT_SEED = 0x9e3779b9;

export type ScenarioRunState = {
  loading: boolean;
  percent: number;
  result: ScenarioRunResult | null;
  error: boolean;
  loadedFromStore: boolean; // result came from a previous persisted run
};

export function useScenarioRun(simCount: number = DEFAULT_SIM_COUNT): {
  state: ScenarioRunState;
  compute: () => void;
  reset: () => void;
} {
  const allPredictions = useAllPredictions();
  const results = useMatchResults();
  const actualBonuses = useActualBonuses();

  const workerRef = useRef<Worker | null>(null);
  const mountedRef = useRef(true);

  const [state, setState] = useState<ScenarioRunState>({
    loading: false,
    percent: 0,
    result: null,
    error: false,
    loadedFromStore: false,
  });

  const safeSet = useCallback(
    (u: ScenarioRunState | ((s: ScenarioRunState) => ScenarioRunState)) => {
      if (mountedRef.current) setState(u as any);
    },
    [],
  );

  // Load any previously persisted run on mount (one-off read), so the admin
  // sees the last computation without re-running. Never clobbers an in-flight
  // or just-finished local run.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    loadScenarioRun().then((run) => {
      if (cancelled || !run) return;
      safeSet((s) =>
        s.result || s.loading
          ? s
          : { ...s, result: run, loadedFromStore: true },
      );
    });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [safeSet]);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    safeSet({ loading: false, percent: 0, result: null, error: false, loadedFromStore: false });
  }, [safeSet]);

  const compute = useCallback(() => {
    workerRef.current?.terminate();
    safeSet({ loading: true, percent: 0, result: null, error: false, loadedFromStore: false });

    const worker = new Worker(
      new URL("../workers/scenarioWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const fail = () => {
      safeSet({ loading: false, percent: 0, result: null, error: true, loadedFromStore: false });
      worker.terminate();
      workerRef.current = null;
    };

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;
      if (type === "progress") {
        const pct = e.data.total ? Math.round((e.data.done / e.data.total) * 100) : 0;
        safeSet((s) => ({ ...s, percent: pct }));
      } else if (type === "result") {
        const result = e.data.result as ScenarioRunResult;
        safeSet({ loading: false, percent: 100, result, error: false, loadedFromStore: false });
        worker.terminate();
        workerRef.current = null;
        // Persist (fire-and-forget; admin-gated inside).
        saveScenarioRun(result);
      } else if (type === "error") {
        fail();
      }
    };
    worker.onerror = fail;

    worker.postMessage({
      allPredictions,
      results,
      actualBonuses,
      simCount,
      seed: DEFAULT_SEED,
    });
  }, [allPredictions, results, actualBonuses, simCount, safeSet]);

  return { state, compute, reset };
}
