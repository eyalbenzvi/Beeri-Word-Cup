import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches, R32_MATCHES, R16_MATCHES, QF_MATCHES, SF_MATCHES, FINAL_MATCHES, ALL_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcGroupStandings, calcBracketTeams, deriveAdvancingTeams, deriveChampion } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { THIRD_PLACE_TABLE, THIRD_PLACE_SLOTS, lookupThirdPlaceAssignment } from '/home/user/Beeri-World-Cup/src/data/thirdPlaceTable.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== BRACKET & ADVANCEMENT TESTS ===\n");

console.log("--- 1. Match counts ---");
assert(groupMatches.length === 72, `Group matches: expected 72, got ${groupMatches.length}`);
assert(ALL_MATCHES.filter(m => m.stage === "R32").length === 16, "R32 count");
assert(ALL_MATCHES.filter(m => m.stage === "R16").length === 8, "R16 count");
assert(ALL_MATCHES.filter(m => m.stage === "QF").length === 4, "QF count");
assert(ALL_MATCHES.filter(m => m.stage === "SF").length === 2, "SF count");
assert(ALL_MATCHES.filter(m => m.stage === "3RD").length === 1, "3RD count");
assert(ALL_MATCHES.filter(m => m.stage === "F").length === 1, "F count");
assert(ALL_MATCHES.length === 104, `Total: expected 104, got ${ALL_MATCHES.length}`);

console.log("--- 2. Groups ---");
assert(Object.keys(GROUPS).length === 12, "12 groups");
assert(Object.keys(GROUPS).join("") === "ABCDEFGHIJKL", "Groups A-L");
for (const [n, t] of Object.entries(GROUPS)) assert(t.length === 4, `Group ${n} has 4 teams`);
const allCodes = new Set(); for (const t of Object.values(GROUPS)) t.forEach(x => allCodes.add(x.code));
assert(allCodes.size === 48, `48 unique teams, got ${allCodes.size}`);

console.log("--- 3. Round-robin ---");
for (const g of Object.keys(GROUPS)) {
  const gm = groupMatches.filter(m => m.group === g);
  assert(gm.length === 6, `Group ${g}: 6 matches`);
  const teams = GROUPS[g].map(t => t.code);
  for (const t of teams) {
    const c = gm.filter(m => m.homeTeam === t || m.awayTeam === t).length;
    assert(c === 3, `Group ${g}, ${t}: 3 matches, got ${c}`);
  }
  for (let i = 0; i < teams.length; i++) for (let j = i+1; j < teams.length; j++) {
    const p = gm.filter(m => (m.homeTeam===teams[i]&&m.awayTeam===teams[j])||(m.homeTeam===teams[j]&&m.awayTeam===teams[i]));
    assert(p.length === 1, `Group ${g}, ${teams[i]} vs ${teams[j]}: 1 match`);
  }
}

console.log("--- 4. R32 structure ---");
assert(R32_MATCHES.filter(m => m.away === "3rd").length === 8, "8 third-place R32 matches");
assert(R32_MATCHES.filter(m => m.away !== "3rd").length === 8, "8 fixed R32 matches");

console.log("--- 5. R32 matchups ---");
const exp32 = {"R32-1":{h:"2A",a:"2B",f:73},"R32-2":{h:"1E",a:"3rd",f:74},"R32-3":{h:"1F",a:"2C",f:75},"R32-4":{h:"1C",a:"2F",f:76},"R32-5":{h:"1I",a:"3rd",f:77},"R32-6":{h:"2E",a:"2I",f:78},"R32-7":{h:"1A",a:"3rd",f:79},"R32-8":{h:"1L",a:"3rd",f:80},"R32-9":{h:"1D",a:"3rd",f:81},"R32-10":{h:"1G",a:"3rd",f:82},"R32-11":{h:"2K",a:"2L",f:83},"R32-12":{h:"1H",a:"2J",f:84},"R32-13":{h:"1B",a:"3rd",f:85},"R32-14":{h:"1J",a:"2H",f:86},"R32-15":{h:"1K",a:"3rd",f:87},"R32-16":{h:"2D",a:"2G",f:88}};
for (const m of R32_MATCHES) {
  const e = exp32[m.id];
  assert(m.home===e.h, `${m.id} home: ${e.h} got ${m.home}`);
  assert(m.away===e.a||e.a==="3rd"&&m.away==="3rd", `${m.id} away: ${e.a} got ${m.away}`);
  assert(m.fifaMatch===e.f, `${m.id} fifa: ${e.f} got ${m.fifaMatch}`);
}

