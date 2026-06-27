import { useState, useCallback, useRef, useEffect } from "react";
import type { ScenarioRunResult } from "../utils/scenarioSim";
import { useAllPredictions, useMatchResults, useActualBonuses } from "./useStore";
import { saveScenarioRun, loadScenarioRun } from "../store";

// Default run size. 50,000 sims ≈ ~2 min single-threaded in the worker. A FIXED
// default seed makes a run reproducible/auditable: re-running on the same
// results yields the same numbers. The stored seed lives in result.meta.seed.
export const DEFAULT_SIM_COUNT = 50000;
export const MIN_SIM_COUNT = 1000;
export const MAX_SIM_COUNT = 200000;
const DEFAULT_SEED = 0x9e3779b9;

export type RunOptions = { simCount: number; useBetting: boolean };

// Fetch outright betting odds → implied champion probabilities. Soft: any
// failure (no key, network, disabled) yields {} → the simulator uses pure Elo.
async function fetchBettingOdds(): Promise<Record<string, number>> {
  try {
    const res = await fetch("/.netlify/functions/get-betting-odds");
    if (!res.ok) return {};
    const data = await res.json();
    const probs = data?.impliedProbs;
    return probs && typeof probs === "object" ? probs : {};
  } catch {
    return {};
  }
}

export type ScenarioRunState = {
  loading: boolean;
  percent: number;
  result: ScenarioRunResult | null;
  error: boolean;
  loadedFromStore: boolean; // result came from a previous persisted run
  saveError: boolean; // computed OK but persisting to Firestore failed
  bettingUnavailable: boolean; // betting was requested but no odds were available
};

export function useScenarioRun(): {
  state: ScenarioRunState;
  compute: (opts: RunOptions) => void;
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
    saveError: false,
    bettingUnavailable: false,
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
    safeSet({ loading: false, percent: 0, result: null, error: false, loadedFromStore: false, saveError: false, bettingUnavailable: false });
  }, [safeSet]);

  const compute = useCallback((opts: RunOptions) => {
    const simCount = Math.min(MAX_SIM_COUNT, Math.max(MIN_SIM_COUNT, Math.round(opts.simCount || DEFAULT_SIM_COUNT)));
    workerRef.current?.terminate();
    safeSet({ loading: true, percent: 0, result: null, error: false, loadedFromStore: false, saveError: false, bettingUnavailable: false });

    let worker: Worker;
    const fail = () => {
      safeSet({ loading: false, percent: 0, result: null, error: true, loadedFromStore: false, saveError: false, bettingUnavailable: false });
      worker?.terminate();
      workerRef.current = null;
    };

    // Worker construction or the structured-clone of the (large) payload can
    // throw synchronously; without this guard the UI would be stuck on the
    // progress bar forever (see CLAUDE.md failure-path rule). Betting odds are
    // fetched first (async); any failure falls back to pure Elo.
    (async () => {
      const oddsImpliedProbs = opts.useBetting ? await fetchBettingOdds() : {};
      const bettingUnavailable = opts.useBetting && Object.keys(oddsImpliedProbs).length === 0;
      if (!mountedRef.current) return;
      safeSet((s) => ({ ...s, bettingUnavailable }));

      try {
        worker = new Worker(new URL("../workers/scenarioWorker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent) => {
          const { type } = e.data;
          if (type === "progress") {
            const pct = e.data.total ? Math.round((e.data.done / e.data.total) * 100) : 0;
            safeSet((s) => ({ ...s, percent: pct }));
          } else if (type === "result") {
            const result = e.data.result as ScenarioRunResult;
            safeSet((s) => ({ ...s, loading: false, percent: 100, result, error: false, loadedFromStore: false, saveError: false }));
            worker.terminate();
            workerRef.current = null;
            // Persist and SURFACE failure — the admin must not believe a
            // 2-minute run was saved when it wasn't (it would silently vanish
            // on reload).
            saveScenarioRun(result).then((ok) =>
              safeSet((s) => ({ ...s, saveError: !ok })),
            );
          } else if (type === "error") {
            fail();
          }
        };
        worker.onerror = fail;

        worker.postMessage({ allPredictions, results, actualBonuses, simCount, seed: DEFAULT_SEED, oddsImpliedProbs });
      } catch {
        fail();
      }
    })();
  }, [allPredictions, results, actualBonuses, safeSet]);

  return { state, compute, reset };
}
