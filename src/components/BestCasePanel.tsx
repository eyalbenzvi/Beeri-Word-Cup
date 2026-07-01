import { Component, useEffect, useState } from "react";
import { Sparkles, X, Gamepad2 } from "lucide-react";
import { useBestCase } from "../hooks/useBestCase";
import { useMatchResults } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { bestResultsToSimulatorOverrides } from "../utils/bestCase";
import { setSimulatorSeed } from "../utils/simulatorSeed";
import { captureClientError } from "../sentry";
import FormMatchesView from "./FormMatchesView";

type Props = {
  formId: string;
  // Called when the panel mounts so the parent can reset it if formId changes
  onReset?: () => void;
};

function ScenarioOverlay({
  results,
  onClose,
  onOpenInSimulator,
}: {
  results: Record<string, any>;
  onClose: () => void;
  onOpenInSimulator: () => void;
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
        <div className="flex-1 overflow-y-auto p-4 pb-4">
          <p className="text-xs text-ink-muted font-medium mb-3">
            תוצאות המשחקים בתרחיש שמביא את הטופס לדירוג הגבוה ביותר.
          </p>
          <FormMatchesView predictions={results} />
        </div>
        {/* Sticky hand-off footer: carry this exact scenario into the simulator
            so the user can tweak results and watch the whole leaderboard react. */}
        <div className="flex-shrink-0 border-t-2 border-border bg-bg p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-2">
          <button
            onClick={onOpenInSimulator}
            className="btn-duo btn-duo-blue btn-duo-cta flex items-center justify-center gap-2 text-sm font-extrabold"
          >
            <Gamepad2 size={17} aria-hidden="true" />
            פתח בסימולטור
          </button>
          <p className="text-3xs text-ink-light font-medium text-center">
            כל התוצאות ייטענו לסימולטור — שם אפשר לשנות תוצאות ולראות איך זה משפיע
            עליך ועל שאר המתמודדים.
          </p>
        </div>
      </div>
    </>
  );
}

function BestCasePanelInner({ formId, onReset }: Props) {
  const { state, compute, reset, available } = useBestCase(formId);
  const realResults = useMatchResults();
  const { navigate } = useNavigation();
  const [scenarioOpen, setScenarioOpen] = useState(false);

  // Reset whenever formId changes (user navigates to a different form).
  // `reset` is referentially stable (useCallback []), `onReset` is included
  // so a parent that updates its callback gets the latest version.
  useEffect(() => {
    reset();
    setScenarioOpen(false);
    onReset?.();
  }, [formId, reset, onReset]);

  // Not yet triggered. Disabled until the group stage is complete (all
  // R32 qualifiers determined) — before that the optimization is both
  // meaningless and prohibitively slow.
  if (state.phase === "idle") {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={compute}
          disabled={!available}
          className="btn-duo btn-duo-ghost w-full flex items-center justify-center gap-2 text-sm font-extrabold"
        >
          <Sparkles size={15} aria-hidden="true" />
          חשב תרחיש מיטבי
        </button>
        {!available && (
          <p className="text-xs text-ink-light font-medium text-center mt-2">
            החישוב יהיה זמין בתום שלב הבתים, כשכל העולות לשלב ה־32 ייקבעו
          </p>
        )}
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
          disabled={!available}
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

  // Hand the optimised scenario off to the shared simulator and jump there.
  // Only the still-unplayed matches become simulator overrides — the already-
  // played matches are the simulator's fixed base.
  //
  // Rank/score in the simulator match this panel's projection exactly, with one
  // caveat: the projection here excludes the top-scorer bonus ("ללא מלך שערים"),
  // while the simulator scores with the real locked bonuses. They only diverge
  // if a top scorer has already been officially set — which, since the optimizer
  // is admin-gated to the post-group-stage window, normally hasn't happened yet.
  const openInSimulator = () => {
    // `realResults` (raw store) determines which matches are "played" and thus
    // excluded from the overrides. The optimizer consumed the SANITIZED results
    // to produce `bestResults`, but sanitization preserves each score's validity
    // (null stays null), so the played/remaining split here is identical to the
    // one the projection assumed — they derive from the same store snapshot.
    const overrides = bestResultsToSimulatorOverrides(bestResults, realResults);
    setSimulatorSeed(overrides);
    setScenarioOpen(false);
    navigate("simulator");
  };

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
          onOpenInSimulator={openInSimulator}
        />
      )}
    </div>
  );
}

// Feature-local error boundary. The best-case optimizer is an OPTIONAL extra on
// the Leaderboard: a render-time throw inside it (or its scenario overlay) must
// NEVER take down the surrounding leaderboard page. React's ErrorBoundary only
// catches render/lifecycle errors — the async worker/postMessage failures are
// already handled inside useBestCase (which degrades to a clean "try again"
// state, never an infinite spinner) — so this boundary is the last line of
// defense for the synchronous render path. On error it hides the feature
// cleanly (a single unobtrusive line, no page-breaking fallback) and reports
// to Sentry. `resetKey={formId}` clears the error when the user navigates to a
// different form, so a transient fault doesn't disable the panel forever.
class BestCasePanelBoundary extends Component<
  { formId: string; children?: any },
  { hasError: boolean }
> {
  constructor(props: { formId: string; children?: any }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { formId: string }) {
    if (this.state.hasError && prevProps.formId !== this.props.formId) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    try {
      captureClientError(error, {
        feature: "bestCase",
        stage: "render",
        componentStack: info?.componentStack || null,
      });
    } catch {
      // דיווח לעולם לא ישבור את הרינדור
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-ink-muted font-medium text-center">
            חישוב התרחיש המיטבי אינו זמין כרגע.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function BestCasePanel({ formId, onReset }: Props) {
  return (
    <BestCasePanelBoundary formId={formId}>
      <BestCasePanelInner formId={formId} onReset={onReset} />
    </BestCasePanelBoundary>
  );
}
