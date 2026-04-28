import { useState, useCallback, useRef, useEffect } from "react";
import type { BestCaseResult } from "../utils/bestCase";
import { useAllPredictions, useMatchResults } from "./useStore";

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
} {
  const allForms = useAllPredictions();
  const matchResults = useMatchResults();
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
    if (!formId) return;

    // Terminate any prior worker
    workerRef.current?.terminate();

    safeSetState({
      loading: true,
      phase: "prep",
      phaseLabel: PHASE_LABELS.prep,
      percent: 0,
      result: null,
      error: false,
    });

    const worker = new Worker(
      new URL("../workers/bestCaseWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const fail = () => {
      safeSetState({
        loading: false,
        phase: "error",
        phaseLabel: PHASE_LABELS.error,
        percent: 0,
        result: null,
        error: true,
      });
      worker.terminate();
      workerRef.current = null;
    };

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;
      if (type === "progress") {
        const phase = e.data.phase as Phase;
        safeSetState((s) => ({
          ...s,
          phase,
          phaseLabel: PHASE_LABELS[phase] ?? s.phaseLabel,
          percent: e.data.percent,
        }));
      } else if (type === "result") {
        // A null result means the target form was not found among
        // submitted forms — surface it as an error so the panel doesn't
        // collapse to a silent blank state after the loading spinner.
        if (!e.data.result) {
          fail();
          return;
        }
        safeSetState({
          loading: false,
          phase: "done",
          phaseLabel: PHASE_LABELS.done,
          percent: 100,
          result: e.data.result,
          error: false,
        });
        worker.terminate();
        workerRef.current = null;
      } else if (type === "error") {
        fail();
      }
    };

    worker.onerror = fail;

    worker.postMessage({
      targetFormId: formId,
      allForms,
      playedResults: matchResults,
    });
  }, [formId, allForms, matchResults, safeSetState]);

  return { state, compute, reset };
}
