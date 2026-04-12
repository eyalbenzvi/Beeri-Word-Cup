import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches, R32_MATCHES, R16_MATCHES, QF_MATCHES, SF_MATCHES, FINAL_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== FIFA SCHEDULE VERIFICATION ===\n");

console.log("--- 1. Official groups ---");
const og = {A:["MEX","RSA","KOR","CZE"],B:["CAN","BIH","QAT","SUI"],C:["BRA","MAR","HAI","SCO"],D:["USA","PAR","AUS","TUR"],E:["GER","ECU","CIV","CUR"],F:["NED","JPN","SWE","TUN"],G:["BEL","EGY","IRN","NZL"],H:["ESP","CPV","KSA","URU"],I:["FRA","SEN","IRQ","NOR"],J:["ARG","ALG","AUT","JOR"],K:["POR","COD","UZB","COL"],L:["ENG","CRO","GHA","PAN"]};
for (const [g, codes] of Object.entries(og)) {
  const ac = GROUPS[g].map(t=>t.code);
  for (const c of codes) assert(ac.includes(c), `Group ${g}: missing ${c}`);
}

console.log("--- 2. Hosts ---");
assert(GROUPS.D[0].code==="USA", "USA pot1 in D");
assert(GROUPS.A[0].code==="MEX", "MEX pot1 in A");
assert(GROUPS.B[0].code==="CAN", "CAN pot1 in B");

console.log("--- 3. Matchdays ---");
for (const g of Object.keys(GROUPS)) {
  const gm = groupMatches.filter(m=>m.group===g);
  assert(gm.filter(m=>m.matchday===1).length===2, `${g} MD1`);
  assert(gm.filter(m=>m.matchday===2).length===2, `${g} MD2`);
  assert(gm.filter(m=>m.matchday===3).length===2, `${g} MD3`);
}

console.log("--- 4. No self-play ---");
for (const m of groupMatches) assert(m.homeTeam!==m.awayTeam, `${m.id}: self-play`);

console.log("--- 5. Teams in groups ---");
for (const m of groupMatches) {
  const gc = GROUPS[m.group].map(t=>t.code);
  assert(gc.includes(m.homeTeam), `${m.id}: ${m.homeTeam} not in ${m.group}`);
  assert(gc.includes(m.awayTeam), `${m.id}: ${m.awayTeam} not in ${m.group}`);
}

console.log("--- 6. Dates order (Israel time) ---");
// Dates are now in Israel time (IDT, UTC+3) — late US matches roll to next day
const dOrd = ["Jun 29","Jun 30","Jul 1","Jul 2","Jul 3","Jul 4","Jul 5","Jul 6","Jul 7","Jul 8","Jul 9","Jul 10","Jul 11","Jul 12","Jul 14","Jul 15","Jul 19"];
const di = d => dOrd.indexOf(d);
for (const r of R32_MATCHES) for (const l of R16_MATCHES) assert(di(r.date)<=di(l.date), `R32 ${r.date} before/same R16 ${l.date}`);
for (const r of R16_MATCHES) for (const q of QF_MATCHES) assert(di(r.date)<=di(q.date), `R16 before/same QF`);
for (const q of QF_MATCHES) for (const s of SF_MATCHES) assert(di(q.date)<=di(s.date), `QF before/same SF`);
assert(FINAL_MATCHES[1].date==="Jul 19", "Final Jul 19");
assert(FINAL_MATCHES[0].date==="Jul 19", "3rd place Jul 19");

console.log("--- 7. FIFA numbers ---");
const allK = [...R32_MATCHES,...R16_MATCHES,...QF_MATCHES,...SF_MATCHES,...FINAL_MATCHES];
const fns = new Set(allK.map(m=>m.fifaMatch));
assert(fns.size===32, "32 unique FIFA numbers");
for (let i=73;i<=104;i++) assert(fns.has(i), `FIFA match ${i}`);

console.log(`\n=== SCHEDULE RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
