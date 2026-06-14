// Public live-scores endpoint for the home-page LiveNow card.
//
// GET, no auth, no Firestore. A thin cached proxy over football-data.org:
// fetches the competition's matches for a +/-1 day window around "now",
// normalizes them (see _sources/liveNormalize.js) and returns:
//
//   { available: true, fetchedAt: <ISO>, matches: [...] }
//
// Cost / rate-limit discipline (football-data free tier = 10 req/min):
//   1. In-memory cache per warm instance (CACHE_TTL_MS) — concurrent
//      invocations on the same instance share one upstream fetch via an
//      in-flight promise. THIS is the true upstream rate limiter: the
//      instance calls football-data at most once per CACHE_TTL_MS, i.e.
//      ~60/CACHE_TTL calls/min, no matter how many clients poll.
//   2. Cache-Control headers let Netlify's CDN collapse the client polling
//      fan-out (clients poll ~20s; the CDN serves one origin hit per
//      max-age window per edge POP regardless of user count). Because the
//      CDN keeps origin traffic to ~1 hit / max-age, the function stays at
//      ~1 warm instance per POP, so upstream load ≈ POPs × 60/CACHE_TTL.
//   3. The client only polls at all while a match is inside its live
//      window (src/hooks/useLiveScores.ts) — zero traffic on rest days.
//
// Latency budget (minimize delay WITHOUT leaving the free tier):
//   With CACHE_TTL=25s and CDN max-age=30s, a small (1-2 POP) audience
//   drives ~2-5 upstream req/min — comfortably under 10 with >2x margin —
//   while cutting the server+CDN staleness from ~4 min to ~1 min. Client
//   polling (see useLiveScores.ts) is CDN-collapsed, so polling faster is
//   free against this budget and is tuned independently. The residual
//   delay is football-data's own free-tier feed latency, which no amount
//   of client/server tuning can beat.
//
// Failure stance: this endpoint powers a *nicety* (live score display).
// Official scoring flows through Firestore auto-fill/admin entry and never
// depends on it. So upstream failures degrade softly: serve the last
// payload we have (flagged stale), else { available: false } with 200 —
// the client falls back to the schedule-derived "משוחק עכשיו" UI.

import { withSentry } from "./_sentry.js";
import { normalizeFdMatches } from "./_sources/liveNormalize.js";

const BASE = "https://api.football-data.org/v4";
const FETCH_TIMEOUT_MS = 3500;
// Fresh-for window. Kept just under the CDN max-age so that when the CDN
// revalidates at its boundary the instance cache has already expired and
// returns FRESH upstream data, rather than re-serving its own stale copy.
const CACHE_TTL_MS = 25 * 1000;
// How long a stale payload is still worth serving when upstream is down.
const STALE_MAX_MS = 10 * 60 * 1000;

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "https://beeri-world-cup.web.app,https://beeri-world-cup.firebaseapp.com,http://localhost:5173"
).split(",");

function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    // CDN-cacheable: collapses N polling clients into ~1 origin hit per
    // max-age per POP. max-age is the freshness window; stale-while-
    // revalidate is kept short (≈ one refresh cycle) so the CDN serves the
    // background-refreshed payload almost immediately instead of trailing a
    // long stale shadow — the SWR window was the single biggest avoidable
    // contributor to the live-score delay.
    "Cache-Control": "public, max-age=30, stale-while-revalidate=30",
    "Netlify-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=30",
    // The ACAO header above is per-origin while the response is CDN-cached —
    // without Vary the first requester's origin would be served to everyone.
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function dayWindow(nowMs) {
  const from = new Date(nowMs - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(nowMs + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

async function getJson(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "X-Auth-Token": token },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Module-level state survives across invocations on a warm instance.
let cached = null; // { at: number, payload: object }
let inFlight = null; // Promise — concurrent invocations share one fetch

async function fetchUpstream(nowMs) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const comp = process.env.AUTO_FILL_COMPETITION_ID_FD;
  if (!token || !comp) {
    // Misconfiguration is indistinguishable from "feature off" for the
    // client: soft-degrade, never 500 (the card falls back gracefully).
    return { available: false, fetchedAt: new Date(nowMs).toISOString(), matches: [] };
  }
  const { from, to } = dayWindow(nowMs);
  const url = `${BASE}/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${from}&dateTo=${to}`;
  const data = await getJson(url, token);
  return {
    available: true,
    fetchedAt: new Date(nowMs).toISOString(),
    matches: normalizeFdMatches(data?.matches),
  };
}

async function liveScoresHandler(event) {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "GET") {
    return json(405, headers, { error: "Method Not Allowed" });
  }
  // Hard kill switch — flip LIVE_SCORES_DISABLED=true in Netlify to turn the
  // feature off instantly (clients degrade to the schedule-based UI).
  if (process.env.LIVE_SCORES_DISABLED === "true") {
    return json(200, headers, { available: false, matches: [] });
  }

  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return json(200, headers, cached.payload);
  }

  if (!inFlight) {
    inFlight = fetchUpstream(now)
      .then((payload) => {
        cached = { at: Date.now(), payload };
        return payload;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  try {
    const payload = await inFlight;
    return json(200, headers, payload);
  } catch (err) {
    console.error("live-scores upstream failed:", err?.message || err);
    // Serve the last known payload if it's not ancient — a 5-minute-old
    // score beats no score, and the client labels staleness by fetchedAt.
    if (cached && now - cached.at < STALE_MAX_MS) {
      return json(200, headers, { ...cached.payload, stale: true });
    }
    return json(200, headers, { available: false, matches: [] });
  }
}

export const handler = withSentry(liveScoresHandler, "get-live-scores");
