// Live-scores endpoint tests.
//
// Part A: unit tests for the pure normalizer (_sources/liveNormalize.js)
//         + the shared FD code map (_sources/fdCodes.js).
// Part B: static contract audit of get-live-scores.js — the properties
//         that keep the upstream API alive under a whole-kibbutz kickoff
//         (caching layers, in-flight dedup) and the soft-failure stance
//         (a broken upstream must never 500 the home page's poll loop).

import fs from "node:fs";
import { normalizeFdMatches } from "../../netlify/functions/_sources/liveNormalize.js";
import { ourCode, FD_TO_OURS } from "../../netlify/functions/_sources/fdCodes.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LIVE SCORES ENDPOINT TESTS ===\n");

// ---- A1. Code translation ----
console.log("--- A1. FD code translation ---");
assert(ourCode("CUW") === "CUR", "CUW -> CUR");
assert(ourCode("URY") === "URU", "URY -> URU");
assert(ourCode("fra") === "FRA", "lower-case normalized");
assert(ourCode(null) === "", "null -> empty");
assert(Object.keys(FD_TO_OURS).length >= 2, "map exported for reuse");

// ---- A2. Normalization ----
console.log("--- A2. normalizeFdMatches ---");
{
  const out = normalizeFdMatches([
    {
      homeTeam: { tla: "CUW" },
      awayTeam: { tla: "CAN" },
      status: "IN_PLAY",
      minute: 63,
      utcDate: "2026-06-12T19:00:00Z",
      score: { fullTime: { home: 2, away: 1 } },
    },
    // missing TLA -> dropped (unmatchable client-side)
    { homeTeam: {}, awayTeam: { tla: "BIH" }, status: "IN_PLAY", score: { fullTime: {} } },
    // pre-kickoff: null scores survive as null, not 0
    {
      homeTeam: { tla: "FRA" },
      awayTeam: { tla: "SEN" },
      status: "TIMED",
      minute: "12", // non-integer minute -> null
      score: { fullTime: { home: null, away: null } },
    },
  ]);
  assert(out.length === 2, "unmatchable fixture dropped");
  assert(out[0].homeCode === "CUR", "TLA translated to our code space");
  assert(out[0].homeScore === 2 && out[0].awayScore === 1, "fullTime scores carried");
  assert(out[0].minute === 63, "integer minute carried");
  assert(out[1].homeScore === null && out[1].awayScore === null,
    "null scores stay null (never coerced to 0)");
  assert(out[1].minute === null, "non-integer minute -> null");
  assert(normalizeFdMatches(null).length === 0, "null input -> []");
}

// ---- B. Static contract of the endpoint ----
console.log("--- B. get-live-scores.js contract ---");
const src = fs.readFileSync(
  "/home/user/Beeri-World-Cup/netlify/functions/get-live-scores.js", "utf8");

// No Firestore / Admin SDK — the endpoint must stay a cheap stateless proxy.
assert(!/firebase-admin/.test(src), "no firebase-admin import (no Firestore)");
assert(!/FIREBASE_SERVICE_ACCOUNT/.test(src), "no service-account dependency");

// Method discipline + kill switch
assert(/httpMethod !== "GET"/.test(src), "rejects non-GET");
assert(/LIVE_SCORES_DISABLED/.test(src), "hard env kill switch present");

// Layered caching — the many-concurrent-users requirement:
assert(/CACHE_TTL_MS\s*=\s*55\s*\*\s*1000/.test(src), "in-memory cache TTL ~55s");
assert(/now - cached\.at < CACHE_TTL_MS/.test(src), "warm-instance cache consulted");
assert(/inFlight/.test(src) && /inFlight = null/.test(src),
  "concurrent invocations share one upstream fetch (in-flight dedup)");
assert(/max-age=60/.test(src), "CDN Cache-Control max-age");
assert(/Netlify-CDN-Cache-Control/.test(src), "Netlify CDN cache header");
assert(/stale-while-revalidate/.test(src), "stale-while-revalidate for smooth refresh");

// Soft-failure stance: upstream errors degrade, never 500.
assert(/available:\s*false/.test(src), "degrades to available:false");
assert(/stale:\s*true/.test(src), "serves last payload flagged stale on upstream failure");
assert(!/statusCode:\s*500/.test(src), "never returns 500 (nicety, not a dependency)");

// Timeout discipline (Netlify 10s budget)
assert(/FETCH_TIMEOUT_MS\s*=\s*3500/.test(src), "3.5s upstream timeout");
assert(/AbortController/.test(src), "abortable fetch");

// Honest freshness for clients (CDN hits still expose data age)
assert(/fetchedAt/.test(src), "payload embeds fetchedAt");

// Ops + CORS hygiene, matching sibling functions
assert(/withSentry\(/.test(src), "wrapped in withSentry");
assert(/ALLOWED_ORIGINS/.test(src), "CORS allow-list");
assert(!/X-Auth-Token.*body/.test(src), "token never echoed");

// Shared code map — no duplicated FD_TO_OURS drift between sources.
const fd = fs.readFileSync(
  "/home/user/Beeri-World-Cup/netlify/functions/_sources/footballData.js", "utf8");
assert(/from "\.\/fdCodes\.js"/.test(fd), "footballData.js imports shared fdCodes");
assert(!/FD_TO_OURS\s*=/.test(fd), "footballData.js no longer defines its own map");
const norm = fs.readFileSync(
  "/home/user/Beeri-World-Cup/netlify/functions/_sources/liveNormalize.js", "utf8");
assert(/from "\.\/fdCodes\.js"/.test(norm), "liveNormalize.js uses shared fdCodes");

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
