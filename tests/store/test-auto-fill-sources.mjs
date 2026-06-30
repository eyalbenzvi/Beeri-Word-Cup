// Functional tests for the two auto-fill source clients (footballData.js and
// apiSports.js). global.fetch is mocked, so no network is hit. These cover the
// pieces most likely to silently corrupt data: home/away orientation
// normalization, using the 90-minute score (NOT the aggregate), finished-status
// parsing, knockout advancing-team extraction, and the single-retry behaviour.

import fs from "node:fs";
import { fetchMatchResult as fetchFD } from "../../netlify/functions/_sources/footballData.js";
import { fetchMatchResult as fetchAS } from "../../netlify/functions/_sources/apiSports.js";
import { fetchMatchResult as fetchESPN } from "../../netlify/functions/_sources/espnResult.js";
import { matchTeamName } from "../../netlify/functions/_sources/teamCodes.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }
function eq(a, b, m) { assert(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

function mockFetchOnce(payload, { status = 200, ok = true } = {}) {
  global.fetch = async () => ({ ok, status, json: async () => payload });
}
function mockFetchThrow() {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("network down"); };
  return () => calls;
}

const KICK = "2026-06-11T19:00:00.000Z"; // Jun 11 22:00 Israel

console.log("=== AUTO-FILL SOURCE CLIENT TESTS ===\n");

// ============ football-data.org ============
process.env.FOOTBALL_DATA_TOKEN = "test-token";
process.env.AUTO_FILL_COMPETITION_ID_FD = "WC";

// --- FD 1. Normal orientation, group, decisive ---
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "MEX" }, awayTeam: { tla: "RSA" },
    score: { fullTime: { home: 2, away: 1 }, duration: "REGULAR", winner: "HOME_TEAM" },
  }] });
  const r = await fetchFD({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, true, "FD normal: finished");
  eq(r.home90, 2, "FD normal: home90");
  eq(r.away90, 1, "FD normal: away90");
  eq(r.homeCode, "MEX", "FD normal: homeCode");
  eq(r.awayCode, "RSA", "FD normal: awayCode");
  eq(r.advancingTeam, null, "FD normal: no advancing (decisive)");
}

// --- FD 2. Swapped orientation must be normalized to our schedule ---
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "RSA" }, awayTeam: { tla: "MEX" }, // API lists reversed
    score: { fullTime: { home: 1, away: 2 }, duration: "REGULAR", winner: "AWAY_TEAM" },
  }] });
  const r = await fetchFD({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.home90, 2, "FD swapped: home90 normalized to MEX's 2");
  eq(r.away90, 1, "FD swapped: away90 normalized to RSA's 1");
  eq(r.homeCode, "MEX", "FD swapped: homeCode normalized");
  eq(r.awayCode, "RSA", "FD swapped: awayCode normalized");
}

// --- FD 3. Knockout to ET: records the 90' score (regularTime), NOT the ET
// final (fullTime). Advancing = overall winner. ---
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "ESP" }, awayTeam: { tla: "GER" },
    score: {
      regularTime: { home: 1, away: 1 }, // 90' = 1-1
      fullTime: { home: 2, away: 1 },    // final incl. ET = 2-1 (must NOT be used as 90')
      duration: "EXTRA_TIME", winner: "HOME_TEAM",
    },
  }] });
  const r = await fetchFD({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.home90, 1, "FD KO ET: records regularTime home (1), not fullTime (2)");
  eq(r.away90, 1, "FD KO ET: records regularTime away (1)");
  eq(r.advancingTeam, "ESP", "FD KO ET: advancing = overall winner");
}

// --- FD 3a. ET match WITHOUT a regularTime field -> cannot isolate 90' ->
// regulationAmbiguous (declines to write; admin enters manually). ---
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "ESP" }, awayTeam: { tla: "GER" },
    score: { fullTime: { home: 2, away: 1 }, duration: "EXTRA_TIME", winner: "HOME_TEAM" },
  }] });
  const r = await fetchFD({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.finished, true, "FD ET no-regularTime: finished");
  eq(r.home90, null, "FD ET no-regularTime: 90' score unknown (null)");
  eq(r.regulationAmbiguous, true, "FD ET no-regularTime: regulationAmbiguous -> no write");
}

