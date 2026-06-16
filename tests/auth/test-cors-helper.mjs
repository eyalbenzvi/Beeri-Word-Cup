// Tests the shared CORS helper (_lib/cors.js) and that every Netlify function
// routes through it instead of hand-rolling the origin-allowlist match.
//
// Plain node ESM — the helper is dependency-free.

import { readFileSync, readdirSync } from "node:fs";
import { pickAllowedOrigin, buildCorsHeaders } from "../../netlify/functions/_lib/cors.js";

let passed = 0,
  failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== CORS HELPER TESTS ===\n");

const ORIGINS = ["https://beeri-world-cup.web.app", "https://beeri-world-cup.firebaseapp.com", "http://localhost:5173"];

// ---------- pickAllowedOrigin ----------
{
  assert(
    pickAllowedOrigin({ headers: { origin: ORIGINS[2] } }, ORIGINS) === ORIGINS[2],
    "echoes an allowlisted origin",
  );
  assert(
    pickAllowedOrigin({ headers: { Origin: ORIGINS[1] } }, ORIGINS) === ORIGINS[1],
    "handles capitalized Origin header",
  );
  assert(
    pickAllowedOrigin({ headers: { origin: "https://evil.example" } }, ORIGINS) === ORIGINS[0],
    "falls back to the first origin (never reflects a stray origin)",
  );
  assert(
    pickAllowedOrigin({ headers: {} }, ORIGINS) === ORIGINS[0],
    "falls back to the first origin when no Origin header",
  );
  assert(pickAllowedOrigin({}, ORIGINS) === ORIGINS[0], "no headers object -> first origin (no throw)");
}

// ---------- buildCorsHeaders: variant reproduction ----------
{
  const ev = { headers: { origin: ORIGINS[2] } };

  // POST + auth (5 functions) — defaults.
  const post = buildCorsHeaders(ev, { allowedOrigins: ORIGINS });
  assert(post["Access-Control-Allow-Origin"] === ORIGINS[2], "POST: echoes origin");
  assert(post["Access-Control-Allow-Headers"] === "Content-Type, Authorization", "POST: default allow-headers incl Authorization");
  assert(post["Access-Control-Allow-Methods"] === "POST, OPTIONS", "POST: default methods");
  assert(post["Content-Type"] === "application/json", "POST: json content-type");
  assert(Object.keys(post).length === 4, "POST: exactly 4 headers");

  // POST + Content-Type only (phone functions).
  const phone = buildCorsHeaders(ev, { allowedOrigins: ORIGINS, allowHeaders: "Content-Type" });
  assert(phone["Access-Control-Allow-Headers"] === "Content-Type", "phone: allow-headers without Authorization");

  // GET public (no-store).
  const pub = buildCorsHeaders(ev, { allowedOrigins: ORIGINS, methods: "GET, OPTIONS", allowHeaders: "Content-Type", extra: { "Cache-Control": "no-store" } });
  assert(pub["Access-Control-Allow-Methods"] === "GET, OPTIONS", "public: GET methods");
  assert(pub["Cache-Control"] === "no-store", "public: no-store cache");

  // get-live-scores CDN variant — exact reproduction.
  const live = buildCorsHeaders(ev, {
    allowedOrigins: ORIGINS,
    methods: "GET, OPTIONS",
    allowHeaders: "Content-Type",
    extra: {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=30",
      "Netlify-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=30",
      "Vary": "Origin",
    },
  });
  assert(live["Vary"] === "Origin", "live-scores: Vary: Origin preserved");
  assert(live["Netlify-CDN-Cache-Control"] === "public, max-age=30, stale-while-revalidate=30", "live-scores: CDN cache header preserved");
  assert(live["Content-Type"] === "application/json", "live-scores: json content-type still present");
}

// ---------- Wiring: every function uses the helper, none hand-rolls it ----------
{
  const dir = new URL("../../netlify/functions/", import.meta.url);
  const fnFiles = readdirSync(dir).filter((f) => f.endsWith(".js"));
  let usingHelper = 0;
  for (const f of fnFiles) {
    const src = readFileSync(new URL(f, dir), "utf8");
    if (!/getCorsHeaders/.test(src)) continue; // function has no CORS surface
    usingHelper++;
    assert(
      /from "\.\/_lib\/cors\.js"/.test(src),
      `${f}: imports the shared CORS helper`,
    );
    assert(
      !/ALLOWED_ORIGINS\.includes\(origin\)\s*\?\s*origin\s*:\s*ALLOWED_ORIGINS\[0\]/.test(src),
      `${f}: no longer hand-rolls the origin-allowlist match`,
    );
  }
  assert(usingHelper >= 11, `all CORS-bearing functions migrated (found ${usingHelper})`);
}

// ---------- Summary ----------
console.log("\n=== SUMMARY ===");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
