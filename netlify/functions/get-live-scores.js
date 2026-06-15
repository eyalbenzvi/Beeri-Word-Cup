// Public live-scores endpoint for the home-page LiveNow card.
//
// GET, no auth, no Firestore. A thin cached proxy over a live-score feed:
// fetches matches for a +/-1 day window around "now", normalizes them into a
// source-agnostic shape and returns:
//
//   { available: true, fetchedAt: <ISO>, source: "espn"|"fd", matches: [...] }
//
// Source strategy (PRIMARY = ESPN, FALLBACK = football-data):
//   - ESPN's free, key-less soccer scoreboard carries genuinely REAL-TIME
//     in-play scores and has no practical rate limit for our usage, so it is
//     the primary source — this is what removes the minutes-long delay.
//   - football-data.org's free tier deliberately DELAYS scores by minutes, so
//     it is only the fallback for when ESPN is unreachable. Its free-tier
//     budget (10 req/min) is why the caching below exists.
//   - LIVE_SOURCE env overrides selection: "espn" (only) / "fd" (only) /
//     unset = ESPN then FD. Flip to "fd" instantly if ESPN's slug ever breaks.
//
// Cost / rate-limit discipline (matters for the football-data fallback path):
//   1. In-memory cache per warm instance (CACHE_TTL_MS) — concurrent
//      invocations on the same instance share one upstream fetch via an
//      in-flight promise. THIS is the true upstream rate limiter: the
//      instance hits the feed at most once per CACHE_TTL_MS, i.e.
//      ~60/CACHE_TTL calls/min, no matter how many clients poll.
//   2. Cache-Control headers let Netlify's CDN collapse the client polling
//      fan-out (clients poll ~20s; the CDN serves one origin hit per
//      max-age window per edge POP regardless of user count). Because the
//      CDN keeps origin traffic to ~1 hit / max-age, the function stays at
//      ~1 warm instance per POP, so upstream load ≈ POPs × 60/CACHE_TTL.
//   3. The client only polls at all while a match is inside its live
//      window (src/hooks/useLiveScores.ts) — zero traffic on rest days.
//
// Latency: ESPN is real-time, so end-to-end delay is now just the cache
// stack — CACHE_TTL=25s + CDN max-age=30s + client poll ~20s ≈ ~1 min worst
// case. (On the FD fallback path that floor sits on top of FD's own
// minutes-long feed delay.) Polling faster is free against the FD budget
// because it is CDN-collapsed, so the client cadence is tuned independently.
//
// Failure stance: this endpoint powers a *nicety* (live score display).
// Official scoring flows through Firestore auto-fill/admin entry and never
// depends on it. So upstream failures degrade softly: serve the last
// payload we have (flagged stale), else { available: false } with 200 —
// the client falls back to the schedule-derived "משוחק עכשיו" UI.

import { withSentry } from "./_sentry.js";
import { normalizeFdMatches } from "./_sources/liveNormalize.js";
import { normalizeEspnEvents } from "./_sources/espnLive.js";

const FD_BASE = "https://api.football-data.org/v4";
// ESPN's undocumented soccer scoreboard. The league slug for the World Cup is
// "fifa.world"; override via env if ESPN renames it for 2026.
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_LEAGUE = process.env.ESPN_SOCCER_LEAGUE || "fifa.world";
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

// football-data wants ISO dates (YYYY-MM-DD); ESPN wants compact (YYYYMMDD).
function dayWindow(nowMs) {
  const from = new Date(nowMs - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(nowMs + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

async function getJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: headers || {}, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Module-level state survives across invocations on a warm instance.
let cached = null; // { at: number, payload: object }
let inFlight = null; // Promise — concurrent invocations share one fetch

function payload(nowMs, source, matches) {
  return {
    available: true,
    fetchedAt: new Date(nowMs).toISOString(),
    source,
    matches,
  };
}

// PRIMARY: ESPN real-time scoreboard. No token, no practical rate limit.
async function fetchEspn(nowMs) {
  const { from, to } = dayWindow(nowMs);
  const dates = `${from.replace(/-/g, "")}-${to.replace(/-/g, "")}`;
  const url = `${ESPN_BASE}/${encodeURIComponent(ESPN_LEAGUE)}/scoreboard?dates=${dates}&limit=200`;
  const data = await getJson(url);
  return payload(nowMs, "espn", normalizeEspnEvents(data?.events));
}

// FALLBACK: football-data.org free tier (deliberately delayed). Missing
// config soft-degrades (the card falls back to schedule UI), never 500s.
async function fetchFootballData(nowMs) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const comp = process.env.AUTO_FILL_COMPETITION_ID_FD;
  if (!token || !comp) {
    return { available: false, fetchedAt: new Date(nowMs).toISOString(), matches: [] };
  }
  const { from, to } = dayWindow(nowMs);
  const url = `${FD_BASE}/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${from}&dateTo=${to}`;
  const data = await getJson(url, { "X-Auth-Token": token });
  return payload(nowMs, "fd", normalizeFdMatches(data?.matches));
}

async function fetchUpstream(nowMs) {
  const source = process.env.LIVE_SOURCE; // "espn" | "fd" | undefined
  if (source === "fd") return fetchFootballData(nowMs);
  if (source === "espn") return fetchEspn(nowMs);
  // Default: ESPN primary, football-data fallback only on ESPN error. An
  // ESPN response with zero matches is a legitimate rest-day result, NOT a
  // failure — falling back then would needlessly spend the FD budget.
  try {
    return await fetchEspn(nowMs);
  } catch (err) {
    console.error("live-scores ESPN failed, falling back to FD:", err?.message || err);
    return fetchFootballData(nowMs);
  }
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
