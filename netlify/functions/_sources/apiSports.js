// Thin client for api-sports.io / API-Football (SECONDARY source).
//
// Contract:
//   fetchMatchResult({ fifaMatch, homeTeam, awayTeam, kickoffIso })
//     -> normalized source result (see consensus.js), or { name, error:true }
//
// Env:
//   API_SPORTS_KEY             - "x-apisports-key" header value
//   AUTO_FILL_LEAGUE_ID_AS     - numeric league id (World Cup)
//   AUTO_FILL_SEASON_AS        - season year (optional; derived from kickoff)
//
// IMPORTANT: we read score.fulltime.{home,away} (the END-OF-90-MINUTES score),
// NOT goals.* (which on api-sports is the running/aggregate total and includes
// extra time). fixture.status.short of FT / AET / PEN means finished. For a
// knockout level at 90', teams.{home,away}.winner identifies who went through.
//
// Team identity: the fixtures endpoint exposes team NAMES (and ids), not FIFA
// codes. We CANNOT identify a fixture by kickoff time, because on the final
// group matchday the two games in a group kick off SIMULTANEOUSLY. So we
// identify the fixture by its two teams: resolve each team name to our FIFA
// code (teamCodes.js) and match the expected pair. A date range narrows the
// query; identity disambiguates within it.

import { matchTeamName } from "./teamCodes.js";

const NAME = "api-sports";
const BASE = "https://v3.football.api-sports.io";
// See footballData.js: keep the fetch budget under the function timeout.
const TIMEOUT_MS = 3500;
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

function norm(s) {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
}

function seasonFromKickoff(kickoffIso) {
  const y = new Date(kickoffIso).getUTCFullYear();
  return Number.isFinite(y) ? String(y) : "";
}

function dayBounds(kickoffIso) {
  // +/-1 day window absorbs timezone skew (a late-night Israel kickoff can fall
  // on the adjacent UTC day).
  const t = new Date(kickoffIso).getTime();
  const from = new Date(t - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(t + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

async function getJson(url, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "x-apisports-key": key },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`api-sports HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Resolve an api-sports team payload to our FIFA code: prefer an explicit code
// field if the API ever provides one, else map the team name via teamCodes.js.
function resolveCode(team) {
  const explicit = team?.code || team?.tla;
  if (explicit) return norm(explicit);
  return matchTeamName(team?.name); // FIFA code or null
}

// Find the fixture whose two teams resolve to the expected pair (orientation-
// independent). This is robust to simultaneous kickoffs.
function findFixture(fixtures, homeTeam, awayTeam) {
  const want = new Set([norm(homeTeam), norm(awayTeam)]);
  return (fixtures || []).find((f) => {
    const h = resolveCode(f?.teams?.home);
    const a = resolveCode(f?.teams?.away);
    return h && a && want.has(h) && want.has(a) && h !== a;
  });
}

export async function fetchMatchResult({ homeTeam, awayTeam, kickoffIso }) {
  const key = process.env.API_SPORTS_KEY;
  const league = process.env.AUTO_FILL_LEAGUE_ID_AS;
  const season = process.env.AUTO_FILL_SEASON_AS || seasonFromKickoff(kickoffIso);
  if (!key || !league || !season) {
    return { name: NAME, error: true, reason: "missing AS env config" };
  }

  const { from, to } = dayBounds(kickoffIso);
  const url = `${BASE}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}&from=${from}&to=${to}`;

  let data;
  try {
    data = await getJson(url, key);
  } catch (err1) {
    try {
      data = await getJson(url, key);
    } catch (err2) {
      return { name: NAME, error: true, reason: err2?.message || String(err2) };
    }
  }

  const fixture = findFixture(data?.response, homeTeam, awayTeam);
  if (!fixture) {
    return { name: NAME, error: false, finished: false, reason: "fixture not found" };
  }

  const short = fixture?.fixture?.status?.short || null;
  const finished = FINISHED_STATUSES.has(short);

  // score.fulltime = end of 90'. NOT goals.* (aggregate incl. ET).
  const ft = fixture?.score?.fulltime || {};
  let home90 = typeof ft.home === "number" ? ft.home : null;
  let away90 = typeof ft.away === "number" ? ft.away : null;

  // Orient to OUR schedule's home/away. We matched the fixture by team
  // identity, so resolveCode is reliable here; if the API lists the pair in the
  // opposite order, swap score + codes + winner so downstream consensus
  // compares like-for-like and never records a reversed score.
  const apiHome = resolveCode(fixture?.teams?.home) || norm(homeTeam);
  const apiAway = resolveCode(fixture?.teams?.away) || norm(awayTeam);
  let homeWinner = fixture?.teams?.home?.winner === true;
  let awayWinner = fixture?.teams?.away?.winner === true;
  let homeCode = apiHome;
  let awayCode = apiAway;
  if (apiHome === norm(awayTeam) && apiAway === norm(homeTeam)) {
    [home90, away90] = [away90, home90];
    [homeCode, awayCode] = [awayCode, homeCode];
    [homeWinner, awayWinner] = [awayWinner, homeWinner];
  }

  const regulationAmbiguous = finished && (home90 == null || away90 == null);

  // Advancing team only for a knockout tie at 90'.
  let advancingTeam = null;
  if (finished && home90 != null && away90 != null && home90 === away90) {
    if (homeWinner) advancingTeam = homeCode;
    else if (awayWinner) advancingTeam = awayCode;
  }

  return {
    name: NAME,
    error: false,
    finished,
    home90,
    away90,
    homeCode,
    awayCode,
    advancingTeam,
    duration: short, // FT vs AET/PEN doubles as the ET/PEN indicator here
    regulationAmbiguous,
  };
}
