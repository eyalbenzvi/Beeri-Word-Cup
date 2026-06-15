// Live-scores endpoint tests.
//
// Part A: unit tests for the pure normalizers (_sources/liveNormalize.js for
//         football-data, _sources/espnLive.js for ESPN) + the shared FD code
//         map (_sources/fdCodes.js).
// Part B: static contract audit of get-live-scores.js — the properties
//         that keep the upstream API alive under a whole-kibbutz kickoff
//         (caching layers, in-flight dedup), the source strategy (ESPN
//         primary, football-data fallback) and the soft-failure stance
//         (a broken upstream must never 500 the home page's poll loop).

import fs from "node:fs";
import { normalizeFdMatches } from "../../netlify/functions/_sources/liveNormalize.js";
import { normalizeEspnEvents } from "../../netlify/functions/_sources/espnLive.js";
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
  assert(out[0].duration === null, "absent duration -> null");
  assert(out[1].homeScore === null && out[1].awayScore === null,
    "null scores stay null (never coerced to 0)");
  assert(out[1].minute === null, "non-integer minute -> null");
  assert(normalizeFdMatches(null).length === 0, "null input -> []");

  // duration is the client's ET/pens suppression signal — must pass through.
  const et = normalizeFdMatches([
    {
      homeTeam: { tla: "FRA" },
      awayTeam: { tla: "BRA" },
      status: "IN_PLAY",
      score: { fullTime: { home: 2, away: 2 }, duration: "EXTRA_TIME" },
    },
  ]);
  assert(et[0].duration === "EXTRA_TIME", "score.duration carried through");
}

