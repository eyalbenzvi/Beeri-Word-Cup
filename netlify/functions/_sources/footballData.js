// Thin client for football-data.org (PRIMARY source).
//
// Contract:
//   fetchMatchResult({ fifaMatch, homeTeam, awayTeam, kickoffIso })
//     -> normalized source result (see consensus.js), or { name, error:true }
//
// Env:
//   FOOTBALL_DATA_TOKEN            - X-Auth-Token header value
//   AUTO_FILL_COMPETITION_ID_FD    - competition code/id (e.g. "WC")
//
// We record the END-OF-90-MINUTES score only: score.fullTime.{home,away}.
// score.duration ("REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT") tells us
// whether the match went beyond 90'; for a knockout tie at 90' we read the
// overall winner (score.winner) to report the advancing team. We never use the
// aggregate/ET total as the recorded score.

import { norm, ourCode } from "./fdCodes.js";

const NAME = "football-data";
const BASE = "https://api.football-data.org/v4";
// Keep the fetch budget small enough that one retry across both sources (run
// in parallel) stays under a typical 10s Netlify function timeout: 3.5s x 2
// sequential attempts = 7s worst case per source. A killed function would
// otherwise leave the per-match lock held until it expires.
const TIMEOUT_MS = 3500;

function dayBounds(kickoffIso) {
  // Query a +/-1 day window around the kickoff to absorb timezone skew.
  const t = new Date(kickoffIso).getTime();
  const from = new Date(t - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(t + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

async function getJson(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

// Find the fixture whose two teams' codes are exactly the expected pair
// (orientation-independent), comparing in OUR code space.
function findFixture(matches, homeTeam, awayTeam) {
  const want = new Set([norm(homeTeam), norm(awayTeam)]);
  return (matches || []).find((m) => {
    const h = ourCode(m?.homeTeam?.tla);
    const a = ourCode(m?.awayTeam?.tla);
    return h && a && want.has(h) && want.has(a) && h !== a;
  });
}

function tlaWinner(match) {
  // score.winner is "HOME_TEAM" | "AWAY_TEAM" | "DRAW" for the overall result.
  const w = match?.score?.winner;
  if (w === "HOME_TEAM") return ourCode(match?.homeTeam?.tla) || null;
  if (w === "AWAY_TEAM") return ourCode(match?.awayTeam?.tla) || null;
  return null;
}

export async function fetchMatchResult({ homeTeam, awayTeam, kickoffIso }) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const comp = process.env.AUTO_FILL_COMPETITION_ID_FD;
  if (!token || !comp) {
    return { name: NAME, error: true, reason: "missing FD env config" };
  }

  const { from, to } = dayBounds(kickoffIso);
  const url = `${BASE}/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${from}&dateTo=${to}`;

  // One request + a single fallback retry on transient failure, then give up.
  let data;
  try {
    data = await getJson(url, token);
  } catch (err1) {
    try {
      data = await getJson(url, token);
    } catch (err2) {
      return { name: NAME, error: true, reason: err2?.message || String(err2) };
    }
  }

  const match = findFixture(data?.matches, homeTeam, awayTeam);
  if (!match) {
    // No fixture found yet -> treat as not finished (don't write).
    return { name: NAME, error: false, finished: false, reason: "fixture not found" };
  }

  const finished = match.status === "FINISHED";
  const duration = match?.score?.duration || null;

  // END-OF-90-MINUTES score only. In football-data v4, score.fullTime is the
  // FINAL result and, for a knockout that went to extra time, INCLUDES extra
  // time (e.g. 2-1 even though it was 1-1 at 90'). The 90' score, when the API
  // exposes it, lives in score.regularTime. Strategy that is correct no matter
  // the exact field name:
  //   - regularTime present            -> use it (the true 90' score);
  //   - else duration === "REGULAR"    -> fullTime IS the 90' score (no ET);
  //   - else (ET/PEN, no regularTime)  -> we cannot isolate 90' -> leave null,
  //     which sets regulationAmbiguous below and declines to write (the match
  //     is then entered manually). Group-stage matches are always REGULAR, so
  //     they are unaffected.
  const ft = match?.score?.fullTime || {};
  const reg = match?.score?.regularTime || null;
  let home90 = null;
  let away90 = null;
  if (reg && typeof reg.home === "number" && typeof reg.away === "number") {
    home90 = reg.home;
    away90 = reg.away;
  } else if (duration === "REGULAR") {
    home90 = typeof ft.home === "number" ? ft.home : null;
    away90 = typeof ft.away === "number" ? ft.away : null;
  }
  let homeCode = ourCode(match?.homeTeam?.tla) || null;
  let awayCode = ourCode(match?.awayTeam?.tla) || null;

  // Orient to OUR schedule's home/away. football-data may list the fixture in
  // the opposite order (nominal "home" is arbitrary for neutral-venue and
  // knockout games); if so, swap both the score and the codes so downstream
  // consensus compares like-for-like and never records a reversed score.
  if (norm(homeCode) === norm(awayTeam) && norm(awayCode) === norm(homeTeam)) {
    [home90, away90] = [away90, home90];
    [homeCode, awayCode] = [awayCode, homeCode];
  }

  // FINISHED but no clean 90' score -> can't isolate regulation.
  const regulationAmbiguous = finished && (home90 == null || away90 == null);

  // Advancing team only matters for a knockout level at 90'. tlaWinner returns
  // the overall winner's code, which is orientation-independent.
  const advancingTeam =
    finished && home90 != null && away90 != null && home90 === away90
      ? tlaWinner(match)
      : null;

  return {
    name: NAME,
    error: false,
    finished,
    home90,
    away90,
    homeCode,
    awayCode,
    advancingTeam,
    duration,
    regulationAmbiguous,
  };
}
