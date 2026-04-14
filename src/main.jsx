import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { generateLoadTestForms, removeLoadTestForms } from "./store.js";

// Expose load test utilities on window for console access
window.__loadTest = generateLoadTestForms;
window.__removeLoadTest = removeLoadTestForms;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
