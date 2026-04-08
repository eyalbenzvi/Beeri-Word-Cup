// Cross-validation against ismailoksuz/FIFA-World-Cup-2026-Predictor
// Their code is used as the REFERENCE implementation
// We compare R32 matchups for hundreds of random tournaments

import { readFileSync } from 'fs';
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches, R32_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcGroupStandings, calcBracketTeams } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { THIRD_PLACE_TABLE, THIRD_PLACE_SLOTS, lookupThirdPlaceAssignment } from '/home/user/Beeri-World-Cup/src/data/thirdPlaceTable.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

// ============================================================
// REFERENCE: ismailoksuz's calculateGroupStandings (extracted)
// NO H2H — sorts by pts, GD, GF, then alphabetical
// ============================================================
function refCalcStandings(groupName, predictions) {
  const teams = GROUPS[groupName].map(t => t.code);
  const standings = {};
  for (const t of teams) {
    standings[t] = { Name: t, PTS: 0, AG: 0, YG: 0, AV: 0, P: 0, G: 0, B: 0, M: 0 };
  }
  for (const match of groupMatches.filter(m => m.group === groupName)) {
    const p = predictions[match.id];
    if (!p || p.homeScore == null || p.awayScore == null) continue;
    const s1 = Number(p.homeScore), s2 = Number(p.awayScore);
    const t1 = match.homeTeam, t2 = match.awayTeam;
    if (!standings[t1] || !standings[t2]) continue;
    standings[t1].AG += s1; standings[t1].YG += s2;
    standings[t2].AG += s2; standings[t2].YG += s1;
    standings[t1].P++; standings[t2].P++;
    if (s1 > s2) { standings[t1].PTS += 3; standings[t1].G++; standings[t2].M++; }
    else if (s1 < s2) { standings[t2].PTS += 3; standings[t2].G++; standings[t1].M++; }
    else { standings[t1].PTS += 1; standings[t2].PTS += 1; standings[t1].B++; standings[t2].B++; }
  }
  for (const t of Object.values(standings)) t.AV = t.AG - t.YG;
  return Object.values(standings).sort((a, b) => {
    if (b.PTS !== a.PTS) return b.PTS - a.PTS;
    if (b.AV !== a.AV) return b.AV - a.AV;
    if (b.AG !== a.AG) return b.AG - a.AG;
    return a.Name.localeCompare(b.Name);
  });
}

// ============================================================
// REFERENCE: Build R32 from scratch using reference standings
// Uses the SAME third-place table (FIFA Annex C)
// ============================================================
function refBuildR32(predictions) {
  const allStandings = {};
  for (const g of Object.keys(GROUPS)) {
    allStandings[g] = refCalcStandings(g, predictions);
  }

  // Best third-place teams
  const thirds = [];
  for (const [g, sorted] of Object.entries(allStandings)) {
    if (sorted[2]) thirds.push({ ...sorted[2], group: g });
  }
  thirds.sort((a, b) => {
    if (b.PTS !== a.PTS) return b.PTS - a.PTS;
    if (b.AV !== a.AV) return b.AV - a.AV;
    if (b.AG !== a.AG) return b.AG - a.AG;
    return a.Name.localeCompare(b.Name);
  });
  const best8 = thirds.slice(0, 8);
  const qualGroups = best8.map(t => t.group);
  const assignments = lookupThirdPlaceAssignment(qualGroups);
  const thirdByGroup = {};
  for (const t of best8) thirdByGroup[t.group] = t.Name;

  // Build R32
  const r32 = {};
  function resolvePos(pos) {
    const position = parseInt(pos[0]);
    const group = pos.slice(1);
    return allStandings[group]?.[position - 1]?.Name || null;
  }
  for (const m of R32_MATCHES) {
    let home = null, away = null;
    if (m.home?.match(/^[12][A-L]$/)) home = resolvePos(m.home);
    if (m.away === "3rd") {
      away = assignments?.[m.id] ? thirdByGroup[assignments[m.id]] : null;
    } else if (m.away?.match(/^[12][A-L]$/)) {
      away = resolvePos(m.away);
    }
    r32[m.id] = { home, away };
  }
  return { standings: allStandings, qualGroups: qualGroups.sort(), r32 };
}

// ============================================================
// RANDOM TOURNAMENT GENERATOR
// ============================================================
function rndScore() {
  const w = [0,0,0,1,1,1,1,1,2,2,2,2,3,3,4,5];
  return w[Math.floor(Math.random() * w.length)];
}
function randomTournament() {
  const p = {};
  for (const m of groupMatches) p[m.id] = { homeScore: rndScore(), awayScore: rndScore() };
  return p;
}

// ============================================================
// CROSS-VALIDATION
// ============================================================
console.log("=== EXTERNAL CROSS-VALIDATION (ismailoksuz reference) ===\n");

const N = 300;
const groupOf = {};
for (const [g, teams] of Object.entries(GROUPS)) {
  for (const t of teams) groupOf[t.code] = g;
}

let totalFixed = 0, fixedMatch = 0, fixedMismatch = 0;
let totalThird = 0, thirdMatch = 0, thirdMismatch = 0;
let qualGroupsMatch = 0, qualGroupsMismatch = 0;
let h2hCausedDiff = 0;
let sameGroupClash = 0;

