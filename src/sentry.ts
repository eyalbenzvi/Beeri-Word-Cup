// Sentry client init. ה-DSN נקרא ממשתנה VITE_SENTRY_DSN (מוגדר ב-Netlify).
// אם חסר — מדלג בשקט (dev לוקאלי בלי DSN).
// כל הפונקציות עטופות try/catch: דיווח שגיאות לעולם לא שובר את האפליקציה.
import * as Sentry from "@sentry/react";
import { CHUNK_ERROR_PATTERNS } from "./utils/chunkErrors";

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

// Strip legacy phone-UID PII (`phone_<10-digit>`) from any string before it
// leaves the browser. Hashed UIDs (`phone_<16 hex>`) are intentionally
// preserved — they're opaque by construction.
const LEGACY_PHONE_UID_RE = /phone_(0\d{8,9}|972\d{8,9}|\+972\d{8,9})/g;
export function scrubPhoneUid(input: unknown): unknown {
  if (typeof input === "string") {
    return input.replace(LEGACY_PHONE_UID_RE, "phone_<redacted>");
  }
  if (input && typeof input === "object") {
    try {
      const json = JSON.stringify(input);
      if (!LEGACY_PHONE_UID_RE.test(json)) return input;
      return JSON.parse(
        JSON.stringify(input).replace(LEGACY_PHONE_UID_RE, "phone_<redacted>"),
      );
    } catch {
      return input;
    }
  }
  return input;
}

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
      // Stale chunk after deploy is auto-recovered by lazyWithRetry — drop the
      // noise so real errors stay visible. Patterns are shared with
      // lazyWithRetry via chunkErrors.ts so the two can't drift.
      ignoreErrors: [...CHUNK_ERROR_PATTERNS],
      // Defense-in-depth during the phone-UID PII migration: redact any
      // legacy `phone_<phone>` substring from breadcrumb/event payloads
      // before they leave the browser. Hashed UIDs are opaque and pass
      // through unchanged.
      beforeBreadcrumb(breadcrumb) {
        try {
          if (breadcrumb.message) {
            breadcrumb.message = scrubPhoneUid(breadcrumb.message) as string;
          }
          if (breadcrumb.data) {
            breadcrumb.data = scrubPhoneUid(breadcrumb.data) as Record<string, any>;
          }
        } catch {
          // never let scrubbing throw and drop a real breadcrumb
        }
        return breadcrumb;
      },
      beforeSend(event) {
        try {
          if (event.message) {
            event.message = scrubPhoneUid(event.message) as string;
          }
          if (event.extra) {
            event.extra = scrubPhoneUid(event.extra) as Record<string, any>;
          }
          if (event.tags) {
            event.tags = scrubPhoneUid(event.tags) as Record<string, any>;
          }
          if (event.request?.url) {
            event.request.url = scrubPhoneUid(event.request.url) as string;
          }
        } catch {
          // never block error reporting on scrub failure
        }
        return event;
      },
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
export function captureClientMessage(key: string, context: Record<string, any> = {}, level: import("@sentry/react").SeverityLevel = "warning") {
  if (!initialized) return;
  try {
    // `info`-level signals are heartbeats/diagnostics (e.g.
    // `public-settings-success`), not problems. Recording them as standalone
    // issues floods the dashboard and buries actionable errors, so attach
    // them as breadcrumbs to the NEXT real event instead. Breadcrumbs are
    // ring-buffered by Sentry, so we record one EVERY time (no dedup) to keep
    // the trail current. Warnings and above still become deduped issues.
    if (level === "info") {
      Sentry.addBreadcrumb({
        category: "app.signal",
        message: key,
        level,
        data: { ...context, tabId: getTabId() },
      });
      return;
    }
    // Dedup issue-creating messages per session so one stuck state doesn't
    // flood the dashboard.
    if (emittedOnce.has(key)) return;
    emittedOnce.add(key);
    Sentry.captureMessage(key, {
      level,
      extra: { ...context, tabId: getTabId() },
    });
  } catch {
    // swallow
  }
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