console.log("--- 6. R16 feeding ---");
const exp16 = {"R16-1":{hf:"R32-2",af:"R32-5",f:89},"R16-2":{hf:"R32-1",af:"R32-3",f:90},"R16-3":{hf:"R32-4",af:"R32-6",f:91},"R16-4":{hf:"R32-7",af:"R32-8",f:92},"R16-5":{hf:"R32-11",af:"R32-12",f:93},"R16-6":{hf:"R32-9",af:"R32-10",f:94},"R16-7":{hf:"R32-14",af:"R32-16",f:95},"R16-8":{hf:"R32-13",af:"R32-15",f:96}};
for (const m of R16_MATCHES) {
  const e = exp16[m.id];
  assert(m.homeFrom===e.hf, `${m.id} homeFrom: ${e.hf} got ${m.homeFrom}`);
  assert(m.awayFrom===e.af, `${m.id} awayFrom: ${e.af} got ${m.awayFrom}`);
  assert(m.fifaMatch===e.f, `${m.id} fifa: ${e.f} got ${m.fifaMatch}`);
}

console.log("--- 7. QF/SF/F feeding ---");
assert(QF_MATCHES[0].homeFrom==="R16-1"&&QF_MATCHES[0].awayFrom==="R16-2", "QF-1");
assert(QF_MATCHES[1].homeFrom==="R16-3"&&QF_MATCHES[1].awayFrom==="R16-4", "QF-2");
assert(QF_MATCHES[2].homeFrom==="R16-5"&&QF_MATCHES[2].awayFrom==="R16-6", "QF-3");
assert(QF_MATCHES[3].homeFrom==="R16-7"&&QF_MATCHES[3].awayFrom==="R16-8", "QF-4");
assert(SF_MATCHES[0].homeFrom==="QF-1"&&SF_MATCHES[0].awayFrom==="QF-3", "SF-1");
assert(SF_MATCHES[1].homeFrom==="QF-2"&&SF_MATCHES[1].awayFrom==="QF-4", "SF-2");
assert(FINAL_MATCHES[1].homeFrom==="SF-1"&&FINAL_MATCHES[1].awayFrom==="SF-2", "Final");

console.log("--- 8. Group standings ---");
const preds = {};
const gaM = groupMatches.filter(m => m.group === "A");
preds[gaM[0].id] = {homeScore:2,awayScore:0}; // MEX 2-0 CZE
preds[gaM[1].id] = {homeScore:1,awayScore:0}; // RSA 1-0 KOR
preds[gaM[2].id] = {homeScore:0,awayScore:1}; // CZE 0-1 KOR
preds[gaM[3].id] = {homeScore:1,awayScore:0}; // MEX 1-0 RSA
preds[gaM[4].id] = {homeScore:0,awayScore:2}; // KOR 0-2 MEX
preds[gaM[5].id] = {homeScore:0,awayScore:3}; // CZE 0-3 RSA
for (const m of groupMatches) if (!preds[m.id]) preds[m.id] = {homeScore:1,awayScore:0};

const st = calcGroupStandings(preds);
assert(st.A[0].code==="MEX"&&st.A[0].pts===9, `1st MEX 9pts`);
assert(st.A[1].code==="RSA"&&st.A[1].pts===6, `2nd RSA 6pts`);
assert(st.A[2].code==="KOR"&&st.A[2].pts===3, `3rd KOR 3pts`);
assert(st.A[3].code==="CZE"&&st.A[3].pts===0, `4th CZE 0pts`);

console.log("--- 9. Full bracket + champion ---");
const bracket = calcBracketTeams(preds);
assert(bracket["R32-1"]?.home!=null, "R32-1 home resolved");
const adv = deriveAdvancingTeams(bracket);
assert(adv.R32.length===32, `R32 advancing: 32, got ${adv.R32.length}`);

// Add knockout preds and derive champion
for (const [id] of Object.entries(bracket)) if (!preds[id]) preds[id] = {homeScore:1,awayScore:0};
const b2 = calcBracketTeams(preds);
const champ = deriveChampion(preds, b2);
assert(champ!=null, "Champion derived");

// Penalty champion
const pp = {...preds}; pp["F-1"] = {homeScore:1,awayScore:1,advancingTeam:b2["F-1"]?.away};
const c2 = deriveChampion(pp, b2);
assert(c2===b2["F-1"]?.away, `Penalty champion should be away`);

console.log(`\n=== BRACKET RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