// ---- A3. ESPN normalization (primary source) ----
console.log("--- A3. normalizeEspnEvents ---");
{
  const ev = (over) => ({
    date: "2026-06-15T19:00:00Z",
    competitions: [
      {
        date: "2026-06-15T19:00:00Z",
        status: over.status,
        competitors: over.competitors,
      },
    ],
  });
  const out = normalizeEspnEvents([
    // in-play, 2nd half — minute parsed from displayClock, oriented home/away
    ev({
      status: { displayClock: "63'", period: 2, type: { name: "STATUS_SECOND_HALF", state: "in", completed: false } },
      competitors: [
        { homeAway: "home", score: "2", team: { displayName: "Mexico", abbreviation: "MEX" } },
        { homeAway: "away", score: "1", team: { displayName: "Canada", abbreviation: "CAN" } },
      ],
    }),
    // halftime -> PAUSED
    ev({
      status: { displayClock: "45'", period: 1, type: { name: "STATUS_HALFTIME", state: "in" } },
      competitors: [
        { homeAway: "home", score: "0", team: { displayName: "Brazil", abbreviation: "BRA" } },
        { homeAway: "away", score: "0", team: { displayName: "Senegal", abbreviation: "SEN" } },
      ],
    }),
    // pre-kickoff -> TIMED, empty scores stay null (never coerced to 0)
    ev({
      status: { displayClock: "0'", type: { name: "STATUS_SCHEDULED", state: "pre" } },
      competitors: [
        { homeAway: "home", score: "", team: { displayName: "France", abbreviation: "FRA" } },
        { homeAway: "away", score: "", team: { displayName: "Uruguay", abbreviation: "URU" } },
      ],
    }),
    // finished knockout that went to extra time -> FINISHED + EXTRA_TIME
    ev({
      status: { displayClock: "FT", period: 4, type: { name: "STATUS_FINAL", state: "post", completed: true } },
      competitors: [
        { homeAway: "home", score: "2", team: { displayName: "Argentina", abbreviation: "ARG" } },
        { homeAway: "away", score: "1", team: { displayName: "Croatia", abbreviation: "CRO" } },
      ],
    }),
    // name unknown to our alias table BUT abbreviation is one of our codes ->
    // resolved via the abbreviation fallback
    ev({
      status: { displayClock: "10'", type: { name: "STATUS_FIRST_HALF", state: "in" } },
      competitors: [
        { homeAway: "home", score: "0", team: { displayName: "Deutschland", abbreviation: "GER" } },
        { homeAway: "away", score: "0", team: { displayName: "Spain", abbreviation: "ESP" } },
      ],
    }),
    // unmatchable both ways -> dropped (never shipped unpairable)
    ev({
      status: { type: { state: "in" } },
      competitors: [
        { homeAway: "home", score: "1", team: { displayName: "Atlantis", abbreviation: "ZZZ" } },
        { homeAway: "away", score: "0", team: { displayName: "Wakanda", abbreviation: "WAK" } },
      ],
    }),
  ]);
  assert(out.length === 5, "5 pairable fixtures (unmatchable dropped)");
  const mex = out[0];
  assert(mex.homeCode === "MEX" && mex.awayCode === "CAN", "home/away oriented by ESPN homeAway");
  assert(mex.status === "IN_PLAY", "STATUS_SECOND_HALF -> IN_PLAY");
  assert(mex.minute === 63, "minute parsed from displayClock");
  assert(mex.duration === "REGULAR", "regulation in-play -> REGULAR");
  assert(mex.homeScore === 2 && mex.awayScore === 1, "string scores parsed to ints");
  assert(out[1].status === "PAUSED", "STATUS_HALFTIME -> PAUSED");
  assert(out[2].status === "TIMED", "pre-match -> TIMED");
  assert(out[2].homeScore === null && out[2].awayScore === null,
    "empty pre-match scores stay null (never 0)");
  assert(out[2].duration === null, "pre-match duration null (mirrors FD)");
  assert(out[3].status === "FINISHED", "completed -> FINISHED");
  assert(out[3].duration === "EXTRA_TIME",
    "finished knockout via ET still reports EXTRA_TIME (verdict suppression)");
  assert(out[4].homeCode === "GER" && out[4].awayCode === "ESP",
    "unknown name resolves via valid abbreviation fallback");
  assert(normalizeEspnEvents(null).length === 0, "null input -> []");
  assert(normalizeEspnEvents([{ competitions: [{ competitors: [] }] }]).length === 0,
    "missing competitors -> dropped, no throw");

  // homeAway omitted -> positional fallback (home first) still pairs.
  const positional = normalizeEspnEvents([
    ev({
      status: { displayClock: "30'", type: { name: "STATUS_FIRST_HALF", state: "in" } },
      competitors: [
        { score: "1", team: { displayName: "Portugal", abbreviation: "POR" } },
        { score: "0", team: { displayName: "Ghana", abbreviation: "GHA" } },
      ],
    }),
  ]);
  assert(positional.length === 1 && positional[0].homeCode === "POR" &&
    positional[0].awayCode === "GHA", "missing homeAway -> positional pairing");
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

// Source strategy: ESPN (real-time) PRIMARY, football-data (delayed) FALLBACK.
assert(/normalizeEspnEvents/.test(src), "uses the ESPN normalizer");
assert(/site\.api\.espn\.com/.test(src), "ESPN scoreboard is wired");
assert(/fifa\.world/.test(src), "default World Cup league slug present");
assert(/LIVE_SOURCE/.test(src), "LIVE_SOURCE env override for source selection");
assert(/source\s*===\s*"fd"/.test(src) && /source\s*===\s*"espn"/.test(src),
  "explicit single-source overrides honored");
// Default path must try ESPN first and fall back to FD only inside catch —
// so a transient ESPN error degrades to the (delayed) FD feed, and an
// ESPN rest-day empty result does NOT needlessly spend the FD budget.
assert(/return await fetchEspn\(/.test(src), "default path awaits ESPN first");
assert(/catch[\s\S]{0,160}fetchFootballData\(/.test(src),
  "football-data fallback lives in the ESPN catch (error-only)");
assert(/source:\s*"espn"|"espn",/.test(src) && /"fd"/.test(src),
  "payload tags which source served the data");

// Layered caching — the many-concurrent-users requirement:
assert(/CACHE_TTL_MS\s*=\s*25\s*\*\s*1000/.test(src), "in-memory cache TTL ~25s (low-latency, still under free-tier budget)");
assert(/now - cached\.at < CACHE_TTL_MS/.test(src), "warm-instance cache consulted");
assert(/inFlight/.test(src) && /inFlight = null/.test(src),
  "concurrent invocations share one upstream fetch (in-flight dedup)");
assert(/max-age=30/.test(src), "CDN Cache-Control max-age (30s)");
// Latency invariants — lock in the delay reduction:
//  - SWR must stay short (a long stale-while-revalidate shadow was the
//    biggest avoidable contributor to the live delay).
{
  const ttlM = src.match(/CACHE_TTL_MS\s*=\s*(\d+)\s*\*\s*1000/);
  const ageM = src.match(/max-age=(\d+)/);
  const swrM = src.match(/stale-while-revalidate=(\d+)/);
  const ttl = ttlM ? Number(ttlM[1]) : NaN;
  const age = ageM ? Number(ageM[1]) : NaN;
  const swr = swrM ? Number(swrM[1]) : NaN;
  // Ordering invariant: cache TTL <= CDN max-age, so the instance cache is
  // expired when the CDN revalidates and returns FRESH upstream data.
  assert(ttl <= age, `CACHE_TTL (${ttl}s) <= CDN max-age (${age}s)`);
  // Budget guard: with the CDN keeping origin to ~1 hit/max-age per POP,
  // upstream load ~= POPs * 60/TTL; TTL >= 20s keeps a comfortable margin
  // under the 10 req/min free tier even at a few POPs.
  assert(ttl >= 20, `CACHE_TTL (${ttl}s) keeps upstream under free-tier budget`);
  // Freshness guard: total CDN staleness (age + swr) stays ~<= 1 min.
  assert(age + swr <= 60, `CDN staleness window age+swr (${age + swr}s) <= 60s`);
}
assert(/Netlify-CDN-Cache-Control/.test(src), "Netlify CDN cache header");
assert(/stale-while-revalidate/.test(src), "stale-while-revalidate for smooth refresh");
assert(/"Vary":\s*"Origin"/.test(src),
  "Vary: Origin (per-origin ACAO header is CDN-cached)");

// Soft-failure stance: upstream errors degrade, never 500.
assert(/available:\s*false/.test(src), "degrades to available:false");
assert(/stale:\s*true/.test(src), "serves last payload flagged stale on upstream failure");
assert(!/statusCode:\s*500/.test(src), "never returns 500 (nicety, not a dependency)");

// Timeout discipline (Netlify 10s budget) — now lives in the shared http.js,
// reused by every source client (de-duplicated).
{
  const http = fs.readFileSync(
    "/home/user/Beeri-World-Cup/netlify/functions/_sources/http.js", "utf8");
  assert(/3500/.test(http), "shared http.js: 3.5s default timeout");
  assert(/AbortController/.test(http), "shared http.js: abortable fetch");
  assert(/from "\.\/_sources\/http\.js"/.test(src),
    "endpoint imports the shared getJson/dayWindow (no duplicate copy)");
  assert(!/new AbortController\(\)/.test(src),
    "endpoint no longer hand-rolls its own fetch (dedup)");
}

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