// --- FD 3b. football-data code aliases (CUW->CUR, URY->URU) ---
// Live data showed FD uses CUW for Curacao and URY for Uruguay; our codes are
// CUR / URU. The client must translate so those fixtures are found + reported
// in our code space.
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "CUW" }, awayTeam: { tla: "MEX" }, // FD code for Curacao
    score: { fullTime: { home: 0, away: 2 }, duration: "REGULAR", winner: "AWAY_TEAM" },
  }] });
  const r = await fetchFD({ fifaMatch: 1, homeTeam: "CUR", awayTeam: "MEX", kickoffIso: KICK });
  eq(r.finished, true, "FD alias: fixture found via CUW->CUR");
  eq(r.homeCode, "CUR", "FD alias: homeCode mapped to our CUR");
  eq(r.home90, 0, "FD alias: home score");
  eq(r.away90, 2, "FD alias: away score");
}
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "URY" }, awayTeam: { tla: "ESP" }, // FD code for Uruguay
    score: {
      regularTime: { home: 1, away: 1 }, fullTime: { home: 1, away: 1 },
      duration: "PENALTY_SHOOTOUT", winner: "HOME_TEAM",
    },
  }] });
  const r = await fetchFD({ fifaMatch: 90, homeTeam: "URU", awayTeam: "ESP", kickoffIso: KICK });
  eq(r.finished, true, "FD alias: fixture found via URY->URU");
  eq(r.homeCode, "URU", "FD alias: homeCode mapped to our URU");
  eq(r.advancingTeam, "URU", "FD alias: advancing mapped to our URU");
}

