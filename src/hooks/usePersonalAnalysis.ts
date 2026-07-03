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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Small LRU of completed runs. One slot is not enough anymore: the key now
// carries the selected foreign form and the head-to-head rival, so toggling
// a rival (or hopping my-form ↔ another form) alternates between keys — a
// single slot would evict on every hop and rerun 20k sims for a result
// computed seconds earlier.
const CACHE_MAX = 8;
const completedRuns = new Map<string, PersonalAnalysisAggregate>();
function cacheGet(key: string): PersonalAnalysisAggregate | null {
  const hit = completedRuns.get(key);
  if (hit) {
    completedRuns.delete(key);
    completedRuns.set(key, hit); // refresh recency
  }
  return hit || null;
}
function cachePut(key: string, agg: PersonalAnalysisAggregate): void {
  completedRuns.delete(key);
  completedRuns.set(key, agg);
  while (completedRuns.size > CACHE_MAX) {
    completedRuns.delete(completedRuns.keys().next().value as string);
  }
}

const WATCHDOG_MS = 45000;

// Cheap CONTENT signature of the sim inputs. The store's onSnapshot handlers
// reassign cache slices on every (re)delivery — a fresh reference even when
// nothing changed (e.g. the server confirmation right after a cached read) —
// so keying the run on reference identity would tear down and restart a
// 20k-sim run for a no-op redelivery. Content keys make the run restart only
// when a result/bonus actually changes. Predictions are locked mid-tournament
// (immutable content), so their signature is just the form-id set.
function inputsKey(
  allPredictions: Record<string, any>,
  results: Record<string, any>,
  actualBonuses: any,
  targetKey: string,
): string {
  const formsKey = Object.keys(allPredictions || {}).sort().join(",");
  const resultsKey = Object.keys(results || {})
    .sort()
    .map((id) => {
      const r = results[id] || {};
      return `${id}:${r.homeScore ?? ""}-${r.awayScore ?? ""}-${r.advancingTeam ?? ""}`;
    })
    .join("|");
  let bonusesKey = "";
  try {
    bonusesKey = JSON.stringify(actualBonuses ?? null);
  } catch {
    bonusesKey = "?";
  }
  return `${targetKey}#${formsKey}#${resultsKey}#${bonusesKey}`;
}

export function usePersonalAnalysis(opts: {
  allPredictions: Record<string, any>;
  results: Record<string, any>;
  actualBonuses: any;
  targetFormIds: string[];
  // Head-to-head rival (adds `beat` counters to the aggregate). Part of the
  // cache key — switching rivals restarts the run.
  rivalFormId?: string | null;
  watchMatches: { id: string; isKnockout: boolean }[];
  enabled: boolean;
}): PersonalAnalysisState & { retry: () => void } {
  const { allPredictions, results, actualBonuses, targetFormIds, watchMatches, enabled } = opts;
  const rivalFormId = opts.rivalFormId || null;
  const targetKey = `${targetFormIds.join(",")}~${rivalFormId || ""}`;

  // Recomputed only when a store reference rotates (cheap), yielding a
  // stable string that changes only on real content changes.
  const cacheKey = useMemo(
    () => inputsKey(allPredictions, results, actualBonuses, targetKey),
    [allPredictions, results, actualBonuses, targetKey],
  );

  const cached = cacheGet(cacheKey);

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
    if (cached && nonce === 0) {
      // Session cache hit — also on a key SWITCH while mounted (LRU), so the
      // state must be synced to the hit, not left on the previous key's agg.
      setState({ running: false, failed: false, agg: cached, done: true });
      return undefined;
    }

    let active = true;
    // Keep the previous aggregate on screen while the new run spins up: a
    // rival toggle or form hop must not blank the verdict/root-for sections
    // (consumers re-derive their target index / rival echo from the agg, so
    // a kept snapshot can render stale-but-valid content, never wrong-key
    // content). A brand-new mount has no previous agg anyway.
    setState((s) => ({ running: true, failed: false, agg: s.agg, done: false }));

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
          cachePut(cacheKey, agg);
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
        rivalFormId,
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
    // Keyed on the CONTENT signature (cacheKey), not the raw store
    // references — see inputsKey. The raw slices are read from the closure
    // when the run actually starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cacheKey, nonce]);

  return { ...state, retry };
}
