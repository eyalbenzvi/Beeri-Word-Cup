// Shared CORS for the Netlify functions.
//
// Every function previously hand-rolled (a) the same origin-allowlist match
// and (b) the same default-origins literal. Both are centralized here. Pure +
// dependency-free so the test runner can import and assert on it.

// The production + local-dev origins shared by every function EXCEPT
// summary-ai (which adds its own NODE_ENV-gated prod/dev split). Override at
// runtime with the ALLOWED_ORIGINS env var.
export const DEFAULT_ALLOWED_ORIGINS = [
  "https://beeri-world-cup.web.app",
  "https://beeri-world-cup.firebaseapp.com",
  "http://localhost:5173",
];

// Resolve a function's allowlist from its env override, falling back to the
// shared default. Returns a fresh array (never the shared module-level one) so
// a caller can't accidentally mutate the default for everyone.
export function resolveAllowedOrigins(envValue) {
  if (envValue && typeof envValue === "string") {
    return envValue.split(",");
  }
  return [...DEFAULT_ALLOWED_ORIGINS];
}

// Pick the echoed Access-Control-Allow-Origin: the request origin iff it is in
// the allowlist, otherwise the first allowlisted origin (never "*", so a
// stray origin can't be reflected). Case-handles both `origin` and `Origin`.
export function pickAllowedOrigin(event, allowedOrigins) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  return origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
}

export function buildCorsHeaders(
  event,
  {
    allowedOrigins,
    methods = "POST, OPTIONS",
    allowHeaders = "Content-Type, Authorization",
    extra = {},
  },
) {
  // `extra` is spread FIRST so the security-relevant fixed keys below always
  // win — a caller's extra (cache headers, Vary, …) can never override the
  // origin allowlist result or the JSON content type.
  return {
    ...extra,
    "Access-Control-Allow-Origin": pickAllowedOrigin(event, allowedOrigins),
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": methods,
    "Content-Type": "application/json",
  };
}
