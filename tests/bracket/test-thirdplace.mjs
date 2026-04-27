import { THIRD_PLACE_TABLE, THIRD_PLACE_SLOTS, lookupThirdPlaceAssignment } from '/home/user/Beeri-World-Cup/src/data/thirdPlaceTable.js';
import { R32_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== THIRD PLACE TABLE TESTS ===\n");

console.log("--- 1. 495 combinations ---");
function combos(a, k) { if (k===0) return [[]]; if (!a.length) return []; const [f,...r]=a; return [...combos(r,k-1).map(c=>[f,...c]),...combos(r,k)]; }
const all = combos("ABCDEFGHIJKL".split(""), 8);
assert(all.length===495, `C(12,8)=${all.length}`);
const missing = all.filter(c => !THIRD_PLACE_TABLE[c.join("")]);
assert(missing.length===0, `Missing combos: ${missing.length}`);

console.log("--- 2. Assignment validity ---");
let violations = [];
for (const [key, val] of Object.entries(THIRD_PLACE_TABLE)) {
  for (let i = 0; i < val.length; i++) if (!key.includes(val[i])) violations.push(`${key}[${i}]='${val[i]}' not in key`);
  if (new Set(val).size !== 8) violations.push(`${key}: duplicates in '${val}'`);
}
assert(violations.length===0, `Violations: ${violations.slice(0,5).join("; ")}`);

console.log("--- 3. thirdFrom constraints ---");
const slotCon = {};
for (const m of R32_MATCHES) if (m.away==="3rd") slotCon[m.id] = m.thirdFrom.split("/");
let cv = [];
for (const [key] of Object.entries(THIRD_PLACE_TABLE)) {
  const a = lookupThirdPlaceAssignment(key.split(""));
  if (!a) { cv.push(`${key}: null`); continue; }
  for (const [s, g] of Object.entries(a)) {
    if (slotCon[s] && !slotCon[s].includes(g)) cv.push(`${key}: ${s}=${g} not in ${slotCon[s].join("/")}`);
  }
}
assert(cv.length===0, `Constraint violations (${cv.length}): ${cv.slice(0,5).join("; ")}`);

console.log("--- 4. Lookup function ---");
const r1 = lookupThirdPlaceAssignment(["A","B","C","D","E","F","G","H"]);
assert(r1!=null&&Object.keys(r1).length===8, "ABCDEFGH: 8 slots");
const r2 = lookupThirdPlaceAssignment(["H","A","D","F","C","B","E","G"]);
assert(JSON.stringify(r1)===JSON.stringify(r2), "Unsorted same result");
assert(lookupThirdPlaceAssignment(["A","B","C","D","E","F","G"])===null, "7 groups=null");

console.log(`\n=== THIRD PLACE RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
