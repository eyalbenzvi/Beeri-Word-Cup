// TEMPORARY, READ-ONLY discovery endpoint for setting up auto-fill.
//
// Because the team-name strings + league/competition IDs can only be checked
// against the live football APIs (and those APIs can't be reached from the dev
// sandbox), this endpoint lets you verify everything from a browser AFTER
// deploying: it queries both APIs server-side and returns a JSON report.
//
// It writes NOTHING and touches no game data. It is gated by a secret so it
// isn't world-open:
//   - Set env var AUTO_FILL_DISCOVER_SECRET to a long random string.
//   - Open:  https://<your-site>/.netlify/functions/auto-fill-discover?secret=<that string>
//   - When done, delete the env var (the endpoint then returns 404) or remove
//     this file.
//
// Uses the same env vars the real auto-fill uses:
//   FOOTBALL_DATA_TOKEN, AUTO_FILL_COMPETITION_ID_FD,
//   API_SPORTS_KEY, AUTO_FILL_LEAGUE_ID_AS, AUTO_FILL_SEASON_AS

import { withSentry } from "./_sentry.js";
import { matchTeamName, __test__ as TC } from "./_sources/teamCodes.js";

const OUR_CODES = Object.keys(TC.ALIASES);

async function getJson(url, headers) {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* leave null */ }
    return { status: res.status, ok: res.ok, json, text };
  } catch (err) {
    return { status: 0, ok: false, json: null, text: String(err?.message || err) };
  }
}

async function discoverFootballData() {
  const out = { configured: false, notes: [] };
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const comp = process.env.AUTO_FILL_COMPETITION_ID_FD || "WC";
  out.competitionId = comp;
  if (!token) { out.notes.push("FOOTBALL_DATA_TOKEN not set"); return out; }
  out.configured = true;
  const H = { "X-Auth-Token": token };

  const comps = await getJson("https://api.football-data.org/v4/competitions", H);
  if (!comps.ok) out.notes.push(`/competitions -> HTTP ${comps.status}: ${comps.text?.slice(0, 160)}`);
  else {
    out.worldCupCompetitions = (comps.json?.competitions || [])
      .filter((c) => /world cup/i.test(c.name) || c.code === "WC")
      .map((c) => ({ code: c.code, id: c.id, name: c.name }));
  }

  const teams = await getJson(`https://api.football-data.org/v4/competitions/${encodeURIComponent(comp)}/teams`, H);
  if (!teams.ok) out.notes.push(`/competitions/${comp}/teams -> HTTP ${teams.status}: ${teams.text?.slice(0, 160)}`);
  else {
    const tlas = (teams.json?.teams || []).map((t) => t.tla).filter(Boolean).sort();
    out.teamCount = teams.json?.teams?.length ?? 0;
    out.tlaCodes = tlas;
    out.ourCodesMissingFromFD = OUR_CODES.filter((c) => !tlas.includes(c));
  }

  const matches = await getJson(`https://api.football-data.org/v4/competitions/${encodeURIComponent(comp)}/matches`, H);
  if (!matches.ok) out.notes.push(`/competitions/${comp}/matches -> HTTP ${matches.status}: ${matches.text?.slice(0, 160)}`);
  else {
    const ms = matches.json?.matches || [];
    const finished = ms.filter((m) => m.status === "FINISHED");
    out.matchesTotal = ms.length;
    out.matchesFinished = finished.length;
    const s = finished[0] || ms[0];
    if (s) out.sampleMatch = {
      home: s.homeTeam?.tla, away: s.awayTeam?.tla, status: s.status,
      fullTime: s.score?.fullTime, duration: s.score?.duration, winner: s.score?.winner,
      // Full raw score object so we can confirm the exact v4 schema (does it
      // expose score.regularTime / halfTime / extraTime / penalties?). This is
      // how we verify the 90'-vs-extra-time handling against live data.
      rawScore: s.score,
    };
    // Prefer a finished extra-time/penalty match if any exists — that's the one
    // that reveals how the 90' score is represented when ET was played.
    const etMatch = finished.find((m) => m.score?.duration && m.score.duration !== "REGULAR");
    if (etMatch) out.sampleExtraTimeMatch = {
      home: etMatch.homeTeam?.tla, away: etMatch.awayTeam?.tla,
      duration: etMatch.score?.duration, rawScore: etMatch.score,
    };
  }
  return out;
}

