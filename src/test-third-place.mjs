// Test all C(12,8)=495 combinations of qualifying third-place groups
// Verify backtracking solver finds a valid assignment for each one

const slots = [
  { matchId: 'R32-2',  thirdFrom: ['A','B','C','D','F'] },
  { matchId: 'R32-5',  thirdFrom: ['C','D','F','G','H'] },
  { matchId: 'R32-7',  thirdFrom: ['C','E','F','H','I'] },
  { matchId: 'R32-8',  thirdFrom: ['E','H','I','J','K'] },
  { matchId: 'R32-9',  thirdFrom: ['B','E','F','I','J'] },
  { matchId: 'R32-10', thirdFrom: ['A','E','H','I','J'] },
  { matchId: 'R32-13', thirdFrom: ['E','F','G','I','J'] },
  { matchId: 'R32-15', thirdFrom: ['D','E','I','J','L'] },
];

const allGroups = ['A','B','C','D','E','F','G','H','I','J','K','L'];

function solve(qualGroups) {
  const assignments = {};
  function bt(idx, assigned) {
    if (idx === slots.length) return true;
    const slot = slots[idx];
    for (const g of slot.thirdFrom) {
      if (qualGroups.includes(g) && !assigned.has(g)) {
        assigned.add(g);
        assignments[slot.matchId] = g;
        if (bt(idx + 1, assigned)) return true;
        assigned.delete(g);
        delete assignments[slot.matchId];
      }
    }
    return false;
  }
  bt(0, new Set());
  return { solved: Object.keys(assignments).length === 8, assignments };
}

// Generate all C(12,8) = 495 combinations
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

const combos = combinations(allGroups, 8);
console.log(`Total combinations: ${combos.length} (expected: 495)`);

let failures = 0;
let successes = 0;
const failedCombos = [];

for (const combo of combos) {
  const result = solve(combo);
  if (result.solved) {
    successes++;

    // Verify: each assignment uses a group from the qualifying set
    for (const [matchId, group] of Object.entries(result.assignments)) {
      if (!combo.includes(group)) {
        console.log(`ERROR: ${matchId} assigned group ${group} not in qualifying set ${combo}`);
      }
      const slot = slots.find(s => s.matchId === matchId);
      if (!slot.thirdFrom.includes(group)) {
        console.log(`ERROR: ${matchId} assigned group ${group} not in allowed set ${slot.thirdFrom}`);
      }
    }
    // Verify: all 8 assignments are unique groups
    const usedGroups = Object.values(result.assignments);
    if (new Set(usedGroups).size !== 8) {
      console.log(`ERROR: duplicate group assignment in ${combo}: ${usedGroups}`);
    }
  } else {
    failures++;
    failedCombos.push(combo);
  }
}

console.log(`\nResults:`);
console.log(`  Successes: ${successes}`);
console.log(`  Failures: ${failures}`);

if (failures > 0) {
  console.log(`\nFailed combinations:`);
  for (const c of failedCombos) {
    console.log(`  ${c.join(',')}`);
    // Show why: for each slot, which groups from combo are available
    const available = slots.map(s => ({
      matchId: s.matchId,
      options: s.thirdFrom.filter(g => c.includes(g))
    }));
    for (const a of available) {
      console.log(`    ${a.matchId}: ${a.options.join(',') || 'NONE'}`);
    }
  }
}

// ============ Edge case: all third-place teams tied ============
console.log('\n=== Edge case: What if fewer than 8 third-place teams have data? ===');
const partial = ['A','B','C','D','E','F','G']; // only 7
const partialResult = solve(partial);
console.log(`7 qualifying groups: solved=${partialResult.solved} (expected: false, graceful fail)`);

const sixGroups = ['A','B','C','D','E','F'];
const sixResult = solve(sixGroups);
console.log(`6 qualifying groups: solved=${sixResult.solved} (expected: false)`);

// ============ Verify R32 matchups make sense ============
console.log('\n=== R32 Matchup Verification ===');
// Check: no group winner plays their own group's runner-up or 3rd place in R32
const R32_MATCHES_FULL = [
  { id: 'R32-1', home: '2A', away: '2B' },
  { id: 'R32-2', home: '1E', away: '3rd', thirdFrom: ['A','B','C','D','F'] },
  { id: 'R32-3', home: '1F', away: '2C' },
  { id: 'R32-4', home: '1C', away: '2F' },
  { id: 'R32-5', home: '1I', away: '3rd', thirdFrom: ['C','D','F','G','H'] },
  { id: 'R32-6', home: '2E', away: '2I' },
  { id: 'R32-7', home: '1A', away: '3rd', thirdFrom: ['C','E','F','H','I'] },
  { id: 'R32-8', home: '1L', away: '3rd', thirdFrom: ['E','H','I','J','K'] },
  { id: 'R32-9', home: '1D', away: '3rd', thirdFrom: ['B','E','F','I','J'] },
  { id: 'R32-10', home: '1G', away: '3rd', thirdFrom: ['A','E','H','I','J'] },
  { id: 'R32-11', home: '2K', away: '2L' },
  { id: 'R32-12', home: '1H', away: '2J' },
  { id: 'R32-13', home: '1B', away: '3rd', thirdFrom: ['E','F','G','I','J'] },
  { id: 'R32-14', home: '1J', away: '2H' },
  { id: 'R32-15', home: '1K', away: '3rd', thirdFrom: ['D','E','I','J','L'] },
  { id: 'R32-16', home: '2D', away: '2G' },
];

// Check no group winner can face their own group's 3rd place
for (const m of R32_MATCHES_FULL) {
  if (m.away === '3rd' && m.thirdFrom) {
    const winnerGroup = m.home.slice(1);
    if (m.thirdFrom.includes(winnerGroup)) {
      console.log(`WARNING: ${m.id} (${m.home}) could face 3rd from own group ${winnerGroup}!`);
      console.log(`  This is a constraint issue - the winner could face their own group's third place`);
    }
  }
  // Check fixed matches: no same-group matchup
  if (m.home !== '3rd' && m.away !== '3rd') {
    const hGroup = m.home.slice(1);
    const aGroup = m.away.slice(1);
    if (hGroup === aGroup) {
      console.log(`ERROR: ${m.id} has same-group matchup: ${m.home} vs ${m.away}`);
    }
  }
}
console.log('R32 matchup check complete.');
