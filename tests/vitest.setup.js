// Vitest global setup. Imported once by every Vitest test process via
// `setupFiles` in vitest.config.js.
//
// `@testing-library/jest-dom/vitest` registers jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, toBeVisible, ...) on Vitest's
// expect. Without this import, RTL tests still work but you lose all
// the readable matchers and fall back to comparing innerHTML strings.
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia. Several modules in src/ read it
// (e.g. preferredScrollBehavior in src/utils/helpers.js) — without a
// shim, `window.matchMedia(...)` throws and unrelated tests fail.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  });
}
