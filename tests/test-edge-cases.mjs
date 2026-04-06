// Edge case tests: group tiebreakers, all draws, three-way ties, knockout penalties
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcGroupStandings, calcBracketTeams, deriveAdvancingTeams, deriveChampion } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

function fillAllGroups(overrides = {}) {
  const p = {};
  for (const m of groupMatches) p[m.id] = overrides[m.id] || { homeScore: 1, awayScore: 0 };
  return p;
}

function getGroupMatches(group) { return groupMatches.filter(m => m.group === group); }

console.log("=== EDGE CASE TESTS ===\n");

// ---- 1. All matches draw 0-0 ----
console.log("--- 1. All group matches 0-0 draw ---");
const allDraw = {};
for (const m of groupMatches) allDraw[m.id] = { homeScore: 0, awayScore: 0 };
const st1 = calcGroupStandings(allDraw);
for (const [group, teams] of Object.entries(st1)) {
  // All teams should have 3pts (3 draws)
  for (const t of teams) {
    assert(t.pts === 3, `Group ${group} ${t.code}: all draws should give 3pts, got ${t.pts}`);
    assert(t.gf === 0 && t.ga === 0, `Group ${group} ${t.code}: GF/GA should be 0`);
  }
  // With identical stats, tiebreaker falls to alphabetical
  for (let i = 0; i < teams.length - 1; i++) {
    assert(teams[i].code < teams[i + 1].code,
      `Group ${group}: ${teams[i].code} should be before ${teams[i + 1].code} (alphabetical)`);
  }
}

// ---- 2. All matches draw 1-1 ----
console.log("--- 2. All group matches 1-1 draw ---");
const allDraw11 = {};
for (const m of groupMatches) allDraw11[m.id] = { homeScore: 1, awayScore: 1 };
const st2 = calcGroupStandings(allDraw11);
for (const [group, teams] of Object.entries(st2)) {
  for (const t of teams) {
    assert(t.pts === 3, `Group ${group} ${t.code}: 3pts`);
    assert(t.gf === 3 && t.ga === 3, `Group ${group} ${t.code}: GF=3 GA=3, got GF=${t.gf} GA=${t.ga}`);
  }
}

// ---- 3. Two teams tied on points, H2H decides ----
console.log("--- 3. Two-team H2H tiebreaker ---");
// Group A: MEX(0) RSA(1) KOR(2) CZE(3)
// Matches: [0]MEX-CZE, [1]RSA-KOR, [2]CZE-KOR, [3]MEX-RSA, [4]KOR-MEX, [5]CZE-RSA
const gA = getGroupMatches("A");
const h2h2 = fillAllGroups({
  [gA[0].id]: { homeScore: 2, awayScore: 0 }, // MEX 2-0 CZE
  [gA[1].id]: { homeScore: 2, awayScore: 0 }, // RSA 2-0 KOR
  [gA[2].id]: { homeScore: 0, awayScore: 1 }, // CZE 0-1 KOR
  [gA[3].id]: { homeScore: 1, awayScore: 0 }, // MEX 1-0 RSA (MEX beats RSA in H2H)
  [gA[4].id]: { homeScore: 0, awayScore: 1 }, // KOR 0-1 MEX
  [gA[5].id]: { homeScore: 0, awayScore: 1 }, // CZE 0-1 RSA
});
// MEX: W3 = 9pts, RSA: W2 L1 = 6pts, KOR: W1 L2 = 3pts, CZE: L3 = 0pts
const stH2H = calcGroupStandings(h2h2);
assert(stH2H.A[0].code === "MEX" && stH2H.A[0].pts === 9, "MEX 1st with 9pts");
assert(stH2H.A[1].code === "RSA" && stH2H.A[1].pts === 6, "RSA 2nd with 6pts");
assert(stH2H.A[2].code === "KOR" && stH2H.A[2].pts === 3, "KOR 3rd with 3pts");
assert(stH2H.A[3].code === "CZE" && stH2H.A[3].pts === 0, "CZE 4th with 0pts");

