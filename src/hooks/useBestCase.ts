import { useState, useCallback, useRef, useEffect } from "react";
import type { BestCaseResult } from "../utils/bestCase";
import { sanitizeFormsForWorker, sanitizeResultsForWorker } from "../utils/bestCase";
import { useAllPredictions, useMatchResults, useSettings } from "./useStore";
import { captureClientError, captureClientMessage } from "../sentry";

type Phase =
  | "idle"
  | "prep"
  | "group"
  | "knockout"
  | "refine"
  | "rank"
  | "done"
  | "error";

const PHASE_LABELS: Record<Phase, string> = {
  idle: "",
  prep: "מכין נתונים…",
  group: "מנתח שלב הבתים…",
  knockout: "מנתח שלב הנוקאאוט…",
  refine: "משפר תוצאה…",
  rank: "מחשב דירוג…",
  done: "הושלם",
  error: "שגיאה בחישוב",
};

export type BestCaseState = {
  loading: boolean;
  phase: Phase;
  phaseLabel: string;
  percent: number;
  result: BestCaseResult | null;
  error: boolean;
};

export function useBestCase(formId: string | null): {
  state: BestCaseState;
  compute: () => void;
  reset: () => void;
  available: boolean;
} {
  const allForms = useAllPredictions();
  const matchResults = useMatchResults();
  const settings = useSettings();
  // Gate: the optimizer is offered only when the site admin flips the
  // `bestCaseEnabled` switch (Admin → settings). It is meant to be turned on
  // once the group stage is complete — running it earlier is both meaningless
  // and prohibitively slow — but the timing is now an admin decision rather
  // than an automatic check. Before the settings listener loads, the flag is
  // undefined → unavailable, the safe default (no flash of an enabled button
  // while data is still in flight).
  const available = settings?.bestCaseEnabled === true;
  const workerRef = useRef<Worker | null>(null);
  // Tracks whether the component is still mounted — guards every async
  // setState inside the worker handlers against post-unmount calls
  // (React 18 strict-mode double-invoke or rapid navigation).
  const mountedRef = useRef(true);

  const [state, setState] = useState<BestCaseState>({
    loading: false,
    phase: "idle",
    phaseLabel: "",
    percent: 0,
    result: null,
    error: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const safeSetState = useCallback(
    (updater: BestCaseState | ((s: BestCaseState) => BestCaseState)) => {
      if (mountedRef.current) setState(updater as any);
    },
    [],
  );

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    safeSetState({
      loading: false,
      phase: "idle",
      phaseLabel: "",
      percent: 0,
      result: null,
      error: false,
    });
  }, [safeSetState]);

  const compute = useCallback(() => {
    // `available` is re-checked here (not just at the button) so any other
    // caller — e.g. the error-state retry — is equally gated.
    if (!formId || !available) return;

    // Terminate any prior worker
    workerRef.current?.terminate();

    // Project the store data down to a plain, structured-cloneable, JSON-safe
    // shape BEFORE it touches either the worker (postMessage) or the fallback.
    // Two reasons: (1) it guarantees the worker and the main-thread fallback
    // score BYTE-IDENTICAL inputs; (2) defense-in-depth — the raw maps come
    // straight off Firestore (`docSnap.data()`), and while the current data
    // model is all JSON-safe (timestamps are stored as ISO strings), a future
    // or legacy field carrying a non-cloneable value would otherwise throw a
    // DataCloneError on postMessage. This is NOT a confirmed diagnosis of the
    // observed every-run failure — the likelier cause is the worker chunk
    // failing to load in production; watch the `bestcase-worker-fallback`
    // Sentry signal (with its `kind`) to confirm which. See bestCase.ts.
    const safeForms = sanitizeFormsForWorker(allForms);
    const safeResults = sanitizeResultsForWorker(matchResults);

    safeSetState({
      loading: true,
      phase: "prep",
      phaseLabel: PHASE_LABELS.prep,
      percent: 0,
      result: null,
      error: false,
    });

    // Typed to match `ProgressCallback` (phase: string) so it can be passed
    // straight to `computeBestCase` in the main-thread fallback; the worker's
    // phases are a subset of `Phase`, narrowed here for the label lookup.
    const onProgress = (phase: string, percent: number) =>
      safeSetState((s) => ({
        ...s,
        phase: phase as Phase,
        phaseLabel: PHASE_LABELS[phase as Phase] ?? s.phaseLabel,
        percent,
      }));

    const succeed = (result: BestCaseResult) =>
      safeSetState({
        loading: false,
        phase: "done",
        phaseLabel: PHASE_LABELS.done,
        percent: 100,
        result,
        error: false,
      });

    const showError = () =>
      safeSetState({
        loading: false,
        phase: "error",
        phaseLabel: PHASE_LABELS.error,
        percent: 0,
        result: null,
        error: true,
      });

    // Guards against double-settling (a worker can fire both `onerror` and a
    // terminal message, and the fallback must not race the worker).
    let settled = false;

    // Main-thread fallback for when the worker path fails. `kind` classifies WHY
    // so production telemetry can tell apart the cases (crucial — the reviewer
    // flagged that an every-run failure most likely means the worker CHUNK never
    // loads, not that anything is wrong with the inputs):
    //   • "load-failure"       — worker.onerror: the module chunk failed to
    //                            load/parse (stale deploy, MIME, in-app WebView).
    //                            This is the prime suspect for the reported bug.
    //   • "runtime-error"      — the worker ran but computeBestCase threw.
    //   • "construct-failure"  — `new Worker()` threw synchronously.
    //   • "postmessage-failure"— structured-clone/postMessage threw.
    //
    // The fallback runs computeBestCase inline (bestCase is dynamically imported
    // to stay out of the main bundle). IMPORTANT: it does so ONLY when the group
    // stage is complete (isBestCaseAvailable). Before that the search includes a
    // 3^k-per-group enumeration that would block the tab for seconds — so if the
    // worker is unavailable in that window we surface a clean error instead of
    // freezing the UI. The worker remains the only path that can run the heavy
    // pre-group-stage search.
    const runOnMainThread = (kind: string, reason: string) => {
      if (settled) return;
      settled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      captureClientMessage("bestcase-worker-fallback", { kind, reason }, "warning");
      import("../utils/bestCase")
        .then(({ computeBestCase, isBestCaseAvailable }) => {
          if (!mountedRef.current) return;
          if (!isBestCaseAvailable(safeResults)) {
            // Heavy search + no worker → refuse to block the main thread.
            captureClientMessage("bestcase-fallback-skipped-heavy", { kind, reason }, "warning");
            showError();
            return;
          }
          const result = computeBestCase(formId, safeForms, safeResults, onProgress);
          if (!mountedRef.current) return;
          if (!result) {
            captureClientMessage("bestcase-null-result", { source: "mainthread" }, "warning");
            showError();
            return;
          }
          succeed(result);
        })
        .catch((err) => {
          captureClientError(
            err instanceof Error ? err : new Error(String(err)),
            { feature: "bestCase", stage: "mainThreadFallback", kind, reason },
          );
          showError();
        });
    };

    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/bestCaseWorker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (err) {
      // Some engines throw synchronously on module-worker construction.
      runOnMainThread("construct-failure", String(err));
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;
      if (type === "progress") {
        onProgress(e.data.phase as Phase, e.data.percent);
      } else if (type === "result") {
        if (settled) return;
        settled = true;
        worker.terminate();
        workerRef.current = null;
        // A null result means the target form was not found among submitted
        // forms — a genuine "nothing to show", not a worker failure, so surface
        // it as an error rather than re-running on the main thread (which would
        // only reproduce the same null).
        if (!e.data.result) {
          captureClientMessage("bestcase-null-result", { source: "worker" }, "warning");
          showError();
          return;
        }
        succeed(e.data.result);
      } else if (type === "error") {
        // The worker ran but computeBestCase threw. Retry on the main thread so
        // a transient/worker-only failure still yields a result; a genuine logic
        // bug will rethrow there and be captured with a real stack.
        runOnMainThread("runtime-error", e.data.message || "unknown");
      }
    };

    // Fires when the worker module itself fails to load/parse — the PRIME
    // SUSPECT for the reported every-device/every-run failure.
    worker.onerror = (e) => {
      runOnMainThread("load-failure", (e as ErrorEvent)?.message || "unknown");
    };

    // postMessage can throw synchronously (a structured-clone failure the
    // sanitizer somehow didn't cover, or an engine quirk). An uncaught throw
    // here would abandon the run mid-"prep" with the spinner stuck forever, so
    // route any failure straight into the main-thread fallback. Sanitized data
    // means this realistically never fires, but the feature must degrade
    // gracefully rather than trap the user.
    try {
      worker.postMessage({
        targetFormId: formId,
        allForms: safeForms,
        playedResults: safeResults,
      });
    } catch (err) {
      runOnMainThread("postmessage-failure", String(err));
    }
  }, [formId, available, allForms, matchResults, safeSetState]);

  return { state, compute, reset, available };
}
