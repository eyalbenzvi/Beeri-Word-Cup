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

const NAME = "football-data";
const BASE = "https://api.football-data.org/v4";
const TIMEOUT_MS = 8000;

function dayBounds(kickoffIso) {
  // Query a +/-1 day window around the kickoff to absorb timezone skew.
  const t = new Date(kickoffIso).getTime();
  const from = new Date(t - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(t + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

function norm(s) {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
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

// Find the fixture whose two teams' TLA codes are exactly the expected pair
// (orientation-independent). football-data TLAs are FIFA-aligned, so this is a
// reliable identity match.
function findFixture(matches, homeTeam, awayTeam) {
  const want = new Set([norm(homeTeam), norm(awayTeam)]);
  return (matches || []).find((m) => {
    const h = norm(m?.homeTeam?.tla);
    const a = norm(m?.awayTeam?.tla);
    return h && a && want.has(h) && want.has(a) && h !== a;
  });
}

function tlaWinner(match) {
  // score.winner is "HOME_TEAM" | "AWAY_TEAM" | "DRAW" for the overall result.
  const w = match?.score?.winner;
  if (w === "HOME_TEAM") return match?.homeTeam?.tla || null;
  if (w === "AWAY_TEAM") return match?.awayTeam?.tla || null;
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
  const ft = match?.score?.fullTime || {};
  const home90 = typeof ft.home === "number" ? ft.home : null;
  const away90 = typeof ft.away === "number" ? ft.away : null;
  const duration = match?.score?.duration || null;

  // FINISHED but no clean 90' score -> can't isolate regulation.
  const regulationAmbiguous = finished && (home90 == null || away90 == null);

  // Advancing team only matters for a knockout level at 90'.
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
    homeCode: match?.homeTeam?.tla || null,
    awayCode: match?.awayTeam?.tla || null,
    advancingTeam,
    duration,
    regulationAmbiguous,
  };
}
