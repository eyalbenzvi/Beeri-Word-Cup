#!/usr/bin/env node
// Auto-fill discovery + dry-run. Run LOCALLY with your real API keys.
// It only READS from the football APIs and prints a report — it writes
// NOTHING to Firestore and never touches your game data.
//
// What it checks:
//   1. football-data.org: that your token works, the World Cup competition is
//      reachable, and lists each team's 3-letter code (tla) + fixture count.
//   2. api-sports: that your key works, the league/season is reachable, and —
//      crucially — lists the exact team NAME strings api-sports uses, then
//      cross-checks them against our name->code table (teamCodes.js). It tells
//      you exactly which names are unrecognized (so we can add the alias) and
//      which of our 48 teams weren't found.
//   3. Optional: a real two-source consensus DRY-RUN for one match (once games
//      have started), printing what each source returned and the decision —
//      without writing anything.
//
// Usage (one line, paste your real values):
//   FOOTBALL_DATA_TOKEN=xxx AUTO_FILL_COMPETITION_ID_FD=WC \
//   API_SPORTS_KEY=yyy AUTO_FILL_LEAGUE_ID_AS=1 AUTO_FILL_SEASON_AS=2026 \
//   node scripts/auto-fill-discover.mjs
//
// Dry-run one match (after it has finished), e.g.:
//   ...same env... node scripts/auto-fill-discover.mjs \
//     --home MEX --away RSA --kickoff 2026-06-11T19:00:00Z

import { matchTeamName, __test__ as TC } from "../netlify/functions/_sources/teamCodes.js";
import { fetchMatchResult as fetchFD } from "../netlify/functions/_sources/footballData.js";
import { fetchMatchResult as fetchAS } from "../netlify/functions/_sources/apiSports.js";
import { computeConsensus } from "../netlify/functions/_sources/consensus.js";

const OUR_CODES = Object.keys(TC.ALIASES);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}
function line() { console.log("-".repeat(64)); }

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: res.status, ok: res.ok, json, text };
}

// ============ football-data.org ============
async function checkFootballData() {
  line();
  console.log("FOOTBALL-DATA.ORG");
  line();
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const comp = process.env.AUTO_FILL_COMPETITION_ID_FD || "WC";
  if (!token) { console.log("  ! FOOTBALL_DATA_TOKEN not set — skipping"); return; }
  const H = { "X-Auth-Token": token };

  // List competitions to confirm the WC code/id and that your plan can see it.
  const comps = await getJson("https://api.football-data.org/v4/competitions", H);
  if (!comps.ok) {
    console.log(`  ! /competitions -> HTTP ${comps.status}. ${comps.text?.slice(0, 200)}`);
  } else {
    const wc = (comps.json?.competitions || []).filter(
      (c) => /world cup/i.test(c.name) || c.code === "WC",
    );
    console.log(`  competitions visible to your plan: ${comps.json?.count}`);
    wc.forEach((c) => console.log(`    World Cup match: code="${c.code}" id=${c.id} name="${c.name}"`));
    if (!wc.length) console.log("    ! No World Cup competition visible — your free tier may not include it.");
  }

  // Teams (gives the tla codes we match on).
  const teams = await getJson(`https://api.football-data.org/v4/competitions/${encodeURIComponent(comp)}/teams`, H);
  if (!teams.ok) {
    console.log(`  ! /competitions/${comp}/teams -> HTTP ${teams.status}. ${teams.text?.slice(0, 200)}`);
  } else {
    const tlas = (teams.json?.teams || []).map((t) => t.tla).filter(Boolean).sort();
    console.log(`  teams in "${comp}": ${teams.json?.teams?.length ?? 0}`);
    console.log(`  tla codes: ${tlas.join(", ")}`);
    const missing = OUR_CODES.filter((c) => !tlas.includes(c));
    if (missing.length) console.log(`  ! our codes NOT found as a tla (may differ in FD): ${missing.join(", ")}`);
  }

  // Matches (confirm fixtures exist + sample shape).
  const matches = await getJson(`https://api.football-data.org/v4/competitions/${encodeURIComponent(comp)}/matches`, H);
  if (!matches.ok) {
    console.log(`  ! /competitions/${comp}/matches -> HTTP ${matches.status}. ${matches.text?.slice(0, 200)}`);
  } else {
    const ms = matches.json?.matches || [];
    const finished = ms.filter((m) => m.status === "FINISHED");
    console.log(`  matches: ${ms.length} total, ${finished.length} FINISHED`);
    const sample = finished[0] || ms[0];
    if (sample) {
      console.log(`  sample: ${sample.homeTeam?.tla} vs ${sample.awayTeam?.tla} | status=${sample.status}` +
        ` | fullTime=${JSON.stringify(sample.score?.fullTime)} | duration=${sample.score?.duration}`);
    }
  }
}

