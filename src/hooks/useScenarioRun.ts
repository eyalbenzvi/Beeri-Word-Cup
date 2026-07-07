import { useState, useCallback, useRef, useEffect } from "react";
import type { ScenarioRunResult } from "../utils/scenarioSim";
import {
  subscribeScenarioRun,
  triggerScenarioRecompute,
  saveScenarioRun,
} from "../store";
import { useAllPredictions, useMatchResults, useActualBonuses } from "./useStore";

// Read-only access to the scenario run (gameData/scenarioRun). Two ways the doc
// gets (re)computed:
//   1. SERVER (primary): the Netlify background function recomputes it
//      automatically after every result entry, and an admin can poke it.
//   2. LOCAL (admin fallback): the admin runs the same Monte-Carlo simulation
//      in-browser (off the main thread via scenarioWorker) and writes the SAME
//      doc directly. This is the backup for when the background function isn't
//      available/operational — see CLAUDE.md / scenarioRepo.saveScenarioRun.
//
// Either way the client SUBSCRIBES to the doc, so the view auto-refreshes the
// instant a new run lands — no source-specific branch in the table.

export type ScenarioDataState = {
  loading: boolean;
  result: ScenarioRunResult | null;
  error: boolean;
};

// Local in-browser run progress (separate from the subscription's `loading`,
// which only reflects the initial doc read). The computed result still surfaces
// via the subscription once saveScenarioRun lands, so this only drives the
// progress bar + failure messaging.
export type LocalRunState = {
  running: boolean;
  percent: number;
  error: boolean; // the worker/compute itself failed
  saveError: boolean; // computed OK but persisting to Firestore failed
};

// Admin run-count bounds (kept in lockstep with the background function's
// clamp). Surfaced here so the admin UI's input can advertise the same range.
// DEFAULT_SIM_COUNT is the admin recompute INPUT default (manual runs).
export const DEFAULT_SIM_COUNT = 100000;
export const MIN_SIM_COUNT = 1000;
export const MAX_SIM_COUNT = 200000;
// What the SERVER runs automatically after every result entry. Display-only
// here; the source of truth is the background function's DEFAULT_SIM_COUNT —
// keep these two in lockstep.
export const AUTO_SIM_COUNT = 35000;
// A FIXED default seed makes a local run reproducible/auditable: re-running on
// the same inputs yields the same numbers. Mirrors the simulator default.
const DEFAULT_SEED = 0x9e3779b9;

export function useScenarioData(): {
  state: ScenarioDataState;
  recompute: (simCount?: number) => void;
  computeLocal: (simCount?: number, bonusesOverride?: any) => void;
  local: LocalRunState;
} {
  const [state, setState] = useState<ScenarioDataState>({
    loading: true,
    result: null,
    error: false,
  });

  // Inputs for the LOCAL path. After predictions lock (or for an admin) the
  // store already holds every form, so the in-browser simulation has the same
  // inputs the server would read.
  const allPredictions = useAllPredictions();
  const results = useMatchResults();
  const actualBonuses = useActualBonuses();

  const workerRef = useRef<Worker | null>(null);
  const mountedRef = useRef(true);
  const [local, setLocal] = useState<LocalRunState>({
    running: false,
    percent: 0,
    error: false,
    saveError: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const unsub = subscribeScenarioRun(
      (run) => active && setState({ loading: false, result: run, error: false }),
      () => active && setState((s) => ({ ...s, loading: false, error: true })),
    );
    return () => {
      active = false;
      mountedRef.current = false;
      unsub();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const clampCount = (simCount?: number) =>
    Math.min(
      MAX_SIM_COUNT,
      Math.max(MIN_SIM_COUNT, Math.round(simCount || DEFAULT_SIM_COUNT)),
    );

  // Admin-only convenience: kick a SERVER recompute, optionally with a custom
  // run count. The subscription will pick up the new run automatically once the
  // (~3 min) job finishes.
  const recompute = useCallback((simCount?: number) => {
    triggerScenarioRecompute(simCount);
  }, []);

  // Admin-only LOCAL fallback: run the Monte-Carlo simulation in-browser and
  // persist the result. The view refreshes via the subscription once the save
  // lands. Worker construction / structured-clone of the (large) payload can
  // throw synchronously, so the whole start is guarded — without it the UI
  // would be stuck on the progress bar forever (CLAUDE.md failure-path rule).
  // `bonusesOverride` lets the caller run with an actualBonuses value it JUST
  // saved (e.g. the top-scorer sim config) without waiting for the store
  // listener round-trip to refresh this hook's snapshot.
  const computeLocal = useCallback(
    (simCount?: number, bonusesOverride?: any) => {
      const count = clampCount(simCount);
      workerRef.current?.terminate();
      setLocal({ running: true, percent: 0, error: false, saveError: false });

      const fail = () => {
        if (!mountedRef.current) return;
        setLocal({ running: false, percent: 0, error: true, saveError: false });
        workerRef.current?.terminate();
        workerRef.current = null;
      };

      try {
        const worker = new Worker(
          new URL("../workers/scenarioWorker.ts", import.meta.url),
          { type: "module" },
        );
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent) => {
          const { type } = e.data;
          if (type === "progress") {
            const pct = e.data.total
              ? Math.round((e.data.done / e.data.total) * 100)
              : 0;
            if (mountedRef.current) setLocal((s) => ({ ...s, percent: pct }));
          } else if (type === "result") {
            const result = e.data.result as ScenarioRunResult;
            worker.terminate();
            workerRef.current = null;
            if (mountedRef.current) setLocal((s) => ({ ...s, percent: 100 }));
            // Persist and SURFACE failure — the admin must not believe a long
            // run was saved when it wasn't (it would silently vanish: the
            // subscription would keep showing the old/empty doc).
            saveScenarioRun(result).then((ok) => {
              if (mountedRef.current)
                setLocal({ running: false, percent: 100, error: false, saveError: !ok });
            });
          } else if (type === "error") {
            fail();
          }
        };
        worker.onerror = fail;

        worker.postMessage({
          allPredictions,
          results,
          actualBonuses: bonusesOverride ?? actualBonuses,
          simCount: count,
          seed: DEFAULT_SEED,
        });
      } catch {
        fail();
      }
    },
    [allPredictions, results, actualBonuses],
  );

  return { state, recompute, computeLocal, local };
}
