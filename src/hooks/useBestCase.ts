import { useState, useCallback, useRef } from "react";
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

  const [state, setState] = useState<BestCaseState>({
    loading: false,
    phase: "idle",
    phaseLabel: "",
    percent: 0,
    result: null,
    error: false,
  });

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState({
      loading: false,
      phase: "idle",
      phaseLabel: "",
      percent: 0,
      result: null,
      error: false,
    });
  }, []);

  const compute = useCallback(() => {
    if (!formId) return;

    // Terminate any prior worker
    workerRef.current?.terminate();

    setState({
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

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;
      if (type === "progress") {
        const phase = e.data.phase as Phase;
        setState((s) => ({
          ...s,
          phase,
          phaseLabel: PHASE_LABELS[phase] ?? s.phaseLabel,
          percent: e.data.percent,
        }));
      } else if (type === "result") {
        setState({
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
        setState({
          loading: false,
          phase: "error",
          phaseLabel: PHASE_LABELS.error,
          percent: 0,
          result: null,
          error: true,
        });
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = () => {
      setState({
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

    worker.postMessage({
      targetFormId: formId,
      allForms,
      playedResults: matchResults,
    });
  }, [formId, allForms, matchResults]);

  return { state, compute, reset };
}
