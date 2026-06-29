// Source-layer tests for the extra-time / penalty BREAKDOWN: that ESPN and
// football-data extract the end-of-ET aggregate and the shootout tally
// (oriented to our schedule), that an unrecoverable breakdown degrades to null
// WITHOUT blocking the core 90' result, and that consensus carries / reconciles
// the breakdown (agree-or-drop) while never weakening the 90'+advancing gate.

import { fetchMatchResult as fetchFD } from "../../netlify/functions/_sources/footballData.js";
import { fetchMatchResult as fetchESPN } from "../../netlify/functions/_sources/espnResult.js";
import { decideSingleSource, computeConsensus } from "../../netlify/functions/_sources/consensus.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }
function eq(a, b, m) { assert(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
function mockFetchOnce(payload) { global.fetch = async () => ({ ok: true, status: 200, json: async () => payload }); }

const KICK = "2026-07-01T19:00:00.000Z";
process.env.FOOTBALL_DATA_TOKEN = "t";
process.env.AUTO_FILL_COMPETITION_ID_FD = "WC";

console.log("=== BREAKDOWN SOURCE TESTS ===\n");

// ---------- football-data: extra time ----------
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "ESP" }, awayTeam: { tla: "GER" },
    score: { regularTime: { home: 1, away: 1 }, fullTime: { home: 2, away: 1 }, duration: "EXTRA_TIME", winner: "HOME_TEAM" },
  }] });
  const r = await fetchFD({ homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.home90, 1, "FD ET: 90' from regularTime");
  eq(r.away90, 1, "FD ET: 90' away");
  eq(r.etHome, 2, "FD ET: ET aggregate from fullTime (home)");
  eq(r.etAway, 1, "FD ET: ET aggregate (away)");
  eq(r.penHome, null, "FD ET: no penalties");
  eq(r.advancingTeam, "ESP", "FD ET: advancing = winner");
}

// ---------- football-data: penalties ----------
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "ESP" }, awayTeam: { tla: "GER" },
    score: { regularTime: { home: 1, away: 1 }, fullTime: { home: 1, away: 1 }, penalties: { home: 4, away: 3 }, duration: "PENALTY_SHOOTOUT", winner: "HOME_TEAM" },
  }] });
  const r = await fetchFD({ homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.home90, 1, "FD PEN: 90' home");
  eq(r.etHome, 1, "FD PEN: ET aggregate level (home)");
  eq(r.etAway, 1, "FD PEN: ET aggregate level (away)");
  eq(r.penHome, 4, "FD PEN: shootout home");
  eq(r.penAway, 3, "FD PEN: shootout away");
  eq(r.advancingTeam, "ESP", "FD PEN: advancing = winner");
}

// ---------- football-data: reversed orientation flips ET too ----------
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "GER" }, awayTeam: { tla: "ESP" }, // listed reversed
    score: { regularTime: { home: 1, away: 1 }, fullTime: { home: 1, away: 2 }, duration: "EXTRA_TIME", winner: "AWAY_TEAM" },
  }] });
  const r = await fetchFD({ homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.etHome, 2, "FD ET reversed: ET home oriented to ESP (2)");
  eq(r.etAway, 1, "FD ET reversed: ET away oriented to GER (1)");
  eq(r.advancingTeam, "ESP", "FD ET reversed: advancing still ESP");
}

// ---------- football-data: ET but no regularTime -> ambiguous, breakdown dropped, core not poisoned ----------
{
  mockFetchOnce({ matches: [{
    status: "FINISHED",
    homeTeam: { tla: "ESP" }, awayTeam: { tla: "GER" },
    score: { fullTime: { home: 2, away: 1 }, duration: "EXTRA_TIME", winner: "HOME_TEAM" },
  }] });
  const r = await fetchFD({ homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.home90, null, "FD ET ambiguous: 90' unknown");
  eq(r.regulationAmbiguous, true, "FD ET ambiguous: flagged");
  eq(r.etHome, null, "FD ET ambiguous: ET dropped (can't verify >= 90')");
}

// ---------- ESPN: extra time ----------
function espnEvent({ status, competitors }) {
  return { events: [{ competitions: [{ date: KICK, status, competitors }] }] };
}
const POST = (name, detail, period) => ({ type: { state: "post", completed: true, name, detail }, period });
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FINAL", "AET", 4),
    competitors: [
      { homeAway: "home", score: "2", winner: true, team: { displayName: "Spain", abbreviation: "ESP" },
        linescores: [{ value: 1 }, { value: 0 }, { value: 1 }] },
      { homeAway: "away", score: "1", winner: false, team: { displayName: "Germany", abbreviation: "GER" },
        linescores: [{ value: 0 }, { value: 1 }, { value: 0 }] },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.home90, 1, "ESPN ET: 90' from linescores");
  eq(r.etHome, 2, "ESPN ET: ET aggregate from final score (home)");
  eq(r.etAway, 1, "ESPN ET: ET aggregate (away)");
  eq(r.advancingTeam, "ESP", "ESPN ET: advancing");
}

