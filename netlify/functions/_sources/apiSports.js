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
  // Only accept a match within 2h of the expected kickoff. Group days can have
  // fixtures ~3h apart, so a wider window risks selecting an adjacent fixture;
  // 2h comfortably covers a single match's duration without reaching the next.
  return bestDelta <= 2 * 3600 * 1000 ? best : null;
}

// Real 3-letter code from a team payload, or null if the API didn't provide
// one (the fixtures endpoint usually omits it).
function realCode(team) {
  const c = team?.code || team?.tla;
  return c ? norm(c) : null;
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
  let home90 = typeof ft.home === "number" ? ft.home : null;
  let away90 = typeof ft.away === "number" ? ft.away : null;

  // Resolve codes. The fixtures endpoint usually omits a 3-letter code, in
  // which case we fall back to the expected codes and ASSUME the provider used
  // the same home/away designation as our schedule. If the provider listed the
  // fixture in the opposite order, the score will disagree with the primary
  // source and consensus will (safely) decline to write rather than record a
  // reversed score. When real codes ARE present, we orient explicitly.
  const apiHome = realCode(fixture?.teams?.home);
  const apiAway = realCode(fixture?.teams?.away);
  let homeWinner = fixture?.teams?.home?.winner === true;
  let awayWinner = fixture?.teams?.away?.winner === true;
  let homeCode = apiHome || norm(homeTeam);
  let awayCode = apiAway || norm(awayTeam);
  if (apiHome && apiAway && apiHome === norm(awayTeam) && apiAway === norm(homeTeam)) {
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
