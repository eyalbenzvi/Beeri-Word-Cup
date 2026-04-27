// Cross-validation against official FIFA Excel calculator (hermann-baum.de)
// The Excel data was extracted and hardcoded here as the ground truth

import { R32_MATCHES, R16_MATCHES, QF_MATCHES, SF_MATCHES, FINAL_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== EXCEL CROSS-VALIDATION (hermann-baum.de WCup 2026) ===\n");

// ============================================================
// GROUND TRUTH: Extracted from WCup_2026_4.2.3_en.xlsx
// ============================================================

const EXCEL_R32 = [
  { fifa: 73, home: "2A", away: "2B" },
  { fifa: 74, home: "1E", away: "3rd", thirdFrom: "A/B/C/D/F" },
  { fifa: 75, home: "1F", away: "2C" },
  { fifa: 76, home: "1C", away: "2F" },
  { fifa: 77, home: "1I", away: "3rd", thirdFrom: "C/D/F/G/H" },
  { fifa: 78, home: "2E", away: "2I" },
  { fifa: 79, home: "1A", away: "3rd", thirdFrom: "C/E/F/H/I" },
  { fifa: 80, home: "1L", away: "3rd", thirdFrom: "E/H/I/J/K" },
  { fifa: 81, home: "1D", away: "3rd", thirdFrom: "B/E/F/I/J" },
  { fifa: 82, home: "1G", away: "3rd", thirdFrom: "A/E/H/I/J" },
  { fifa: 83, home: "2K", away: "2L" },
  { fifa: 84, home: "1H", away: "2J" },
  { fifa: 85, home: "1B", away: "3rd", thirdFrom: "E/F/G/I/J" },
  { fifa: 86, home: "1J", away: "2H" },
  { fifa: 87, home: "1K", away: "3rd", thirdFrom: "D/E/I/J/L" },
  { fifa: 88, home: "2D", away: "2G" },
];

// R16: Winner of match X vs Winner of match Y
const EXCEL_R16 = [
  { fifa: 89, homeFrom: 74, awayFrom: 77 },  // W74 v W77
  { fifa: 90, homeFrom: 73, awayFrom: 75 },  // W73 v W75
  { fifa: 91, homeFrom: 76, awayFrom: 78 },  // W76 v W78
  { fifa: 92, homeFrom: 79, awayFrom: 80 },  // W79 v W80
  { fifa: 93, homeFrom: 83, awayFrom: 84 },  // W83 v W84
  { fifa: 94, homeFrom: 81, awayFrom: 82 },  // W81 v W82
  { fifa: 95, homeFrom: 86, awayFrom: 88 },  // W86 v W88
  { fifa: 96, homeFrom: 85, awayFrom: 87 },  // W85 v W87
];

// QF
const EXCEL_QF = [
  { fifa: 97, homeFrom: 89, awayFrom: 90 },
  { fifa: 98, homeFrom: 93, awayFrom: 94 },
  { fifa: 99, homeFrom: 91, awayFrom: 92 },
  { fifa: 100, homeFrom: 95, awayFrom: 96 },
];

// SF
const EXCEL_SF = [
  { fifa: 101, homeFrom: 97, awayFrom: 98 },
  { fifa: 102, homeFrom: 99, awayFrom: 100 },
];

// Final + 3rd place
const EXCEL_FINAL = [
  { fifa: 103, type: "3rd" },  // L101 v L102
  { fifa: 104, type: "final" }, // W101 v W102
];

// ============================================================
// FIFA match number to our match ID mapping
// ============================================================
const allMatches = [...R32_MATCHES, ...R16_MATCHES, ...QF_MATCHES, ...SF_MATCHES, ...FINAL_MATCHES];
const byFifa = {};
for (const m of allMatches) byFifa[m.fifaMatch] = m;

// ============================================================
// TESTS
// ============================================================

console.log("--- 1. R32 matches: home teams ---");
for (const ex of EXCEL_R32) {
  const our = byFifa[ex.fifa];
  assert(our, `FIFA ${ex.fifa} exists in our data`);
  if (!our) continue;
  assert(our.home === ex.home, `FIFA ${ex.fifa}: home=${ex.home}, got ${our.home}`);
}

console.log("--- 2. R32 matches: away teams ---");
for (const ex of EXCEL_R32) {
  const our = byFifa[ex.fifa];
  if (!our) continue;
  if (ex.away === "3rd") {
    assert(our.away === "3rd", `FIFA ${ex.fifa}: away should be 3rd, got ${our.away}`);
  } else {
    assert(our.away === ex.away, `FIFA ${ex.fifa}: away=${ex.away}, got ${our.away}`);
  }
}

console.log("--- 3. R32 thirdFrom constraints ---");
for (const ex of EXCEL_R32) {
  if (!ex.thirdFrom) continue;
  const our = byFifa[ex.fifa];
  if (!our) continue;
  assert(our.thirdFrom === ex.thirdFrom, `FIFA ${ex.fifa}: thirdFrom=${ex.thirdFrom}, got ${our.thirdFrom}`);
}

console.log("--- 4. R32 FIFA match numbers ---");
for (const ex of EXCEL_R32) {
  const our = byFifa[ex.fifa];
  assert(our?.fifaMatch === ex.fifa, `FIFA ${ex.fifa} match number correct`);
}

console.log("--- 5. R16 feeding (winner of X vs winner of Y) ---");
for (const ex of EXCEL_R16) {
  const our = byFifa[ex.fifa];
  assert(our, `FIFA ${ex.fifa} exists`);
  if (!our) continue;
  // Map FIFA match numbers to our R32 IDs
  const homeR32 = byFifa[ex.homeFrom];
  const awayR32 = byFifa[ex.awayFrom];
  assert(our.homeFrom === homeR32?.id, `FIFA ${ex.fifa}: homeFrom W${ex.homeFrom}=${homeR32?.id}, got ${our.homeFrom}`);
  assert(our.awayFrom === awayR32?.id, `FIFA ${ex.fifa}: awayFrom W${ex.awayFrom}=${awayR32?.id}, got ${our.awayFrom}`);
}

console.log("--- 6. QF feeding ---");
for (const ex of EXCEL_QF) {
  const our = byFifa[ex.fifa];
  assert(our, `FIFA ${ex.fifa} exists`);
  if (!our) continue;
  const homeR16 = byFifa[ex.homeFrom];
  const awayR16 = byFifa[ex.awayFrom];
  assert(our.homeFrom === homeR16?.id, `FIFA ${ex.fifa}: homeFrom W${ex.homeFrom}=${homeR16?.id}, got ${our.homeFrom}`);
  assert(our.awayFrom === awayR16?.id, `FIFA ${ex.fifa}: awayFrom W${ex.awayFrom}=${awayR16?.id}, got ${our.awayFrom}`);
}

console.log("--- 7. SF feeding ---");
for (const ex of EXCEL_SF) {
  const our = byFifa[ex.fifa];
  assert(our, `FIFA ${ex.fifa} exists`);
  if (!our) continue;
  const homeQF = byFifa[ex.homeFrom];
  const awayQF = byFifa[ex.awayFrom];
  assert(our.homeFrom === homeQF?.id, `FIFA ${ex.fifa}: homeFrom W${ex.homeFrom}=${homeQF?.id}, got ${our.homeFrom}`);
  assert(our.awayFrom === awayQF?.id, `FIFA ${ex.fifa}: awayFrom W${ex.awayFrom}=${awayQF?.id}, got ${our.awayFrom}`);
}

console.log("--- 8. Final + 3rd place ---");
assert(byFifa[103]?.id === "3RD-1", `FIFA 103 = 3rd place match`);
assert(byFifa[104]?.id === "F-1", `FIFA 104 = Final`);

console.log("--- 9. Group structure matches Excel ---");
// From Excel: Group E has Germany, Curaçao, Ivory Coast, Ecuador
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
const excelGroups = {
  A: ["MEX", "RSA", "KOR", "CZE"],
  B: ["CAN", "BIH", "QAT", "SUI"],
  C: ["BRA", "MAR", "HAI", "SCO"],
  D: ["USA", "PAR", "AUS", "TUR"],
  E: ["GER", "CUR", "CIV", "ECU"],
  F: ["NED", "JPN", "SWE", "TUN"],
  G: ["BEL", "EGY", "IRN", "NZL"],
  H: ["ESP", "CPV", "KSA", "URU"],
  I: ["FRA", "SEN", "IRQ", "NOR"],
  J: ["ARG", "ALG", "AUT", "JOR"],
  K: ["POR", "COD", "UZB", "COL"],
  L: ["ENG", "CRO", "GHA", "PAN"],
};
for (const [group, codes] of Object.entries(excelGroups)) {
  const ourCodes = GROUPS[group].map(t => t.code);
  for (const code of codes) {
    assert(ourCodes.includes(code), `Group ${group}: ${code} present`);
  }
}

console.log("--- 10. Complete bracket path from Excel ---");
// Verify the complete path: QF-1 gets winner of R16 that gets winners of R32-2 and R32-5
// Excel: M89(W74 v W77) → this feeds into QF
// Q97 = W89 v W90
assert(byFifa[97]?.homeFrom === byFifa[89]?.id, "QF97 home = W89");
assert(byFifa[97]?.awayFrom === byFifa[90]?.id, "QF97 away = W90");
// S101 = W97 v W98
assert(byFifa[101]?.homeFrom === byFifa[97]?.id, "SF101 home = W97");
assert(byFifa[101]?.awayFrom === byFifa[98]?.id, "SF101 away = W98");
// F104 = W101 v W102
assert(byFifa[104]?.homeFrom === byFifa[101]?.id, "F104 home = W101");
assert(byFifa[104]?.awayFrom === byFifa[102]?.id, "F104 away = W102");

console.log(`\n=== EXCEL CROSS-VALIDATION: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
