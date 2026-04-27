// Cross-validation: Our JS bracket vs independent Python implementation
// Both implement FIFA rules from scratch. Must match 100%.
import { execSync } from 'child_process';
import { groupMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcGroupStandings, calcBracketTeams } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== PYTHON CROSS-VALIDATION (100 trials) ===\n");

const N = 100;
let totalR32 = 0, matchR32 = 0, mismatchR32 = 0;
let totalStandings = 0, matchStandings = 0, mismatchStandings = 0;

// Generate N trials from Python
console.log(`Generating ${N} trials from Python reference...`);
const pyOutput = execSync(
  `python3 /home/user/Beeri-World-Cup/tests/python_reference.py --batch ${N}`,
  { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }
).toString();
const pyTrials = JSON.parse(pyOutput);
console.log(`Got ${pyTrials.length} trials`);

for (const trial of pyTrials) {
  const { seed, scores, r32: pyR32 } = trial;

  // Run our JS implementation with the same scores
  const ourStandings = calcGroupStandings(scores);
  const ourBracket = calcBracketTeams(scores);

  // Compare R32 matchups
  for (const matchId of Object.keys(pyR32)) {
    const py = pyR32[matchId];
    const ours = ourBracket[matchId];
    totalR32++;
    if (ours && py.home === ours.home && py.away === ours.away) {
      matchR32++;
    } else {
      mismatchR32++;
      if (mismatchR32 <= 5) {
        console.error(`  Trial ${seed}, ${matchId}: PY=${py.home} vs ${py.away}, JS=${ours?.home} vs ${ours?.away}`);
      }
    }
  }

  // Compare group standings (position 1 and 2 per group)
  if (trial.standings) {
    for (const [group, pyStanding] of Object.entries(trial.standings)) {
      const ourGroup = ourStandings[group];
      totalStandings++;
      if (ourGroup[0].code === pyStanding[0].code && ourGroup[1].code === pyStanding[1].code) {
        matchStandings++;
      } else {
        mismatchStandings++;
        if (mismatchStandings <= 3) {
          console.error(`  Trial ${seed}, Group ${group}: PY=[${pyStanding.map(t=>t.code)}] JS=[${ourGroup.map(t=>t.code)}]`);
        }
      }
    }
  }
}

console.log(`\n--- Results ---`);
console.log(`  R32: ${matchR32}/${totalR32} match (${mismatchR32} mismatches)`);
console.log(`  Standings: ${matchStandings}/${totalStandings} match (${mismatchStandings} mismatches)`);

assert(mismatchR32 === 0, `R32 100% match across ${N} trials (mismatches: ${mismatchR32})`);
assert(mismatchStandings === 0, `Standings 100% match across ${N} trials (mismatches: ${mismatchStandings})`);

console.log(`\n=== PYTHON CROSS-VALIDATION: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
