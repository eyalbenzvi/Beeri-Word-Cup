import { useState, useCallback, useRef, useEffect } from "react";
import type { ScenarioRunResult } from "../utils/scenarioSim";
import { subscribeScenarioRun, triggerScenarioRecompute } from "../store";

// Read-only access to the SERVER-computed scenario run (gameData/scenarioRun),
// which is recomputed automatically after every result entry. The client never
// runs the simulation — it subscribes so the view auto-refreshes the instant the
// server writes a new run (no stale numbers after a result). Admins can poke a
// recompute, but normally it happens on its own.

export type ScenarioDataState = {
  loading: boolean;
  result: ScenarioRunResult | null;
  error: boolean;
};

export function useScenarioData(): {
  state: ScenarioDataState;
  recompute: () => void;
} {
  const [state, setState] = useState<ScenarioDataState>({
    loading: true,
    result: null,
    error: false,
  });

  useEffect(() => {
    let active = true;
    const unsub = subscribeScenarioRun(
      (run) => active && setState({ loading: false, result: run, error: false }),
      () => active && setState((s) => ({ ...s, loading: false, error: true })),
    );
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Admin-only convenience: kick a server recompute. The subscription will pick
  // up the new run automatically once the (~3 min) job finishes.
  const recompute = useCallback(() => {
    triggerScenarioRecompute();
  }, []);

  return { state, recompute };
}