// --- FD 4. Not finished ---
{
  mockFetchOnce({ matches: [{
    status: "IN_PLAY",
    homeTeam: { tla: "MEX" }, awayTeam: { tla: "RSA" },
    score: { fullTime: { home: null, away: null }, duration: "REGULAR" },
  }] });
  const r = await fetchFD({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, false, "FD in-play: not finished");
}

// --- FD 5. Fixture not found -> not finished, not error ---
{
  mockFetchOnce({ matches: [] });
  const r = await fetchFD({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, false, "FD missing fixture: not finished");
  eq(r.error, false, "FD missing fixture: not an error");
}

// --- FD 6. Network failure retries once then gives up ---
{
  const calls = mockFetchThrow();
  const r = await fetchFD({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.error, true, "FD network fail: error");
  eq(calls(), 2, "FD network fail: one request + one retry");
}

// --- FD 7. Missing env config -> error (no fetch) ---
{
  const saved = process.env.FOOTBALL_DATA_TOKEN;
  delete process.env.FOOTBALL_DATA_TOKEN;
  let fetched = false;
  global.fetch = async () => { fetched = true; return { ok: true, status: 200, json: async () => ({}) }; };
  const r = await fetchFD({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.error, true, "FD no token: error");
  eq(fetched, false, "FD no token: no network call");
  process.env.FOOTBALL_DATA_TOKEN = saved;
}

// ============ api-sports ============
process.env.API_SPORTS_KEY = "test-key";
process.env.AUTO_FILL_LEAGUE_ID_AS = "1";
process.env.AUTO_FILL_SEASON_AS = "2026";
const KICK_SEC = Math.floor(new Date(KICK).getTime() / 1000);

// --- AS 1. Uses fulltime (90'), NOT goals (aggregate) ---
{
  mockFetchOnce({ response: [{
    fixture: { timestamp: KICK_SEC, status: { short: "AET" } },
    teams: { home: { name: "Mexico", winner: null }, away: { name: "South Africa", winner: null } },
    goals: { home: 3, away: 1 },                 // aggregate incl. ET -> must be ignored
    score: { fulltime: { home: 2, away: 1 } },   // end of 90'
  }] });
  const r = await fetchAS({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, true, "AS AET: finished");
  eq(r.home90, 2, "AS: uses fulltime home (not goals)");
  eq(r.away90, 1, "AS: uses fulltime away (not goals)");
  eq(r.homeCode, "MEX", "AS: falls back to expected home code");
  eq(r.awayCode, "RSA", "AS: falls back to expected away code");
}

// --- AS 2. Swapped orientation WITH explicit codes is normalized ---
{
  mockFetchOnce({ response: [{
    fixture: { timestamp: KICK_SEC, status: { short: "FT" } },
    teams: { home: { code: "RSA", winner: null }, away: { code: "MEX", winner: null } },
    score: { fulltime: { home: 1, away: 2 } },
  }] });
  const r = await fetchAS({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.home90, 2, "AS swapped: home90 normalized");
  eq(r.away90, 1, "AS swapped: away90 normalized");
  eq(r.homeCode, "MEX", "AS swapped: homeCode normalized");
  eq(r.awayCode, "RSA", "AS swapped: awayCode normalized");
}

// --- AS 3. KO tie, advancing from winner flag ---
{
  mockFetchOnce({ response: [{
    fixture: { timestamp: KICK_SEC, status: { short: "PEN" } },
    teams: { home: { name: "Spain", winner: false }, away: { name: "Germany", winner: true } },
    score: { fulltime: { home: 1, away: 1 } },
  }] });
  const r = await fetchAS({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.home90, 1, "AS KO tie: 90' home");
  eq(r.advancingTeam, "GER", "AS KO tie: advancing = winner flag (away)");
}

// --- AS 4. Teams that don't resolve to our codes -> fixture not found ---
{
  mockFetchOnce({ response: [{
    fixture: { timestamp: KICK_SEC, status: { short: "FT" } },
    teams: { home: { name: "Atlantis" }, away: { name: "Wakanda" } },
    score: { fulltime: { home: 0, away: 0 } },
  }] });
  const r = await fetchAS({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, false, "AS unknown teams: fixture not found");
}

// --- AS 5. Missing env config -> error ---
{
  const saved = process.env.API_SPORTS_KEY;
  delete process.env.API_SPORTS_KEY;
  const r = await fetchAS({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.error, true, "AS no key: error");
  process.env.API_SPORTS_KEY = saved;
}

// --- AS 6. Simultaneous kickoffs: identify by TEAMS, not by time ---
// Final group matchday: two games kick off at the same instant. The client must
// pick the fixture matching the expected teams, never the time-closest one.
{
  mockFetchOnce({ response: [
    { // same timestamp, different match
      fixture: { timestamp: KICK_SEC, status: { short: "FT" } },
      teams: { home: { name: "Spain" }, away: { name: "Germany" } },
      score: { fulltime: { home: 3, away: 0 } },
    },
    { // the one we actually want
      fixture: { timestamp: KICK_SEC, status: { short: "FT" } },
      teams: { home: { name: "Mexico" }, away: { name: "South Africa" } },
      score: { fulltime: { home: 2, away: 1 } },
    },
  ] });
  const r = await fetchAS({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.home90, 2, "AS simultaneous: selects by teams (MEX 2, not Spain 3)");
  eq(r.away90, 1, "AS simultaneous: away RSA 1");
  eq(r.homeCode, "MEX", "AS simultaneous: homeCode MEX");
}

// --- AS 7. Name resolution by teams, orientation normalized via names ---
{
  mockFetchOnce({ response: [{
    fixture: { timestamp: KICK_SEC, status: { short: "FT" } },
    teams: { home: { name: "South Africa" }, away: { name: "Mexico" } }, // reversed
    score: { fulltime: { home: 1, away: 2 } },
  }] });
  const r = await fetchAS({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.home90, 2, "AS reversed-by-name: home normalized to MEX 2");
  eq(r.away90, 1, "AS reversed-by-name: away normalized to RSA 1");
  eq(r.homeCode, "MEX", "AS reversed-by-name: homeCode MEX");
}

// ============ ESPN result client (PRIMARY) ============
function espnEvent({ status, competitors }) {
  return { events: [{ competitions: [{ date: KICK, status, competitors }] }] };
}
const POST = (name, detail, period) => ({
  type: { state: "post", completed: true, name, detail }, period,
});

// --- ESPN 1. Normal orientation, group, decisive ---
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FULL_TIME", "FT", 2),
    competitors: [
      { homeAway: "home", score: "2", winner: true, team: { displayName: "Mexico", abbreviation: "MEX" } },
      { homeAway: "away", score: "1", winner: false, team: { displayName: "South Africa", abbreviation: "RSA" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, true, "ESPN normal: finished");
  eq(r.home90, 2, "ESPN normal: home90 (regular -> final score)");
  eq(r.away90, 1, "ESPN normal: away90");
  eq(r.homeCode, "MEX", "ESPN normal: homeCode");
  eq(r.awayCode, "RSA", "ESPN normal: awayCode");
  eq(r.advancingTeam, null, "ESPN normal: no advancing (decisive)");
  eq(r.regulationAmbiguous, false, "ESPN normal: not ambiguous");
}

// --- ESPN 2. Swapped orientation normalized to our schedule ---
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FULL_TIME", "FT", 2),
    competitors: [
      { homeAway: "home", score: "1", winner: false, team: { displayName: "South Africa", abbreviation: "RSA" } },
      { homeAway: "away", score: "2", winner: true, team: { displayName: "Mexico", abbreviation: "MEX" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.home90, 2, "ESPN swapped: home90 normalized to MEX 2");
  eq(r.away90, 1, "ESPN swapped: away90 normalized to RSA 1");
  eq(r.homeCode, "MEX", "ESPN swapped: homeCode normalized");
  eq(r.awayCode, "RSA", "ESPN swapped: awayCode normalized");
}

// --- ESPN 3. Knockout to ET: 90' reconstructed from 1st+2nd-half linescores,
// NOT the ET-inclusive final score. Advancing = overall winner flag. ---
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FINAL", "AET", 4),
    competitors: [
      { homeAway: "home", score: "2", winner: true,
        team: { displayName: "Spain", abbreviation: "ESP" },
        linescores: [{ value: 1 }, { value: 0 }, { value: 1 }] }, // 90' = 1, ET +1
      { homeAway: "away", score: "1", winner: false,
        team: { displayName: "Germany", abbreviation: "GER" },
        linescores: [{ value: 0 }, { value: 1 }, { value: 0 }] }, // 90' = 1
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.duration, "EXTRA_TIME", "ESPN KO ET: duration EXTRA_TIME");
  eq(r.home90, 1, "ESPN KO ET: 90' home from linescores (1), not final (2)");
  eq(r.away90, 1, "ESPN KO ET: 90' away from linescores (1)");
  eq(r.advancingTeam, "ESP", "ESPN KO ET: advancing = overall winner");
}

// --- ESPN 3a. ET WITHOUT linescores -> cannot isolate 90' -> regulationAmbiguous
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FINAL", "AET", 4),
    competitors: [
      { homeAway: "home", score: "2", winner: true, team: { displayName: "Spain", abbreviation: "ESP" } },
      { homeAway: "away", score: "1", winner: false, team: { displayName: "Germany", abbreviation: "GER" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.finished, true, "ESPN ET no-linescores: finished");
  eq(r.home90, null, "ESPN ET no-linescores: 90' unknown (null)");
  eq(r.regulationAmbiguous, true, "ESPN ET no-linescores: ambiguous -> no write (FD fallback)");
}

// --- ESPN 3b. Penalty shootout: 90' from linescores, advancing = pen winner ---
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FINAL_PEN", "FT (Pens)", 5),
    competitors: [
      { homeAway: "home", score: "1", winner: false,
        team: { displayName: "Uruguay", abbreviation: "URU" },
        linescores: [{ value: 0 }, { value: 1 }] }, // 90' = 1
      { homeAway: "away", score: "1", winner: true,
        team: { displayName: "Spain", abbreviation: "ESP" },
        linescores: [{ value: 1 }, { value: 0 }] }, // 90' = 1
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 90, homeTeam: "URU", awayTeam: "ESP", kickoffIso: KICK });
  eq(r.duration, "PENALTY_SHOOTOUT", "ESPN pens: duration PENALTY_SHOOTOUT");
  eq(r.home90, 1, "ESPN pens: 90' home from linescores");
  eq(r.away90, 1, "ESPN pens: 90' away from linescores (tie)");
  eq(r.advancingTeam, "ESP", "ESPN pens: advancing = pen winner");
}

// --- ESPN 3c. LIVE extra time, still level, WITHOUT per-period linescores
// (ESPN exposes them only once the match ends): the 90' tie is taken from the
// running live score so the PROVISIONAL 90' can be recorded mid-ET. A match
// only reaches ET from a level score, so while it stays level the live score
// still IS the 90' score. ---
{
  mockFetchOnce(espnEvent({
    status: { type: { state: "in", name: "STATUS_FIRST_EXTRA_TIME" }, period: 3, displayClock: "98'" },
    competitors: [
      { homeAway: "home", score: "1", team: { displayName: "Spain", abbreviation: "ESP" } },
      { homeAway: "away", score: "1", team: { displayName: "Germany", abbreviation: "GER" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.finished, false, "ESPN live ET: not finished");
  eq(r.duration, "EXTRA_TIME", "ESPN live ET: duration EXTRA_TIME");
  eq(r.home90, 1, "ESPN live ET no-linescores: 90' home from live score (1)");
  eq(r.away90, 1, "ESPN live ET no-linescores: 90' away from live score (1) -> provisional tie");
}

// --- ESPN 3d. LIVE extra time AFTER an ET goal (score has diverged): the live
// score no longer equals the 90' tie, so home90 != away90 and the provisional
// guard (home90===away90) rejects it — we wait for the post-match linescores to
// isolate the true 90'. ---
{
  mockFetchOnce(espnEvent({
    status: { type: { state: "in", name: "STATUS_SECOND_EXTRA_TIME" }, period: 4, displayClock: "112'" },
    competitors: [
      { homeAway: "home", score: "2", team: { displayName: "Spain", abbreviation: "ESP" } },
      { homeAway: "away", score: "1", team: { displayName: "Germany", abbreviation: "GER" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.finished, false, "ESPN live ET (after ET goal): not finished");
  eq(r.home90 === r.away90, false, "ESPN live ET (after ET goal): diverged -> provisional guard rejects");
}

// --- ESPN 4. Not finished (in play) ---
{
  mockFetchOnce(espnEvent({
    status: { type: { state: "in", name: "STATUS_SECOND_HALF" }, period: 2 },
    competitors: [
      { homeAway: "home", score: "1", team: { displayName: "Mexico", abbreviation: "MEX" } },
      { homeAway: "away", score: "0", team: { displayName: "South Africa", abbreviation: "RSA" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, false, "ESPN in-play: not finished");
}

// --- ESPN 5. Fixture not in feed -> not finished, not error ---
{
  mockFetchOnce({ events: [] });
  const r = await fetchESPN({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, false, "ESPN missing fixture: not finished");
  eq(r.error, false, "ESPN missing fixture: not an error");
}

// --- ESPN 6. Network failure retries once then gives up ---
{
  const calls = mockFetchThrow();
  const r = await fetchESPN({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.error, true, "ESPN network fail: error (-> FD fallback in handler)");
  eq(calls(), 2, "ESPN network fail: one request + one retry");
}

// --- ESPN 7. Team resolved via abbreviation fallback when name is unknown ---
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FULL_TIME", "FT", 2),
    competitors: [
      { homeAway: "home", score: "0", winner: false, team: { displayName: "Deutschland", abbreviation: "GER" } },
      { homeAway: "away", score: "0", winner: false, team: { displayName: "Spain", abbreviation: "ESP" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 50, homeTeam: "GER", awayTeam: "ESP", kickoffIso: KICK });
  eq(r.homeCode, "GER", "ESPN abbr fallback: unknown name 'Deutschland' -> GER via abbreviation");
  eq(r.awayCode, "ESP", "ESPN abbr fallback: away ESP");
}

// --- ESPN 8. Abandoned/cancelled match (also reported as state="post") is
// NOT treated as finished -> no partial score written (review finding M7). ---
{
  mockFetchOnce(espnEvent({
    status: { type: { state: "post", completed: true, name: "STATUS_ABANDONED", detail: "Abandoned" }, period: 2 },
    competitors: [
      { homeAway: "home", score: "1", team: { displayName: "Mexico", abbreviation: "MEX" } },
      { homeAway: "away", score: "0", team: { displayName: "South Africa", abbreviation: "RSA" } },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.finished, false, "ESPN abandoned: NOT finished (no partial score written)");
}

// --- ESPN 9. Extra time signalled ONLY by an underscore-joined status token
// (STATUS_FINAL_AET) with period <= 2 -> must still detect ET and take the 90'
// score from linescores, not the ET-inclusive final (review finding H2/#1). ---
{
  mockFetchOnce(espnEvent({
    status: { type: { state: "post", completed: true, name: "STATUS_FINAL_AET", detail: "STATUS_FINAL_AET" }, period: 2 },
    competitors: [
      { homeAway: "home", score: "2", winner: true,
        team: { displayName: "Spain", abbreviation: "ESP" },
        linescores: [{ value: 1, period: 1 }, { value: 0, period: 2 }, { value: 1, period: 3 }] },
      { homeAway: "away", score: "1", winner: false,
        team: { displayName: "Germany", abbreviation: "GER" },
        linescores: [{ value: 1, period: 1 }, { value: 0, period: 2 }, { value: 0, period: 3 }] },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.duration, "EXTRA_TIME", "ESPN underscore-AET: ET detected despite period<=2");
  eq(r.home90, 1, "ESPN underscore-AET: 90' home from linescores (1), not final (2)");
  eq(r.away90, 1, "ESPN underscore-AET: 90' away (1)");
  eq(r.advancingTeam, "ESP", "ESPN underscore-AET: advancing = winner");
}

// --- ESPN 10. linescore values as digit-STRINGS are parsed (review finding
// C1: Number.isFinite('1') is false; must coerce). ---
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FINAL", "AET", 4),
    competitors: [
      { homeAway: "home", score: "2", winner: true,
        team: { displayName: "Spain", abbreviation: "ESP" },
        linescores: [{ value: "1" }, { value: "0" }, { value: "1" }] }, // strings -> 90' = 1
      { homeAway: "away", score: "1", winner: false,
        team: { displayName: "Germany", abbreviation: "GER" },
        linescores: [{ displayValue: "0" }, { displayValue: "1" }] }, // displayValue only -> 90' = 1
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.home90, 1, "ESPN string linescores: home 90' = '1'+'0' = 1");
  eq(r.away90, 1, "ESPN displayValue linescores: away 90' = 1 (level -> valid ET)");
}

// --- ESPN 11. ET match whose reconstructed 90' is NOT level is impossible (you
// only play ET after a draw) -> decline as ambiguous rather than record a bogus
// decisive score (review finding #5). ---
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FINAL", "AET", 4),
    competitors: [
      { homeAway: "home", score: "2", winner: true,
        team: { displayName: "Spain", abbreviation: "ESP" },
        linescores: [{ value: 1, period: 1 }, { value: 0, period: 2 }] }, // 90' = 1
      { homeAway: "away", score: "1", winner: false,
        team: { displayName: "Germany", abbreviation: "GER" },
        linescores: [{ value: 0, period: 1 }, { value: 0, period: 2 }] }, // 90' = 0 -> NOT level
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.regulationAmbiguous, true, "ESPN ET non-level reconstruction: ambiguous (declines, FD fallback)");
  eq(r.home90, null, "ESPN ET non-level: 90' nulled");
}

// --- ESPN 12. Fixture absent from the feed -> notFound flag so the handler
// falls back to football-data (review finding: coverage gap, not 'live'). ---
{
  mockFetchOnce({ events: [] });
  const r = await fetchESPN({ fifaMatch: 1, homeTeam: "MEX", awayTeam: "RSA", kickoffIso: KICK });
  eq(r.notFound, true, "ESPN absent fixture: notFound -> FD fallback in handler");
}

// ============ de-duplication: every source shares http.js ============
{
  const fdSrc = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/_sources/footballData.js", "utf8");
  const asSrc = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/_sources/apiSports.js", "utf8");
  const espnSrc = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/_sources/espnResult.js", "utf8");
  const liveSrc = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/_sources/espnLive.js", "utf8");
  for (const [name, s] of [["footballData", fdSrc], ["apiSports", asSrc], ["espnResult", espnSrc]]) {
    assert(/from "\.\/http\.js"/.test(s), `${name}.js imports shared http.js`);
    assert(!/new AbortController\(\)/.test(s), `${name}.js no longer hand-rolls fetch (dedup)`);
  }
  // ESPN team resolution shared between live + result clients.
  assert(/from "\.\/espnTeams\.js"/.test(espnSrc) && /from "\.\/espnTeams\.js"/.test(liveSrc),
    "espnResult.js + espnLive.js share espnTeams.js (no duplicate resolver)");
}

// ============ team-name resolver ============
{
  eq(matchTeamName("Mexico"), "MEX", "resolve Mexico");
  eq(matchTeamName("South Korea"), "KOR", "resolve South Korea");
  eq(matchTeamName("Korea Republic"), "KOR", "resolve Korea Republic alias");
  eq(matchTeamName("Türkiye"), "TUR", "resolve Turkiye (accent)");
  eq(matchTeamName("Czechia"), "CZE", "resolve Czechia");
  eq(matchTeamName("Côte d'Ivoire"), "CIV", "resolve Cote d'Ivoire (accent+punct)");
  eq(matchTeamName("DR Congo"), "COD", "resolve DR Congo");
  eq(matchTeamName("Bosnia & Herzegovina"), "BIH", "resolve Bosnia & Herzegovina");
  eq(matchTeamName("United States"), "USA", "resolve United States");
  eq(matchTeamName("Cape Verde"), "CPV", "resolve Cape Verde");
  eq(matchTeamName("Unknownland"), null, "unknown name -> null");
  eq(matchTeamName(null), null, "null name -> null");
}

console.log("");
if (failures.length) {
  console.log("Failures:");
  failures.forEach((f) => console.log("  - " + f));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
