// Tests that top-scorer bonus awards points regardless of En/He storage language.
import { calculateFullScore, BONUSES } from '/home/user/Beeri-World-Cup/src/utils/scoring.js';

let passed = 0, failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

console.log("=== SCORING (HEBREW/ENGLISH TOPSCORER) TESTS ===\n");

function scoreFor(guess, actualArr) {
  return calculateFullScore(
    { matches: {}, topScorer: guess, champion: null },
    {},
    {},
    { champion: null, topScorers: actualArr },
    {},
    {},
  );
}

// 1. Legacy user (English) + admin entered Hebrew → bonus awarded
const s1 = scoreFor("Lionel Messi", ["ליאונל מסי"]);
assert(s1.correctTopScorer === true, `En guess + He actual → awarded; got ${JSON.stringify(s1)}`);
assert(s1.totalPoints === BONUSES.topScorer, `Points match BONUSES.topScorer`);

// 2. New user (Hebrew) + admin entered English → bonus awarded
const s2 = scoreFor("ליאונל מסי", ["Lionel Messi"]);
assert(s2.correctTopScorer === true, `He guess + En actual → awarded`);

// 3. Same language (Hebrew) → awarded
const s3 = scoreFor("ליאונל מסי", ["ליאונל מסי"]);
assert(s3.correctTopScorer === true, `He = He → awarded`);

// 4. Same language (English, baseline) → awarded
const s4 = scoreFor("Lionel Messi", ["Lionel Messi"]);
assert(s4.correctTopScorer === true, `En = En → awarded`);

// 5. Wrong player → zero bonus
const s5 = scoreFor("ליאונל מסי", ["Cristiano Ronaldo"]);
assert(s5.correctTopScorer === false, `He Messi vs En Ronaldo → not awarded`);
assert(s5.totalPoints === 0, `Zero points`);

// 6. Wrong player cross-lang → zero bonus
const s6 = scoreFor("Lionel Messi", ["ארלינג הולאנד"]);
assert(s6.correctTopScorer === false, `En Messi vs He Haaland → not awarded`);

// 7. Multiple top scorers → hit on one matches
const s7 = scoreFor("Lionel Messi", ["ארלינג הולאנד", "ליאונל מסי"]);
assert(s7.correctTopScorer === true, `Matches any of multiple actuals`);

// 8. Empty guess → zero
const s8 = scoreFor("", ["ליאונל מסי"]);
assert(s8.correctTopScorer === false, `Empty guess → not awarded`);

// 9. Empty actual → zero
const s9 = scoreFor("ליאונל מסי", []);
assert(s9.correctTopScorer === false, `Empty actual → not awarded`);

// 10. Unknown player string-equal → awarded (fallback)
const s10 = scoreFor("Some Rookie", ["Some Rookie"]);
assert(s10.correctTopScorer === true, `Unknown name exact match → awarded`);

// 11. Unknown players not matching → zero
const s11 = scoreFor("Some Rookie", ["Another Rookie"]);
assert(s11.correctTopScorer === false, `Unknown names different → not awarded`);

// 12. Case / whitespace differences on English (legacy normalization)
const s12 = scoreFor("  lionel messi  ", ["Lionel Messi"]);
assert(s12.correctTopScorer === true, `En whitespace/case insensitive → awarded`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
