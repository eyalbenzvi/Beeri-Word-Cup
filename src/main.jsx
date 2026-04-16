import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { initSentry, installGlobalErrorHandlers } from "./sentry";

// מאתחלים Sentry לפני טעינת האפליקציה כדי לתפוס שגיאות bootstrap.
// initSentry עטוף try/catch — כישלון כאן לא מונע רינדור.
initSentry();
// Must come after init so captureClientError has somewhere to send.
// Catches async throws / unhandled rejections that ErrorBoundary can't see.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
