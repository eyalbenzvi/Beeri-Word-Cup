import { Component } from "react";
import { captureClientError } from "../sentry";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    try {
      captureClientError(error, {
        componentStack: info?.componentStack || null,
      });
    } catch {
      // דיווח לעולם לא ישבור את הרינדור
    }
  }

  render() {
    if (this.state.hasError) {
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
