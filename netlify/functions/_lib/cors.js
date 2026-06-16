// Shared CORS header builder for the Netlify functions.
//
// Every function previously hand-rolled an identical origin-allowlist match
// (`origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]`)
// — the security-relevant part — plus a near-identical header object. This
// centralizes the origin selection + header shape; callers still own their
// own ALLOWED_ORIGINS list (they legitimately differ: prod-only vs prod+dev)
// and pass their method / allow-headers / extra (cache) headers.
//
// Pure + dependency-free so the test runner can import and assert on it.

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
  return {
    "Access-Control-Allow-Origin": pickAllowedOrigin(event, allowedOrigins),
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": methods,
    "Content-Type": "application/json",
    ...extra,
  };
}
