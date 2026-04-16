// Sentry client init. ה-DSN נקרא ממשתנה VITE_SENTRY_DSN (מוגדר ב-Netlify).
// אם חסר — מדלג בשקט (dev לוקאלי בלי DSN).
// כל הפונקציות עטופות try/catch: דיווח שגיאות לעולם לא שובר את האפליקציה.
import * as Sentry from "@sentry/react";

let initialized = false;

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
      extra: context,
    });
  } catch {
    // swallow
  }
}

export { Sentry };
