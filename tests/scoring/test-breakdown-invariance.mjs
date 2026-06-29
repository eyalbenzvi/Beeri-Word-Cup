// GOLDEN invariance test: adding the presentation-only ET / penalty breakdown
// to results must NOT change a single point or a single bracket slot. This is
// the guarantee the user asked for — "no effect on the contest scoring" — pinned
// down so any future change that lets the breakdown leak into scoring fails CI.

import { calcBracketTeams, deriveAdvancingTeams, deriveActualAdvancing } from "../../src/utils/bracket.js";
import { calculateMatchPoints, calculateFullScore } from "../../src/utils/scoring.js";
import { groupMatches, knockoutMatches } from "../../src/data/matches.js";
import { KNOCKOUT_STAGE_ORDER } from "../../src/utils/constants.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }
function eq(a, b, m) { assert(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
function deepEq(a, b, m) { assert(JSON.stringify(a) === JSON.stringify(b), `${m} (DIFF)`); }

console.log("=== BREAKDOWN SCORING INVARIANCE (GOLDEN) ===\n");

// 1) calculateMatchPoints ignores ET/penalty fields entirely.
{
  const pred = { homeScore: 1, awayScore: 1 };
  const teams = { home: "ESP", away: "GER" };
  const base = { homeScore: 1, awayScore: 1 };
  const enriched = { homeScore: 1, awayScore: 1, decidedBy: "penalties", etHomeScore: 1, etAwayScore: 1, penHomeScore: 4, penAwayScore: 3 };
  const a = calculateMatchPoints(pred, base, "QF", teams, teams);
  const b = calculateMatchPoints(pred, enriched, "QF", teams, teams);
  deepEq(a, b, "calculateMatchPoints identical with/without breakdown (tie)");
}
{
  // A predicted home win vs an actual ET decision (90' was a draw): the points
  // must reflect the 90' DRAW, unaffected by who won in ET.
  const pred = { homeScore: 2, awayScore: 1 };
  const teams = { home: "ESP", away: "GER" };
  const enriched = { homeScore: 1, awayScore: 1, decidedBy: "extra_time", etHomeScore: 2, etAwayScore: 1 };
  const r = calculateMatchPoints(pred, enriched, "QF", teams, teams);
  eq(r.points, 0, "home-win prediction earns 0 vs a 90' draw decided in ET");
}

// 2) Build a full deterministic tournament, then enrich every knockout tie with
// ET/penalty data, and assert bracket + advancing + full score are unchanged.
function buildResults() {
  const results = {};
  groupMatches.forEach((m, i) => {
    results[m.id] = {
      homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeScore: (i * 7) % 4, awayScore: (i * 5) % 3,
      stage: "group", group: m.group, played: true,
    };
  });
  for (const stage of KNOCKOUT_STAGE_ORDER) {
    const bracket = calcBracketTeams(results);
    for (const m of knockoutMatches.filter((x) => x.stage === stage)) {
      const t = bracket[m.id];
      if (!t?.home || !t?.away) continue;
      const i = m.fifaMatch;
      let homeScore, awayScore, advancingTeam = null;
      if (i % 3 === 0) {
        homeScore = 1; awayScore = 1;
        advancingTeam = i % 2 ? t.home : t.away; // deterministic winner
      } else {
        homeScore = i % 2 ? 2 : 0;
        awayScore = 1; // 2-1 (home) or 0-1 (away) — always decisive
      }
      results[m.id] = { homeTeam: t.home, awayTeam: t.away, homeScore, awayScore, stage: m.stage, advancingTeam, played: true };
    }
  }
  return results;
}

const base = buildResults();
const enriched = JSON.parse(JSON.stringify(base));
let enrichedTies = 0;
for (const id of Object.keys(enriched)) {
  const r = enriched[id];
  if (r.stage !== "group" && r.homeScore === r.awayScore && r.advancingTeam) {
    const winnerHome = r.advancingTeam === r.homeTeam;
    Object.assign(r, {
      decidedBy: "penalties",
      etHomeScore: r.homeScore, etAwayScore: r.awayScore,
      penHomeScore: winnerHome ? 4 : 3, penAwayScore: winnerHome ? 3 : 4,
    });
    enrichedTies++;
  }
}
assert(enrichedTies > 0, `sanity: dataset has knockout ties to enrich (${enrichedTies})`);

const bracketBase = calcBracketTeams(base);
const bracketEnriched = calcBracketTeams(enriched);
deepEq(bracketEnriched, bracketBase, "calcBracketTeams identical after ET/penalty enrichment");
deepEq(deriveActualAdvancing(bracketEnriched, enriched), deriveActualAdvancing(bracketBase, base), "deriveActualAdvancing identical");

const userPreds = { matches: base, advancing: deriveAdvancingTeams(bracketBase), champion: null, topScorer: "" };
const s1 = calculateFullScore(userPreds, base, null, null, bracketBase, bracketBase);
const s2 = calculateFullScore(userPreds, enriched, null, null, bracketEnriched, bracketEnriched);
eq(s2.totalPoints, s1.totalPoints, "full leaderboard totalPoints identical");
deepEq(s2.matchScores, s1.matchScores, "per-match scores identical");
deepEq(s2.advancingPoints, s1.advancingPoints, "advancing points identical");

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.error("\nFailures:\n  - " + failures.join("\n  - ")); process.exit(1); }
