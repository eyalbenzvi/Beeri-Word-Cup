import { Component } from "react";

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="text-center max-w-sm">
            <div className="text-5xl mb-4">😵</div>
            <h1 className="text-xl font-extrabold text-primary mb-2">
              משהו השתבש
            </h1>
            <p className="text-sm text-gray-500 mb-4">
              קרתה שגיאה לא צפויה. נסה לרענן את הדף.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-white font-bold px-6 py-3 rounded-2xl hover:bg-primary-light transition border-none cursor-pointer shadow-sm"
            >
              רענן דף
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