// ---------- ESPN: penalties (shootoutScore) ----------
{
  mockFetchOnce(espnEvent({
    status: POST("STATUS_FINAL_PEN", "FT (Pens)", 5),
    competitors: [
      { homeAway: "home", score: "1", winner: true, shootoutScore: "4", team: { displayName: "Spain", abbreviation: "ESP" },
        linescores: [{ value: 0 }, { value: 1 }, { value: 0 }] },
      { homeAway: "away", score: "1", winner: false, shootoutScore: "3", team: { displayName: "Germany", abbreviation: "GER" },
        linescores: [{ value: 1 }, { value: 0 }, { value: 0 }] },
    ],
  }));
  const r = await fetchESPN({ fifaMatch: 89, homeTeam: "ESP", awayTeam: "GER", kickoffIso: KICK });
  eq(r.duration, "PENALTY_SHOOTOUT", "ESPN PEN: duration");
  eq(r.home90, 1, "ESPN PEN: 90' home");
  eq(r.etHome, 1, "ESPN PEN: ET level (home)");
  eq(r.penHome, 4, "ESPN PEN: shootout home from shootoutScore");
  eq(r.penAway, 3, "ESPN PEN: shootout away");
  eq(r.advancingTeam, "ESP", "ESPN PEN: advancing");
}

// ---------- consensus: single source carries the breakdown ----------
{
  const src = {
    name: "fd", error: false, finished: true, home90: 1, away90: 1,
    homeCode: "ESP", awayCode: "GER", advancingTeam: "ESP", duration: "PENALTY_SHOOTOUT",
    etHome: 1, etAway: 1, penHome: 4, penAway: 3, regulationAmbiguous: false,
  };
  const d = decideSingleSource({ isKnockout: true, homeTeam: "ESP", awayTeam: "GER" }, src);
  eq(d.decision, "agreed", "consensus single: agreed");
  eq(d.decidedBy, "penalties", "consensus single: decidedBy penalties");
  eq(d.penHomeScore, 4, "consensus single: pen home carried");
  eq(d.etHomeScore, 1, "consensus single: ET carried");
  eq(d.breakdownSource, "fd", "consensus single: breakdownSource recorded");
}

// ---------- consensus: two sources disagree on shootout -> drop pens, keep decidedBy ----------
{
  const base = {
    error: false, finished: true, home90: 1, away90: 1,
    homeCode: "ESP", awayCode: "GER", advancingTeam: "ESP", duration: "PENALTY_SHOOTOUT",
    etHome: 1, etAway: 1, regulationAmbiguous: false,
  };
  const a = { ...base, name: "espn", penHome: 4, penAway: 3 };
  const b = { ...base, name: "fd", penHome: 5, penAway: 4 };
  const d = computeConsensus({ isKnockout: true, homeTeam: "ESP", awayTeam: "GER" }, [a, b]);
  eq(d.decision, "agreed", "consensus two: still agreed on 90'+advancing");
  eq(d.decidedBy, "penalties", "consensus two: decidedBy kept");
  eq(d.penHomeScore, null, "consensus two: disagreeing shootout dropped to null");
  eq(d.etHomeScore, 1, "consensus two: agreeing ET kept");
}

// ---------- consensus: two sources DISAGREE on 90' -> NOT agreed (scoring gate intact) ----------
{
  const a = { name: "espn", error: false, finished: true, home90: 1, away90: 1, homeCode: "ESP", awayCode: "GER", advancingTeam: "ESP", duration: "PENALTY_SHOOTOUT" };
  const b = { name: "fd", error: false, finished: true, home90: 2, away90: 1, homeCode: "ESP", awayCode: "GER", advancingTeam: null, duration: "REGULAR" };
  const d = computeConsensus({ isKnockout: true, homeTeam: "ESP", awayTeam: "GER" }, [a, b]);
  assert(d.decision !== "agreed", "consensus two: 90' disagreement is NOT agreed");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.error("\nFailures:\n  - " + failures.join("\n  - ")); process.exit(1); }