async function discoverApiSports() {
  const out = { configured: false, notes: [] };
  const key = process.env.API_SPORTS_KEY;
  const league = process.env.AUTO_FILL_LEAGUE_ID_AS;
  const season = process.env.AUTO_FILL_SEASON_AS;
  out.leagueId = league || null;
  out.season = season || null;
  if (!key) { out.notes.push("API_SPORTS_KEY not set"); return out; }
  out.configured = true;
  const H = { "x-apisports-key": key };

  const leagues = await getJson("https://v3.football.api-sports.io/leagues?search=World Cup", H);
  if (!leagues.ok) out.notes.push(`/leagues -> HTTP ${leagues.status}`);
  else if (leagues.json?.errors && Object.keys(leagues.json.errors).length) out.notes.push(`/leagues errors: ${JSON.stringify(leagues.json.errors)}`);
  else out.worldCupLeagues = (leagues.json?.response || []).slice(0, 8).map((l) => ({
    id: l.league?.id, name: l.league?.name, type: l.league?.type,
    seasons: (l.seasons || []).map((s) => s.year),
  }));

  if (league && season) {
    const teams = await getJson(`https://v3.football.api-sports.io/teams?league=${league}&season=${season}`, H);
    if (!teams.ok) out.notes.push(`/teams -> HTTP ${teams.status}`);
    else if (teams.json?.errors && Object.keys(teams.json.errors).length) out.notes.push(`/teams errors: ${JSON.stringify(teams.json.errors)}`);
    else {
      const names = (teams.json?.response || []).map((t) => t.team?.name).filter(Boolean);
      const matched = new Set();
      const unrecognized = [];
      for (const n of names) {
        const code = matchTeamName(n);
        if (code) matched.add(code); else unrecognized.push(n);
      }
      out.teamCount = names.length;
      out.recognized = matched.size;
      out.unrecognizedNames = unrecognized;            // <-- the key output: add these as aliases
      out.ourCodesNotMatched = OUR_CODES.filter((c) => !matched.has(c));
    }

    const fixtures = await getJson(`https://v3.football.api-sports.io/fixtures?league=${league}&season=${season}`, H);
    if (fixtures.ok && !(fixtures.json?.errors && Object.keys(fixtures.json.errors).length)) {
      const fs = fixtures.json?.response || [];
      const finished = fs.filter((f) => ["FT", "AET", "PEN"].includes(f.fixture?.status?.short));
      out.fixturesTotal = fs.length;
      out.fixturesFinished = finished.length;
      const s = finished[0] || fs[0];
      if (s) out.sampleFixture = {
        home: s.teams?.home?.name, away: s.teams?.away?.name,
        status: s.fixture?.status?.short, fulltime: s.score?.fulltime, goals: s.goals,
      };
    } else out.notes.push(`/fixtures -> HTTP ${fixtures.status} ${JSON.stringify(fixtures.json?.errors || "")}`);
  }
  return out;
}

async function discoverHandler(event) {
  const secret = process.env.AUTO_FILL_DISCOVER_SECRET;
  const provided = event?.queryStringParameters?.secret;
  // Disabled unless a secret is configured AND matches. Returns 404 otherwise
  // so the endpoint is indistinguishable from "not deployed".
  if (!secret || provided !== secret) {
    return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Not found" }) };
  }

  const [footballData, apiSports] = await Promise.all([
    discoverFootballData(),
    discoverApiSports(),
  ]);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), footballData, apiSports }, null, 2),
  };
}

export const handler = withSentry(discoverHandler, "auto-fill-discover");
