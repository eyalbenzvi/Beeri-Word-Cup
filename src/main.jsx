import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { initSentry } from "./sentry";

// מאתחלים Sentry לפני טעינת האפליקציה כדי לתפוס שגיאות bootstrap.
// initSentry עטוף try/catch — כישלון כאן לא מונע רינדור.
initSentry();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
