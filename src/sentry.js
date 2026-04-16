// Sentry client init. ה-DSN נקרא ממשתנה VITE_SENTRY_DSN (מוגדר ב-Netlify).
// אם חסר — מדלג בשקט (dev לוקאלי בלי DSN).
// כל הפונקציות עטופות try/catch: דיווח שגיאות לעולם לא שובר את האפליקציה.
import * as Sentry from "@sentry/react";

let initialized = false;

// Per-session tab id so duplicate events across tabs are distinguishable.
function getTabId() {
  try {
    let id = sessionStorage.getItem("wc_tabId");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem("wc_tabId", id);
    }
    return id;
  } catch {
    return "no-session";
  }
}

// Deduplicate noisy watchdog events within a single session.
const emittedOnce = new Set();

export function initSentry() {
  if (initialized) return false;
  // חשוב: import.meta.env קיים רק ב-Vite; בזמן ריצה רגיל (ssr/test) נחזיר
  // undefined ונצא בשקט.
  const dsn =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_SENTRY_DSN
      : undefined;
  if (!dsn) return false;

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
    });
    Sentry.setTag("tabId", getTabId());
    initialized = true;
    return true;
  } catch (err) {
    console.error("Sentry init failed:", err);
    return false;
  }
}

export function setSentryUser(user) {
  if (!initialized) return;
  try {
    if (!user) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({
      id: user.id || user.uid,
      username: user.displayName || null,
    });
  } catch {
    // לעולם לא מפיל את האפליקציה בגלל דיווח
  }
}

export function captureClientError(err, context = {}) {
  if (!initialized) return;
  try {
    Sentry.captureException(err, {
      extra: { ...context, tabId: getTabId() },
    });
  } catch {
    // swallow
  }
}

// Lightweight signal event (not an Error). Used for watchdog timeouts,
// recovery-button taps, etc. Dedup'd by key so one stuck session produces
// at most one event per watchdog.
export function captureClientMessage(key, context = {}, level = "warning") {
  if (!initialized) return;
  if (emittedOnce.has(key)) return;
  emittedOnce.add(key);
  try {
    Sentry.captureMessage(key, {
      level,
      extra: { ...context, tabId: getTabId() },
    });
  } catch {
    // swallow
  }
}

// Reset dedup keys — useful on explicit user action (reload) or logout.
export function resetOnceKeys() {
  emittedOnce.clear();
}

// Noise filter for global handlers: skip browser-extension / third-party
// script errors we can't act on.
function looksLikeExtensionNoise(msg) {
  if (!msg) return false;
  const s = String(msg);
  return (
    /ResizeObserver loop/.test(s) ||
    /chrome-extension:/.test(s) ||
    /moz-extension:/.test(s) ||
    /safari-extension:/.test(s) ||
    s === "Script error." // cross-origin with no stack
  );
}

// B2: install window-level handlers for errors React's ErrorBoundary misses
// (async throws, unhandled promise rejections, event-handler errors).
export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    const msg = event?.message || event?.error?.message;
    if (looksLikeExtensionNoise(msg)) return;
    const err = event?.error || new Error(msg || "window.onerror");
    captureClientError(err, {
      source: "window.onerror",
      filename: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const err =
      reason instanceof Error
        ? reason
        : new Error(
            typeof reason === "string" ? reason : "unhandledrejection",
          );
    captureClientError(err, { source: "unhandledrejection" });
  });
}

export { Sentry };
