// Sentry wrapper for Netlify Functions.
// מטרה: לתעד ב-Sentry כל שגיאה לא-תפוסה בפונקציה, בלי לשבור את התגובה.
// עיצוב: factory `createWithSentry(sentryModule, initFn)` שחשוף ליצירת מוקים
// בטסטים. הייצוא הרגיל משתמש ב-@sentry/node האמיתי.
//
// כללי בטיחות:
// - אם Sentry לא מאותחל — ה-wrapper עדיין תופס ומחזיר 500 תקני.
// - אם Sentry.captureException זורק (בעיה ב-SDK) — ה-wrapper בולע ולא נופל.
// - handler שמחזיר תשובה רגילה (גם 4xx/5xx "עסקיים") יעבור בלי דיווח.
//   רק throws או promise rejections מדווחים.

import * as SentryNode from "@sentry/node";

let initialized = false;

function defaultInit() {
  if (initialized) return false;
  const dsn = process.env.VITE_SENTRY_DSN || process.env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    SentryNode.init({
      dsn,
      environment: process.env.CONTEXT || process.env.NODE_ENV || "production",
      tracesSampleRate: 0.1,
    });
    initialized = true;
    return true;
  } catch (err) {
    console.error("Sentry (server) init failed:", err);
    return false;
  }
}

// Factory: מאפשר להזריק Sentry mock ו-initFn לבדיקות
export function createWithSentry(sentryModule, initFn) {
  return function withSentry(handler, functionName = "unknown") {
    return async function wrappedHandler(event, context) {
      try {
        initFn();
      } catch {
        // init לעולם לא מונע את ריצת ה-handler
      }

      try {
        return await handler(event, context);
      } catch (err) {
        try {
          sentryModule.captureException(err, {
            tags: { function: functionName },
            extra: {
              path: event?.path || null,
              httpMethod: event?.httpMethod || null,
            },
          });
          // Netlify Functions מסתיים מיד — מחכים ל-flush קצר כדי לא
          // לאבד את האירוע
          if (typeof sentryModule.flush === "function") {
            await sentryModule.flush(2000);
          }
        } catch {
          // דיווח נכשל — ממשיכים הלאה, לא שוברים את ה-response
        }
        console.error(`[${functionName}] unhandled error:`, err);
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Internal server error" }),
        };
      }
    };
  };
}

export const withSentry = createWithSentry(SentryNode, defaultInit);
