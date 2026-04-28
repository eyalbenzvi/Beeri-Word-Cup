import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useBestCase } from "../hooks/useBestCase";

type Props = {
  formId: string;
  // Called when the panel mounts so the parent can reset it if formId changes
  onReset?: () => void;
};

export default function BestCasePanel({ formId, onReset }: Props) {
  const { state, compute, reset } = useBestCase(formId);

  // Reset whenever formId changes (user navigates to a different form)
  useEffect(() => {
    reset();
    onReset?.();
  }, [formId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { projectedRank, projectedScore, totalForms } = result;

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
            דירוג מוקרן
          </div>
          <div className="text-ink-muted font-medium">מתוך {totalForms}</div>
        </div>

        <div className="bg-primary/8 rounded-xl p-3">
          <div className="text-xl font-extrabold text-primary tabular-nums">
            <bdi>{projectedScore}</bdi>
          </div>
          <div className="text-ink-muted font-bold mt-0.5">ניקוד מוקרן</div>
          <div className="text-ink-muted font-medium">ללא מלך שערים</div>
        </div>
      </div>

      <button
        onClick={reset}
        className="text-xs text-ink-muted font-bold underline underline-offset-2 bg-transparent border-none cursor-pointer p-0 hover:text-ink"
      >
        נקה
      </button>
    </div>
  );
}