// ---- 4. Three teams tied on points ----
console.log("--- 4. Three-team tie (cycle: A>B>C>A) ---");
// MEX beats RSA, RSA beats KOR, KOR beats MEX (cycle) -- all beat CZE
const h2h3 = fillAllGroups({
  [gA[0].id]: { homeScore: 2, awayScore: 0 }, // MEX 2-0 CZE
  [gA[1].id]: { homeScore: 1, awayScore: 0 }, // RSA 1-0 KOR (RSA beats KOR)
  [gA[2].id]: { homeScore: 0, awayScore: 1 }, // CZE 0-1 KOR (KOR beats CZE)
  [gA[3].id]: { homeScore: 1, awayScore: 0 }, // MEX 1-0 RSA (MEX beats RSA)
  [gA[4].id]: { homeScore: 2, awayScore: 0 }, // KOR 2-0 MEX (KOR beats MEX)
  [gA[5].id]: { homeScore: 0, awayScore: 3 }, // CZE 0-3 RSA (RSA beats CZE)
});
// MEX: W2 L1, pts=6, GF=3 GA=2 GD=+1
// RSA: W2 L1, pts=6, GF=4 GA=1 GD=+3
// KOR: W2 L1, pts=6, GF=3 GA=2 GD=+1
// CZE: L3, pts=0
// H2H among MEX,RSA,KOR: each beat one, lost to one -> H2H pts all 3
// H2H GD: MEX(1-0 RSA, 0-2 KOR)=GD-1, RSA(1-0 KOR, 0-1 MEX)=GD0, KOR(2-0 MEX, 0-1 RSA)=GD+1
// H2H order: KOR(GD+1) > RSA(GD0) > MEX(GD-1)
const st3 = calcGroupStandings(h2h3);
assert(st3.A[0].pts === 6, "3-way tie: all have 6pts");
assert(st3.A[1].pts === 6, "3-way tie: second also 6pts");
assert(st3.A[2].pts === 6, "3-way tie: third also 6pts");
assert(st3.A[3].code === "CZE" && st3.A[3].pts === 0, "CZE 4th with 0pts");

// H2H among the 3: KOR H2H GD=+1, RSA H2H GD=0, MEX H2H GD=-1
assert(st3.A[0].code === "KOR", `3-way H2H: 1st should be KOR (H2H GD+1), got ${st3.A[0].code}`);
assert(st3.A[1].code === "RSA", `3-way H2H: 2nd should be RSA (H2H GD 0), got ${st3.A[1].code}`);
assert(st3.A[2].code === "MEX", `3-way H2H: 3rd should be MEX (H2H GD-1), got ${st3.A[2].code}`);

// ---- 5. Goal difference tiebreaker (after H2H tied) ----
console.log("--- 5. Overall GD tiebreaker ---");
// Two teams with same H2H but different overall GD
const h2h5 = fillAllGroups({
  [gA[0].id]: { homeScore: 3, awayScore: 0 }, // MEX 3-0 CZE (big win)
  [gA[1].id]: { homeScore: 1, awayScore: 0 }, // RSA 1-0 KOR
  [gA[2].id]: { homeScore: 0, awayScore: 1 }, // CZE 0-1 KOR
  [gA[3].id]: { homeScore: 1, awayScore: 1 }, // MEX 1-1 RSA (draw - tied H2H)
  [gA[4].id]: { homeScore: 0, awayScore: 1 }, // KOR 0-1 MEX
  [gA[5].id]: { homeScore: 1, awayScore: 0 }, // CZE 1-0 RSA
});
// MEX: W2 D1 = 7pts, GF=5 GA=1 GD=+4
// RSA: W1 D1 L1 = 4pts, GF=2 GA=2 GD=0
// KOR: W1 L2 = 3pts, GF=1 GA=2 GD=-1
// CZE: W1 L2 = 3pts, GF=1 GA=4 GD=-3
// KOR vs CZE: same pts(3). H2H: KOR beat CZE 1-0 -> KOR wins
const st5 = calcGroupStandings(h2h5);
assert(st5.A[0].code === "MEX", `GD test: 1st MEX, got ${st5.A[0].code}`);
assert(st5.A[2].code === "KOR", `GD test: 3rd KOR (beat CZE H2H), got ${st5.A[2].code}`);
assert(st5.A[3].code === "CZE", `GD test: 4th CZE, got ${st5.A[3].code}`);

