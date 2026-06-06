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
// Team identity: the fixtures endpoint exposes team names + ids but not FIFA
// 3-letter codes. We locate the fixture by kickoff proximity within the league
// + season + date and, when an explicit code is present on the payload, report
// it; otherwise we fall back to the server-authoritative expected codes (the
// PRIMARY source enforces code identity, and both sources must agree on the
// score). This single spot is the one most likely to need tuning against the
// live API once real World Cup fixtures exist.

const NAME = "api-sports";
const BASE = "https://v3.football.api-sports.io";
const TIMEOUT_MS = 8000;
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

function norm(s) {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
}

function seasonFromKickoff(kickoffIso) {
  const y = new Date(kickoffIso).getUTCFullYear();
  return Number.isFinite(y) ? String(y) : "";
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

// Pick the fixture closest in kickoff time to the expected kickoff. With a
// league+season+date query the result set is small (a handful of fixtures on
// the day), so nearest-kickoff is a robust selector.
function pickClosest(fixtures, kickoffIso) {
  const target = new Date(kickoffIso).getTime();
  let best = null;
  let bestDelta = Infinity;
  for (const f of fixtures || []) {
    const ts = f?.fixture?.timestamp
      ? f.fixture.timestamp * 1000
      : f?.fixture?.date
        ? new Date(f.fixture.date).getTime()
        : NaN;
    if (!Number.isFinite(ts)) continue;
    const delta = Math.abs(ts - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = f;
    }
  }
  // Only accept a match within a 6-hour window of the expected kickoff.
  return bestDelta <= 6 * 3600 * 1000 ? best : null;
}

// Best-effort 3-letter code from a team payload, else the expected fallback.
function teamCode(team, fallback) {
  const c = team?.code || team?.tla;
  return c ? norm(c) : norm(fallback);
}

export async function fetchMatchResult({ homeTeam, awayTeam, kickoffIso }) {
  const key = process.env.API_SPORTS_KEY;
  const league = process.env.AUTO_FILL_LEAGUE_ID_AS;
  const season = process.env.AUTO_FILL_SEASON_AS || seasonFromKickoff(kickoffIso);
  if (!key || !league || !season) {
    return { name: NAME, error: true, reason: "missing AS env config" };
  }

  const date = new Date(kickoffIso).toISOString().slice(0, 10);
  const url = `${BASE}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}&date=${date}`;

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

  const fixture = pickClosest(data?.response, kickoffIso);
  if (!fixture) {
    return { name: NAME, error: false, finished: false, reason: "fixture not found" };
  }

  const short = fixture?.fixture?.status?.short || null;
  const finished = FINISHED_STATUSES.has(short);

  // score.fulltime = end of 90'. NOT goals.* (aggregate incl. ET).
  const ft = fixture?.score?.fulltime || {};
  const home90 = typeof ft.home === "number" ? ft.home : null;
  const away90 = typeof ft.away === "number" ? ft.away : null;

  const regulationAmbiguous = finished && (home90 == null || away90 == null);

  const homeCode = teamCode(fixture?.teams?.home, homeTeam);
  const awayCode = teamCode(fixture?.teams?.away, awayTeam);

  // Advancing team only for a knockout tie at 90'.
  let advancingTeam = null;
  if (finished && home90 != null && away90 != null && home90 === away90) {
    if (fixture?.teams?.home?.winner === true) advancingTeam = homeCode;
    else if (fixture?.teams?.away?.winner === true) advancingTeam = awayCode;
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
