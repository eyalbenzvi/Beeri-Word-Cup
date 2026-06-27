import { useState, useCallback, useRef, useEffect } from "react";
import type { ScenarioRunResult } from "../utils/scenarioSim";
import { loadScenarioRun, triggerScenarioRecompute } from "../store";

// Read-only access to the SERVER-computed scenario run (gameData/scenarioRun),
// which is recomputed automatically after every result entry. The client never
// runs the simulation anymore — it just loads the latest summary. Admins can
// poke a recompute, but normally it happens on its own.

export type ScenarioDataState = {
  loading: boolean;
  result: ScenarioRunResult | null;
  error: boolean;
};

export function useScenarioData(): {
  state: ScenarioDataState;
  refresh: () => void;
  recompute: () => void;
} {
  const mountedRef = useRef(true);
  const [state, setState] = useState<ScenarioDataState>({
    loading: true,
    result: null,
    error: false,
  });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    loadScenarioRun()
      .then((run) => {
        if (!mountedRef.current) return;
        setState({ loading: false, result: run, error: false });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setState({ loading: false, result: null, error: true });
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Admin-only convenience: kick a server recompute, then (optimistically) the
  // admin can refresh in ~a few minutes to see the new run.
  const recompute = useCallback(() => {
    triggerScenarioRecompute();
  }, []);

  return { state, refresh: load, recompute };
}