// ---- 6. Bracket with all knockout draws (penalties) ----
console.log("--- 6. All knockout draws (penalty shootouts) ---");
const penPreds = {};
for (const m of groupMatches) penPreds[m.id] = { homeScore: 1, awayScore: 0 };

const bracket1 = calcBracketTeams(penPreds);
// Now fill all knockout matches as draws, with home team advancing
for (const [matchId, teams] of Object.entries(bracket1)) {
  if (!matchId.startsWith("group-")) {
    penPreds[matchId] = { homeScore: 1, awayScore: 1, advancingTeam: teams.home };
  }
}

const bracket2 = calcBracketTeams(penPreds);
const adv = deriveAdvancingTeams(bracket2);
assert(adv.R32.length === 32, `Penalty bracket: R32 has 32 teams`);
assert(adv.R16.length > 0, `Penalty bracket: R16 has teams`);
assert(adv.QF.length > 0, `Penalty bracket: QF has teams`);
assert(adv.SF.length > 0, `Penalty bracket: SF has teams`);
assert(adv.F.length === 2, `Penalty bracket: Final has 2 teams, got ${adv.F.length}`);

const champPen = deriveChampion(penPreds, bracket2);
assert(champPen !== null, `Penalty champion derived: ${champPen}`);

// ---- 7. Away team wins all penalties ----
console.log("--- 7. Away team wins all penalties ---");
const awayPreds = {};
for (const m of groupMatches) awayPreds[m.id] = { homeScore: 1, awayScore: 0 };
const awayBracket1 = calcBracketTeams(awayPreds);
for (const [matchId, teams] of Object.entries(awayBracket1)) {
  if (!matchId.startsWith("group-")) {
    awayPreds[matchId] = { homeScore: 0, awayScore: 0, advancingTeam: teams.away };
  }
}
const awayBracket2 = calcBracketTeams(awayPreds);
const champAway = deriveChampion(awayPreds, awayBracket2);
assert(champAway !== null, `Away penalty champion: ${champAway}`);

// ---- 8. Best third place with all-identical stats ----
console.log("--- 8. Best third place: identical third-place teams ---");
// All groups have same result pattern -> all third-place teams identical stats
// With all home wins 1-0: each group's 3rd place team has W1 L2 = 3pts, GF=1, GA=2
const allHome = fillAllGroups();
const stHome = calcGroupStandings(allHome);
const thirdPlaces = [];
for (const [group, teams] of Object.entries(stHome)) {
  thirdPlaces.push({ ...teams[2], group });
}
// All third-place teams should have same pts/GD/GF
const pts3 = thirdPlaces.map(t => t.pts);
const allSamePts = pts3.every(p => p === pts3[0]);
assert(allSamePts, `All 3rd-place teams same pts: ${[...new Set(pts3)].join(",")}`);

// Should still select best 8 (alphabetical tiebreak among equal)
const bracket3 = calcBracketTeams(allHome);
const thirdInBracket = Object.entries(bracket3).filter(([id]) => {
  return id.match(/^R32-(2|5|7|8|9|10|13|15)$/);
});
assert(thirdInBracket.length === 8, `8 third-place R32 slots filled`);
// All 8 should have an away team
let thirdFilled = 0;
for (const [id, teams] of thirdInBracket) {
  if (teams.away) thirdFilled++;
}
assert(thirdFilled === 8, `All 8 third-place slots have teams, got ${thirdFilled}`);

// ---- 9. Missing predictions for some matches ----
console.log("--- 9. Partial predictions ---");
const partial = {};
// Only fill half the matches
const halfMatches = groupMatches.slice(0, 36);
for (const m of halfMatches) partial[m.id] = { homeScore: 1, awayScore: 0 };
const stPartial = calcGroupStandings(partial);
// Should not crash, some groups will have partial standings
assert(stPartial !== null, "Partial predictions don't crash calcGroupStandings");