// ============ api-sports ============
async function checkApiSports() {
  line();
  console.log("API-SPORTS (API-FOOTBALL)");
  line();
  const key = process.env.API_SPORTS_KEY;
  const league = process.env.AUTO_FILL_LEAGUE_ID_AS;
  const season = process.env.AUTO_FILL_SEASON_AS;
  if (!key) { console.log("  ! API_SPORTS_KEY not set — skipping"); return; }
  const H = { "x-apisports-key": key };

  // Confirm the league id.
  const leagues = await getJson("https://v3.football.api-sports.io/leagues?search=World Cup", H);
  if (!leagues.ok) {
    console.log(`  ! /leagues -> HTTP ${leagues.status}. ${leagues.text?.slice(0, 200)}`);
  } else if (leagues.json?.errors && Object.keys(leagues.json.errors).length) {
    console.log(`  ! /leagues errors: ${JSON.stringify(leagues.json.errors)}`);
  } else {
    (leagues.json?.response || []).slice(0, 8).forEach((l) => {
      const seasons = (l.seasons || []).map((s) => s.year).join(",");
      console.log(`    league id=${l.league?.id} name="${l.league?.name}" type=${l.league?.type} seasons=[${seasons}]`);
    });
  }
  if (!league || !season) { console.log("  ! set AUTO_FILL_LEAGUE_ID_AS + AUTO_FILL_SEASON_AS to check teams/fixtures"); return; }

  // Teams: the exact NAME strings we must match.
  const teams = await getJson(`https://v3.football.api-sports.io/teams?league=${league}&season=${season}`, H);
  if (!teams.ok) {
    console.log(`  ! /teams -> HTTP ${teams.status}. ${teams.text?.slice(0, 200)}`);
  } else if (teams.json?.errors && Object.keys(teams.json.errors).length) {
    console.log(`  ! /teams errors: ${JSON.stringify(teams.json.errors)}`);
  } else {
    const apiTeams = (teams.json?.response || []).map((t) => t.team?.name).filter(Boolean);
    console.log(`  teams for league=${league} season=${season}: ${apiTeams.length}`);
    const matchedCodes = new Set();
    const unrecognized = [];
    for (const name of apiTeams) {
      const code = matchTeamName(name);
      if (code) matchedCodes.add(code);
      else unrecognized.push(name);
    }
    console.log(`  recognized: ${matchedCodes.size}/${apiTeams.length}`);
    if (unrecognized.length) {
      console.log("  ! UNRECOGNIZED api-sports names (add these as aliases in teamCodes.js):");
      unrecognized.forEach((n) => console.log(`      "${n}"`));
    }
    const notFound = OUR_CODES.filter((c) => !matchedCodes.has(c));
    if (notFound.length) console.log(`  ! our codes not matched to any api-sports team: ${notFound.join(", ")}`);
    if (!unrecognized.length && !notFound.length) console.log("  OK: all 48 teams resolve cleanly.");
  }

  // Fixtures: confirm presence + sample the fields we parse.
  const fixtures = await getJson(`https://v3.football.api-sports.io/fixtures?league=${league}&season=${season}`, H);
  if (fixtures.ok && !(fixtures.json?.errors && Object.keys(fixtures.json.errors).length)) {
    const fs = fixtures.json?.response || [];
    const finished = fs.filter((f) => ["FT", "AET", "PEN"].includes(f.fixture?.status?.short));
    console.log(`  fixtures: ${fs.length} total, ${finished.length} finished`);
    const sample = finished[0] || fs[0];
    if (sample) {
      console.log(`  sample: ${sample.teams?.home?.name} vs ${sample.teams?.away?.name}` +
        ` | status=${sample.fixture?.status?.short} | fulltime=${JSON.stringify(sample.score?.fulltime)}` +
        ` | goals=${JSON.stringify(sample.goals)}`);
    }
  } else {
    console.log(`  ! /fixtures -> HTTP ${fixtures.status} ${JSON.stringify(fixtures.json?.errors || "")}`);
  }
}

// ============ optional single-match dry-run ============
async function dryRun() {
  const home = arg("home"), away = arg("away"), kickoff = arg("kickoff");
  if (!home || !away || !kickoff) return;
  line();
  console.log(`DRY-RUN CONSENSUS: ${home} vs ${away} @ ${kickoff} (writes nothing)`);
  line();
  const args = { fifaMatch: 0, homeTeam: home, awayTeam: away, kickoffIso: kickoff };
  const [fd, as] = await Promise.all([
    fetchFD(args).catch((e) => ({ name: "football-data", error: true, reason: e?.message })),
    fetchAS(args).catch((e) => ({ name: "api-sports", error: true, reason: e?.message })),
  ]);
  console.log("  football-data:", JSON.stringify(fd));
  console.log("  api-sports:   ", JSON.stringify(as));
  const isKnockout = false; // pass --knockout handling if you need it
  const decision = computeConsensus({ matchId: "dry-run", isKnockout, homeTeam: home, awayTeam: away }, [fd, as]);
  console.log("  DECISION:", JSON.stringify(decision));
  console.log(decision.decision === "agreed"
    ? "  => would WRITE this result."
    : "  => would NOT write (this is the safe outcome until both sources agree).");
}

async function main() {
  console.log("AUTO-FILL DISCOVERY — read-only, writes nothing\n");
  await checkFootballData();
  await checkApiSports();
  await dryRun();
  console.log("\nDone. Report any UNRECOGNIZED names / wrong IDs and I'll fix the config + table.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
