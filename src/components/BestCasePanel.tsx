import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useBestCase } from "../hooks/useBestCase";
import FormMatchesView from "./FormMatchesView";

type Props = {
  formId: string;
  // Called when the panel mounts so the parent can reset it if formId changes
  onReset?: () => void;
};

function ScenarioOverlay({
  results,
  onClose,
}: {
  results: Record<string, any>;
  onClose: () => void;
}) {
  // Lock body scroll while the overlay is open so swipes inside the panel
  // don't bleed through to the leaderboard underneath.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="תרחיש מיטבי - תוצאות המשחקים"
        className="fixed inset-x-0 bottom-0 top-[5%] bg-bg z-[70] shadow-2xl rounded-t-3xl flex flex-col overflow-hidden"
      >
        <div className="bg-primary text-white p-4 flex items-center justify-between border-b-4 border-primary-dark flex-shrink-0">
          <div className="flex items-center gap-2 font-extrabold">
            <Sparkles size={18} aria-hidden="true" />
            תרחיש מיטבי
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-white cursor-pointer p-1 hover:opacity-80"
            aria-label="סגור"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <p className="text-xs text-ink-muted font-medium mb-3">
            תוצאות המשחקים בתרחיש שמביא את הטופס לדירוג הגבוה ביותר.
          </p>
          <FormMatchesView predictions={results} />
        </div>
      </div>
    </>
  );
}

export default function BestCasePanel({ formId, onReset }: Props) {
  const { state, compute, reset } = useBestCase(formId);
  const [scenarioOpen, setScenarioOpen] = useState(false);

  // Reset whenever formId changes (user navigates to a different form).
  // `reset` is referentially stable (useCallback []), `onReset` is included
  // so a parent that updates its callback gets the latest version.
  useEffect(() => {
    reset();
    setScenarioOpen(false);
    onReset?.();
  }, [formId, reset, onReset]);

  // Not yet triggered
  if (state.phase === "idle") {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={compute}
          className="btn-duo btn-duo-ghost w-full flex items-center justify-center gap-2 text-sm font-extrabold"
        >
          <Sparkles size={15} aria-hidden="true" />
          חשב תרחיש מיטבי
        </button>
      </div>
    );
  }

  // Loading
  if (state.loading) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-ink-muted font-bold mb-2">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
          {state.phaseLabel}
        </div>
        <div className="w-full bg-bg-soft rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${state.percent}%` }}
          />
        </div>
      </div>
    );
  }

  // Error
  if (state.error) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-danger font-bold mb-2">שגיאה בחישוב התרחיש המיטבי.</p>
        <button
          onClick={compute}
          className="btn-duo btn-duo-ghost text-sm font-extrabold"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  // Result
  const { result } = state;
  if (!result) return null;

  const { projectedRank, projectedScore, totalForms, bestResults } = result;

  const rankEmoji =
    projectedRank === 1 ? "🥇" : projectedRank === 2 ? "🥈" : projectedRank === 3 ? "🥉" : null;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center gap-1.5 mb-2 text-sm font-extrabold text-ink">
        <Sparkles size={14} className="text-primary" aria-hidden="true" />
        תרחיש מיטבי
      </div>

      <div className="grid grid-cols-2 gap-2 text-center text-xs mb-2">
        <div className="bg-primary/8 rounded-xl p-3">
          <div className="text-xl font-extrabold text-primary tabular-nums">
            {rankEmoji ? (
              <span>{rankEmoji}</span>
            ) : (
              <bdi>#{projectedRank}</bdi>
            )}
          </div>
          <div className="text-ink-muted font-bold mt-0.5">
            מיקום מירבי
          </div>
          <div className="text-ink-muted font-medium">מתוך {totalForms}</div>
        </div>

        <div className="bg-primary/8 rounded-xl p-3">
          <div className="text-xl font-extrabold text-primary tabular-nums">
            <bdi>{projectedScore}</bdi>
          </div>
          <div className="text-ink-muted font-bold mt-0.5">ניקוד מירבי</div>
          <div className="text-ink-muted font-medium">ללא מלך שערים</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setScenarioOpen(true)}
          className="btn-duo btn-duo-ghost text-xs font-extrabold flex items-center gap-1.5"
          style={{ padding: "0.4rem 0.75rem" }}
        >
          הצג תרחיש
        </button>
        <button
          onClick={reset}
          className="text-xs text-ink-muted font-bold underline underline-offset-2 bg-transparent border-none cursor-pointer p-0 hover:text-ink"
        >
          נקה
        </button>
      </div>

      {scenarioOpen && (
        <ScenarioOverlay
          results={bestResults}
          onClose={() => setScenarioOpen(false)}
        />
      )}
    </div>
  );
}