// ---- 10. All groups: one team wins everything with huge scores ----
console.log("--- 10. Dominant team in each group ---");
const dominant = {};
for (const m of groupMatches) {
  const groupTeams = GROUPS[m.group].map(t => t.code);
  const first = groupTeams[0];
  if (m.homeTeam === first) {
    dominant[m.id] = { homeScore: 10, awayScore: 0 };
  } else if (m.awayTeam === first) {
    dominant[m.id] = { homeScore: 0, awayScore: 10 };
  } else {
    dominant[m.id] = { homeScore: 0, awayScore: 0 };
  }
}
const stDom = calcGroupStandings(dominant);
for (const [group, teams] of Object.entries(stDom)) {
  const first = GROUPS[group][0].code;
  assert(teams[0].code === first, `Group ${group}: ${first} should be 1st with 9pts, got ${teams[0].code}`);
  assert(teams[0].pts === 9, `Group ${group}: winner has 9pts, got ${teams[0].pts}`);
  assert(teams[0].gf === 30, `Group ${group}: winner GF=30, got ${teams[0].gf}`);
}

// ---- 11. 3rd place match: losers of semifinals ----
console.log("--- 11. Third place match teams are SF losers ---");
const fullPreds = {};
for (const m of groupMatches) fullPreds[m.id] = { homeScore: 1, awayScore: 0 };
const b11 = calcBracketTeams(fullPreds);
for (const [id, teams] of Object.entries(b11)) {
  if (!id.startsWith("group-") && !fullPreds[id]) {
    fullPreds[id] = { homeScore: 2, awayScore: 0 };
  }
}
const b11_2 = calcBracketTeams(fullPreds);
const sf1Teams = b11_2["SF-1"];
const sf2Teams = b11_2["SF-2"];
const thirdMatch = b11_2["3RD-1"];
// SF-1 home wins 2-0 -> loser is away
// SF-2 home wins 2-0 -> loser is away
if (sf1Teams?.home && sf1Teams?.away && sf2Teams?.home && sf2Teams?.away) {
  assert(thirdMatch.home === sf1Teams.away, `3rd match home = SF-1 loser (${sf1Teams.away}), got ${thirdMatch.home}`);
  assert(thirdMatch.away === sf2Teams.away, `3rd match away = SF-2 loser (${sf2Teams.away}), got ${thirdMatch.away}`);
}

// ---- 12. Full bracket: 32 unique teams in R32 ----
console.log("--- 12. R32 has 32 unique teams ---");
const b12 = calcBracketTeams(fillAllGroups());
const r32Teams = new Set();
for (const [id, teams] of Object.entries(b12)) {
  if (id.startsWith("R32-")) {
    if (teams.home) r32Teams.add(teams.home);
    if (teams.away) r32Teams.add(teams.away);
  }
}
assert(r32Teams.size === 32, `R32 unique teams: expected 32, got ${r32Teams.size}`);

// Verify top 2 from each group + 8 third-place teams = 32
// 12 groups * 2 = 24 + 8 third = 32
let top2Count = 0;
let thirdCount = 0;
const stAll = calcGroupStandings(fillAllGroups());
for (const teams of Object.values(stAll)) {
  if (r32Teams.has(teams[0].code)) top2Count++;
  if (r32Teams.has(teams[1].code)) top2Count++;
  if (r32Teams.has(teams[2].code)) thirdCount++;
}
assert(top2Count === 24, `24 top-2 teams in R32, got ${top2Count}`);
assert(thirdCount === 8, `8 third-place teams in R32, got ${thirdCount}`);

// ---- 13. 4th place teams never in R32 ----
console.log("--- 13. No 4th-place teams in R32 ---");
let fourthInR32 = 0;
for (const teams of Object.values(stAll)) {
  if (r32Teams.has(teams[3].code)) fourthInR32++;
}
assert(fourthInR32 === 0, `No 4th-place teams in R32, found ${fourthInR32}`);

// ---- 14. Only 4 third-place teams excluded ----
console.log("--- 14. Exactly 4 third-place teams excluded ---");
let thirdExcluded = 0;
for (const teams of Object.values(stAll)) {
  if (!r32Teams.has(teams[2].code)) thirdExcluded++;
}
assert(thirdExcluded === 4, `4 third-place teams excluded from R32, got ${thirdExcluded}`);

console.log(`\n=== EDGE CASE RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
