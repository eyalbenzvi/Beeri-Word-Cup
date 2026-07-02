// Worker lifecycle for the personal competition-analysis run.
//
// Modeled on useScenarioRun.computeLocal + useBestCase:
//   - Worker construction and postMessage are wrapped in try/catch (a chunk
//     that fails to load in production must degrade, not throw)
//   - worker.onerror → failed
//   - WATCHDOG: no message for 45s → terminate + failed (never an eternal
//     spinner — CLAUDE.md failure-path rule)
//   - terminated on unmount / input change
//   - NO main-thread fallback: a multi-second main-thread burn on mobile is
//     worse than degrading to the deterministic sections (the same call the
//     best-case panel made — see bestCase "fallback-skipped-heavy" history)
//
// A module-level cache keyed by the (stable) store references lets the page
// re-open instantly in the same session; a new match result produces new
// store references and naturally invalidates it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonalAnalysisAggregate } from "../utils/personalAnalysis";
import { TARGET_SIMS, DEFAULT_ANALYSIS_SEED } from "../utils/personalAnalysis";
import { captureClientError } from "../sentry";

export type PersonalAnalysisState = {
  running: boolean;
  failed: boolean;
  // Latest cumulative snapshot (first paint after ~1 chunk); refined until done.
  agg: PersonalAnalysisAggregate | null;
  done: boolean;
};

type CacheEntry = {
  allPredictions: any;
  results: any;
  targetKey: string;
  agg: PersonalAnalysisAggregate;
};
let lastCompleted: CacheEntry | null = null;

const WATCHDOG_MS = 45000;

export function usePersonalAnalysis(opts: {
  allPredictions: Record<string, any>;
  results: Record<string, any>;
  actualBonuses: any;
  targetFormIds: string[];
  watchMatches: { id: string; isKnockout: boolean }[];
  enabled: boolean;
}): PersonalAnalysisState & { retry: () => void } {
  const { allPredictions, results, actualBonuses, targetFormIds, watchMatches, enabled } = opts;
  const targetKey = targetFormIds.join(",");

  const cached =
    lastCompleted &&
    lastCompleted.allPredictions === allPredictions &&
    lastCompleted.results === results &&
    lastCompleted.targetKey === targetKey
      ? lastCompleted.agg
      : null;

  const [state, setState] = useState<PersonalAnalysisState>(() => ({
    running: false,
    failed: false,
    agg: cached,
    done: !!cached,
  }));
  const workerRef = useRef<Worker | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || targetFormIds.length === 0) {
      // A disabled feature must never be left looking "running" (e.g. the
      // admin flips the flag off mid-run — the page swaps to its gate, but
      // the state must not strand a spinner if it comes back).
      setState((s) => (s.running ? { ...s, running: false } : s));
      return undefined;
    }
    if (cached && nonce === 0) return undefined; // session cache hit

    let active = true;
    setState({ running: true, failed: false, agg: null, done: false });

    const fail = (err?: unknown) => {
      if (err) {
        try {
          captureClientError(
            err instanceof Error ? err : new Error(String(err)),
            { feature: "competitionAnalysis", stage: "worker" },
          );
        } catch {
          // reporting must never break the degrade path
        }
      }
      if (active) setState((s) => ({ ...s, running: false, failed: true }));
      cleanup();
    };

    const cleanup = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
    };

    const armWatchdog = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => fail(new Error("analysis-watchdog-timeout")), WATCHDOG_MS);
    };

    try {
      const worker = new Worker(
        new URL("../workers/personalAnalysisWorker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      armWatchdog();

      worker.onmessage = (e: MessageEvent) => {
        const { type } = e.data;
        if (type === "partial") {
          armWatchdog();
          if (active) setState({ running: true, failed: false, agg: e.data.agg, done: false });
        } else if (type === "done") {
          const agg = e.data.agg as PersonalAnalysisAggregate;
          lastCompleted = { allPredictions, results, targetKey, agg };
          if (active) setState({ running: false, failed: false, agg, done: true });
          cleanup();
        } else if (type === "error") {
          fail(new Error(e.data.message || "analysis-worker-error"));
        }
      };
      worker.onerror = (e) => fail(e?.message || new Error("analysis-worker-onerror"));

      worker.postMessage({
        allPredictions,
        results,
        actualBonuses,
        targetFormIds,
        watchMatches,
        simCount: TARGET_SIMS,
        seed: DEFAULT_ANALYSIS_SEED,
      });
    } catch (err) {
      fail(err);
    }

    return () => {
      active = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, allPredictions, results, actualBonuses, targetKey, nonce]);

  return { ...state, retry };
}
