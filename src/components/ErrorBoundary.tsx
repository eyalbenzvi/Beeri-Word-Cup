import { Component } from "react";
import { captureClientError } from "../sentry";

// Two scopes:
// - `variant="page"` renders inline (smaller card, "go home" recovery) so the
//   shell (header + nav) stays visible. Used per lazy-loaded page.
// - default renders the full-screen splash. Used at the app root.
//
// When `resetKey` changes we clear hasError so a navigation away from a
// broken page lets the user actually leave (without a hard reload).
type ErrorBoundaryProps = {
  variant?: "page" | "root";
  resetKey?: any;
  children?: any;
};
type ErrorBoundaryState = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey &&
      this.props.resetKey !== undefined
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    try {
      captureClientError(error, {
        componentStack: info?.componentStack || null,
        scope: this.props.variant === "page" ? "page" : "root",
        resetKey: this.props.resetKey || null,
      });
    } catch {
      // דיווח לעולם לא ישבור את הרינדור
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.variant === "page") {
        return (
          <div className="text-center py-16 card-duo-lg max-w-md mx-auto">
            <div className="text-6xl mb-4">😵</div>
            <h2 className="text-xl font-extrabold text-ink mb-2">
              משהו השתבש בעמוד הזה
            </h2>
            <p className="text-sm text-ink-muted mb-6 leading-relaxed">
              נסה לרענן או לעבור לדף הבית.
            </p>
            <button onClick={() => window.location.reload()} className="btn-duo btn-duo-primary w-full">
              רענן דף
            </button>
          </div>
        );
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="text-center max-w-sm card-duo-lg">
            <div className="text-6xl mb-4">😵</div>
            <h1 className="text-2xl font-extrabold text-ink mb-2">
              משהו השתבש
            </h1>
            <p className="text-sm text-ink-muted mb-6 leading-relaxed">
              קרתה שגיאה לא צפויה. נסה לרענן את הדף.
            </p>
            <button onClick={() => window.location.reload()} className="btn-duo btn-duo-primary w-full">
              רענן דף
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
