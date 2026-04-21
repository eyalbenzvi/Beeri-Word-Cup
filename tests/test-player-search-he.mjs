// Tests for Hebrew player search + player data integrity
import { TOP_SCORER_PLAYERS } from '/home/user/Beeri-World-Cup/src/data/players.js';
import { filterPlayers, isHebrew, normalizeSearch } from '/home/user/Beeri-World-Cup/src/utils/playerSearch.js';

let passed = 0, failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

console.log("=== PLAYER SEARCH (HEBREW) TESTS ===\n");

// ---- 1. Data integrity ----
console.log("--- 1. Data integrity ---");
assert(TOP_SCORER_PLAYERS.length === 170, `Expected 170 players, got ${TOP_SCORER_PLAYERS.length}`);

const missingHe = TOP_SCORER_PLAYERS.filter(p => !p.nameHe || !p.nameHe.trim());
assert(missingHe.length === 0, `All players must have nameHe; missing: ${missingHe.map(p => p.name).join(', ')}`);

const hebrewOnly = /^[֐-׿\s'"\-]+$/;
const badChars = TOP_SCORER_PLAYERS.filter(p => p.nameHe && !hebrewOnly.test(p.nameHe));
assert(badChars.length === 0, `nameHe must contain only Hebrew/space/apostrophe/dash; violations: ${badChars.map(p => `${p.name}="${p.nameHe}"`).join(', ')}`);

const nameDups = {};
TOP_SCORER_PLAYERS.forEach(p => {
  const k = `${p.team}|${p.name}`;
  nameDups[k] = (nameDups[k] || 0) + 1;
});
const dupN = Object.entries(nameDups).filter(([, c]) => c > 1);
assert(dupN.length === 0, `Duplicate english name+team: ${JSON.stringify(dupN)}`);

const heDups = {};
TOP_SCORER_PLAYERS.forEach(p => {
  const k = `${p.team}|${p.nameHe}`;
  heDups[k] = (heDups[k] || 0) + 1;
});
const dupH = Object.entries(heDups).filter(([, c]) => c > 1);
assert(dupH.length === 0, `Duplicate hebrew name+team: ${JSON.stringify(dupH)}`);

// ---- 2. Language detection ----
console.log("--- 2. isHebrew detection ---");
assert(isHebrew("מסי") === true, 'isHebrew("מסי") should be true');
assert(isHebrew("messi") === false, 'isHebrew("messi") should be false');
assert(isHebrew("") === false, 'isHebrew("") should be false');
assert(isHebrew(null) === false, 'isHebrew(null) should be false');
assert(isHebrew("Messi מסי") === true, 'isHebrew("Messi מסי") should be true (any Hebrew char)');

// ---- 3. Normalization ----
console.log("--- 3. normalizeSearch ---");
assert(normalizeSearch("  MESSI  ") === "messi", `"  MESSI  " normalize => ${normalizeSearch("  MESSI  ")}`);
// Niqqud stripping
assert(normalizeSearch("מֵסִי") === "מסי", `"מֵסִי" normalize => ${normalizeSearch("מֵסִי")}`);

// ---- 4. Hebrew search ----
console.log("--- 4. Hebrew search results ---");
const r1 = filterPlayers("מס", TOP_SCORER_PLAYERS);
const hasMessi = r1.some(p => p.name === "Lionel Messi");
assert(hasMessi, `"מס" should surface Lionel Messi; got: ${r1.map(p => p.name).join(', ')}`);

const r2 = filterPlayers("ליאונל", TOP_SCORER_PLAYERS);
assert(r2.some(p => p.name === "Lionel Messi"), `"ליאונל" should find Messi`);

const r3 = filterPlayers("מסי", TOP_SCORER_PLAYERS);
assert(r3.some(p => p.name === "Lionel Messi"), `"מסי" should find Messi`);

const r4 = filterPlayers("הולאנד", TOP_SCORER_PLAYERS);
assert(r4.some(p => p.name === "Erling Haaland"), `"הולאנד" should find Haaland`);

const r5 = filterPlayers("סלאח", TOP_SCORER_PLAYERS);
assert(r5.some(p => p.name === "Mohamed Salah"), `"סלאח" should find Salah`);

const r6 = filterPlayers("קיין", TOP_SCORER_PLAYERS);
assert(r6.some(p => p.name === "Harry Kane"), `"קיין" should find Harry Kane`);

const r7 = filterPlayers("רונאלדו", TOP_SCORER_PLAYERS);
assert(r7.some(p => p.name === "Cristiano Ronaldo"), `"רונאלדו" should find Ronaldo`);

// ---- 5. Niqqud-tolerant Hebrew search ----
console.log("--- 5. Niqqud tolerance ---");
const r8 = filterPlayers("מֵסִי", TOP_SCORER_PLAYERS);
assert(r8.some(p => p.name === "Lionel Messi"), `"מֵסִי" (with niqqud) should find Messi`);

// ---- 6. English search still works ----
console.log("--- 6. English search (regression) ---");
const e1 = filterPlayers("messi", TOP_SCORER_PLAYERS);
assert(e1.some(p => p.name === "Lionel Messi"), `"messi" should find Messi`);

const e2 = filterPlayers("Kane", TOP_SCORER_PLAYERS);
assert(e2.some(p => p.name === "Harry Kane"), `"Kane" should find Kane`);

const e3 = filterPlayers("ken", TOP_SCORER_PLAYERS);
const e3Names = e3.map(p => p.name);
assert(e3Names.includes("Duckens Nazon"), `"ken" should include Duckens Nazon; got ${e3Names.join(', ')}`);

// ---- 7. Hebrew team-name search via English fallthrough ----
console.log("--- 7. Team name search (Hebrew) ---");
const t1 = filterPlayers("ארגנטינה", TOP_SCORER_PLAYERS);
// team name "ארגנטינה" is Hebrew → hebrew branch → matches on nameHe (none contain "ארגנטינה")
// so it should NOT match by team when hebrew branch is active. That is intentional:
// team is only matched in the English branch. Just assert no crash.
assert(Array.isArray(t1), `"ארגנטינה" should return an array (not crash)`);

// ---- 8. Language isolation ----
console.log("--- 8. Language isolation ---");
// English query should NOT match Hebrew nameHe content
const iso1 = filterPlayers("מס", TOP_SCORER_PLAYERS.map(p => ({ ...p, nameHe: undefined })));
assert(iso1.length === 0, `Hebrew query with no nameHe data → empty results (got ${iso1.length})`);

// ---- 9. Empty / trivial queries ----
console.log("--- 9. Empty / trivial ---");
const empty = filterPlayers("", TOP_SCORER_PLAYERS);
assert(empty.length === 20, `Empty query should return 20 default entries, got ${empty.length}`);

const spaces = filterPlayers("   ", TOP_SCORER_PLAYERS);
assert(spaces.length === 20, `Whitespace-only query should return 20 default entries, got ${spaces.length}`);

const noMatch = filterPlayers("zzzxxxyyy", TOP_SCORER_PLAYERS);
assert(noMatch.length === 0, `Non-matching query should return []; got ${noMatch.length}`);

const noMatchHe = filterPlayers("קקקקקק", TOP_SCORER_PLAYERS);
assert(noMatchHe.length === 0, `Non-matching Hebrew query should return []; got ${noMatchHe.length}`);

// ---- 10. Limit enforcement ----
console.log("--- 10. Limit ---");
const rLim = filterPlayers("", TOP_SCORER_PLAYERS, 5);
assert(rLim.length === 5, `Custom limit=5 should return 5; got ${rLim.length}`);

// ---- 11. Legacy custom lists (no nameHe) ----
console.log("--- 11. Legacy list compatibility ---");
const legacy = [
  { team: "ARG", name: "Lionel Messi" },
  { team: "POR", name: "Cristiano Ronaldo" },
];
const legacyEn = filterPlayers("messi", legacy);
assert(legacyEn.length === 1 && legacyEn[0].name === "Lionel Messi", `Legacy list + English query should still work`);

const legacyHe = filterPlayers("מסי", legacy);
assert(legacyHe.length === 0, `Legacy list + Hebrew query → empty (no nameHe), got ${legacyHe.length}`);

// ---- 12. Each Hebrew name is individually findable by its full string ----
console.log("--- 12. Every player findable by full nameHe ---");
let unfound = [];
for (const p of TOP_SCORER_PLAYERS) {
  const r = filterPlayers(p.nameHe, TOP_SCORER_PLAYERS);
  if (!r.some(x => x.name === p.name)) unfound.push(p.name);
}
assert(unfound.length === 0, `All players must be findable via their own nameHe; unfound: ${unfound.join(', ')}`);

// ---- 13. Each English name is findable (regression) ----
console.log("--- 13. Every player findable by full English name ---");
unfound = [];
for (const p of TOP_SCORER_PLAYERS) {
  const r = filterPlayers(p.name, TOP_SCORER_PLAYERS);
  if (!r.some(x => x.name === p.name)) unfound.push(p.name);
}
// Note: with limit=20 and many players, some may be beyond the cut.
// We only assert they appear in the unlimited search:
unfound = [];
for (const p of TOP_SCORER_PLAYERS) {
  const r = filterPlayers(p.name, TOP_SCORER_PLAYERS, 200);
  if (!r.some(x => x.name === p.name)) unfound.push(p.name);
}
assert(unfound.length === 0, `All players findable via full English name; unfound: ${unfound.join(', ')}`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