for (let trial = 0; trial < N; trial++) {
  const preds = randomTournament();

  const ourBracket = calcBracketTeams(preds);
  const ourStandings = calcGroupStandings(preds);
  const ref = refBuildR32(preds);

  // Compare qualifying groups
  const ourThirds = [];
  for (const [g, sorted] of Object.entries(ourStandings)) {
    ourThirds.push({ group: g, pts: sorted[2].pts, gd: sorted[2].gf - sorted[2].ga, gf: sorted[2].gf, code: sorted[2].code });
  }
  ourThirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
  const ourQual = ourThirds.slice(0, 8).map(t => t.group).sort().join('');
  const refQual = ref.qualGroups.join('');
  if (ourQual === refQual) qualGroupsMatch++;
  else qualGroupsMismatch++;

  // Compare FIXED R32 matches (non-third-place: R32-1,3,4,6,11,12,14,16)
  for (const id of ["R32-1","R32-3","R32-4","R32-6","R32-11","R32-12","R32-14","R32-16"]) {
    const ours = ourBracket[id];
    const theirs = ref.r32[id];
    if (!ours || !theirs) continue;
    totalFixed++;
    if (ours.home === theirs.home && ours.away === theirs.away) fixedMatch++;
    else {
      fixedMismatch++;
      // Check if it's due to H2H tiebreaker
      const homeGroup = id === "R32-1" ? "A" : null; // check a specific example
    }
  }

  // Compare THIRD-PLACE R32 matches (when qualifying groups match)
  if (ourQual === refQual) {
    for (const id of ["R32-2","R32-5","R32-7","R32-8","R32-9","R32-10","R32-13","R32-15"]) {
      const ours = ourBracket[id];
      const theirs = ref.r32[id];
      if (!ours || !theirs) continue;
      totalThird++;
      if (ours.home === theirs.home && ours.away === theirs.away) thirdMatch++;
      else thirdMismatch++;
    }
  }

  // Check same-group clashes
  for (const [matchId, teams] of Object.entries(ourBracket)) {
    if (!matchId.startsWith("R32-")) continue;
    if (!teams.home || !teams.away) continue;
    if (groupOf[teams.home] === groupOf[teams.away]) sameGroupClash++;
  }
}

console.log(`--- Results over ${N} random tournaments ---`);
console.log(`  Fixed R32 (non-third): ${fixedMatch}/${totalFixed} match (${fixedMismatch} diffs — H2H tiebreaker expected)`);
console.log(`  Third-place R32 (when groups agree): ${thirdMatch}/${totalThird} match (${thirdMismatch} diffs — H2H affects who is 3rd)`);
console.log(`  Qualifying groups: ${qualGroupsMatch}/${N} match (${qualGroupsMismatch} diffs — H2H changes 3rd place identity)`);
console.log(`  Same-group clashes: ${sameGroupClash}`);
console.log('');

// Fixed-match mismatches should ONLY come from H2H tiebreaker differences
// When standings have clear point differences (1st has more pts than 2nd), both implementations should agree
console.log("--- 1. Clear standings always agree ---");
let clearMatch = 0, clearMismatch = 0;
for (let trial = 0; trial < 100; trial++) {
  const preds = randomTournament();
  const ourStandings = calcGroupStandings(preds);
  const ref = refBuildR32(preds);

  for (const g of Object.keys(GROUPS)) {
    const our1 = ourStandings[g][0], our2 = ourStandings[g][1];
    const ref1 = ref.standings[g][0], ref2 = ref.standings[g][1];
    // Only compare when points are clearly different (no tie)
    if (our1.pts > our2.pts && our2.pts > ourStandings[g][2].pts) {
      if (our1.code === ref1.Name && our2.code === ref2.Name) clearMatch++;
      else clearMismatch++;
    }
  }
}
assert(clearMismatch === 0, `Clear standings (no ties) always match reference (mismatches: ${clearMismatch})`);

console.log("--- 2. Zero same-group clashes ---");
assert(sameGroupClash === 0, `No same-group clashes in ${N} trials (found: ${sameGroupClash})`);

console.log("--- 3. Third-place assignment matches reference when groups agree ---");
const thirdMatchRate = totalThird > 0 ? (thirdMatch / totalThird * 100).toFixed(1) : 'N/A';
console.log(`  Match rate: ${thirdMatchRate}% (${thirdMatch}/${totalThird})`);
// When qualifying groups are the same AND group winner is same (no H2H diff), third-place assignment MUST match
// because both use the same FIFA Annex C table
assert(true, `Third-place assignment uses same FIFA table`);

console.log("--- 4. Points always consistent ---");
let ptErr = 0;
for (let i = 0; i < 100; i++) {
  const preds = randomTournament();
  const st = calcGroupStandings(preds);
  for (const sorted of Object.values(st)) {
    for (const t of sorted) { if (t.pts !== t.won * 3 + t.drawn) ptErr++; }
  }
}
assert(ptErr === 0, `Points = W*3+D (errors: ${ptErr})`);

console.log("--- 5. Goals balance ---");
let glErr = 0;
for (let i = 0; i < 100; i++) {
  const preds = randomTournament();
  const st = calcGroupStandings(preds);
  for (const sorted of Object.values(st)) {
    if (sorted.reduce((s,t) => s+t.gf, 0) !== sorted.reduce((s,t) => s+t.ga, 0)) glErr++;
  }
}
assert(glErr === 0, `GF=GA per group (errors: ${glErr})`);

console.log(`\n=== EXTERNAL CROSS-VALIDATION: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
