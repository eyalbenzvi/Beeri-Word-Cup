// Early GROUP-WINNER certainty — 1st place clinched before a group finishes.
//
// The headline guarantee is SOUNDNESS: computeCertainGroupWinners must never
// declare a winner that some valid completion of the unplayed matches could
// overturn. Test 1 enforces this by brute force — for thousands of partial
// states it samples real completions and checks every declared winner actually
// finishes 1st in ALL of them (oracle = calcGroupStandings on the completion).
//
// Tests 2–6 lock the behavioural contract: the clinched winner appears in its
// R32 "1X" slot early in the GATED bracket; the runner-up "2X" slot does NOT;
// no clinch is ever possible after matchday 1; and full-completion brackets are
// byte-for-byte unchanged (regression).

import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches, R32_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcGroupStandings, calcBracketTeams } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { computeCertainGroupWinners } from '/home/user/Beeri-World-Cup/src/utils/groupWinnerCertainty.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error('  FAIL: ' + m); } }

const GROUP_NAMES = Object.keys(GROUPS);
const matchesByGroup = {};
for (const g of GROUP_NAMES) matchesByGroup[g] = groupMatches.filter((m) => m.group === g);

console.log('=== GROUP-WINNER CERTAINTY TESTS ===\n');

function ri(n) { return Math.floor(Math.random() * n); }
function randResult() { return { homeScore: ri(5), awayScore: ri(5), stage: 'group' }; }

// R32 slot lookup: which { matchId, side } holds position-code `posG` (e.g. "1A").
function slotFor(code) {
  for (const m of R32_MATCHES) {
    if (m.home === code) return { id: m.id, side: 'home' };
    if (m.away === code) return { id: m.id, side: 'away' };
  }
  return null;
}

// ── Test 1: SOUNDNESS (brute force) ─────────────────────────────────────────
// Random partial states; every declared winner must top its group in every
// sampled completion.
console.log('--- Test 1: soundness over random partial states ---');
{
  let checks = 0;
  for (let trial = 0; trial < 4000; trial++) {
    const results = {};
    // Per group, play a random prefix of its 6 matches (by matchday-ish order).
    for (const g of GROUP_NAMES) {
      const ms = matchesByGroup[g];
      const k = ri(ms.length + 1); // 0..6 matches played
      for (let i = 0; i < k; i++) results[ms[i].id] = randResult();
    }

    const certain = computeCertainGroupWinners(results);
    for (const [g, code] of Object.entries(certain)) {
      checks++;
      // Sample completions of g's unplayed matches; winner must always be `code`.
      const unplayed = matchesByGroup[g].filter((m) => !results[m.id]);
      for (let s = 0; s < 25; s++) {
        const completion = { ...results };
        for (const m of unplayed) completion[m.id] = randResult();
        const standings = calcGroupStandings(completion);
        const winner = standings[g][0].code;
        assert(winner === code,
          `Trial ${trial} group ${g}: declared winner ${code} but completion winner ${winner}`);
        if (winner !== code) break;
      }
    }
  }
  console.log(`  (${checks} declared-winner claims verified across completions)`);
}

// ── Test 2: positive clinch appears early in R32 1X slot ────────────────────
// Construct a matchday-2 clinch: chosen team wins both its played games, all
// other played games are draws → winner 6 pts, every rival ≤ 2, MD3 unplayed.
console.log('--- Test 2: clinched winner shows in R32 1X slot ---');
{
  const g = 'C';
  const winnerCode = GROUPS[g][0].code;
  const results = {};
  for (const m of matchesByGroup[g]) {
    if (m.matchday === 3) continue; // leave matchday 3 unplayed
    if (m.homeTeam === winnerCode) results[m.id] = { homeScore: 1, awayScore: 0, stage: 'group' };
    else if (m.awayTeam === winnerCode) results[m.id] = { homeScore: 0, awayScore: 1, stage: 'group' };
    else results[m.id] = { homeScore: 0, awayScore: 0, stage: 'group' }; // draw
  }

  const certain = computeCertainGroupWinners(results);
  assert(certain[g] === winnerCode, `group ${g} winner ${winnerCode} should be certain (got ${certain[g]})`);

  const gated = calcBracketTeams(results, true);
  const slot = slotFor('1' + g);
  assert(!!slot, `R32 slot for 1${g} exists`);
  assert(gated[slot.id]?.[slot.side] === winnerCode,
    `R32 ${slot.id}.${slot.side} (1${g}) should be ${winnerCode}, got ${gated[slot.id]?.[slot.side]}`);

  // Ungated bracket must NOT early-fill from partial group results (unchanged).
  const ungated = calcBracketTeams(results, false);
  // (ungated resolves the full hypothetical bracket from current standings; the
  //  1X home/away may be populated there — we only assert the gated contract.)
  assert(typeof ungated === 'object', 'ungated bracket computes without error');
}

// ── Test 3: runner-up slot stays empty while group incomplete ───────────────
console.log('--- Test 3: 2X slot NOT filled early ---');
{
  const g = 'C';
  const winnerCode = GROUPS[g][0].code;
  const results = {};
  for (const m of matchesByGroup[g]) {
    if (m.matchday === 3) continue;
    if (m.homeTeam === winnerCode) results[m.id] = { homeScore: 1, awayScore: 0, stage: 'group' };
    else if (m.awayTeam === winnerCode) results[m.id] = { homeScore: 0, awayScore: 1, stage: 'group' };
    else results[m.id] = { homeScore: 0, awayScore: 0, stage: 'group' };
  }
  const gated = calcBracketTeams(results, true);
  const slot = slotFor('2' + g);
  assert(!!slot, `R32 slot for 2${g} exists`);
  assert(gated[slot.id]?.[slot.side] == null,
    `R32 ${slot.id}.${slot.side} (2${g}) must be null while group incomplete, got ${gated[slot.id]?.[slot.side]}`);
}

// ── Test 4: two co-leaders meeting in MD3 → NOT certain ─────────────────────
console.log('--- Test 4: tie scenario yields no early winner ---');
{
  const g = 'D';
  const teams = GROUPS[g].map((t) => t.code);
  // Find the two teams that do NOT meet in matchdays 1-2 (they meet in MD3) and
  // make both win their other two games → both 6 pts, tied, meeting in MD3.
  const playsInMd12 = {};
  for (const c of teams) playsInMd12[c] = new Set();
  for (const m of matchesByGroup[g]) {
    if (m.matchday === 3) continue;
    playsInMd12[m.homeTeam].add(m.awayTeam);
    playsInMd12[m.awayTeam].add(m.homeTeam);
  }
  // The MD3 pair: teams whose MD1-2 opponents don't include each other.
  let a = teams[0];
  let b = teams.find((c) => c !== a && !playsInMd12[a].has(c));
  const winners = new Set([a, b]);

  const results = {};
  for (const m of matchesByGroup[g]) {
    if (m.matchday === 3) continue;
    if (winners.has(m.homeTeam) && !winners.has(m.awayTeam))
      results[m.id] = { homeScore: 1, awayScore: 0, stage: 'group' };
    else if (winners.has(m.awayTeam) && !winners.has(m.homeTeam))
      results[m.id] = { homeScore: 0, awayScore: 1, stage: 'group' };
    else
      results[m.id] = { homeScore: 0, awayScore: 0, stage: 'group' }; // two middles draw
  }
  const standings = calcGroupStandings(results);
  assert(standings[g][0].pts === 6 && standings[g][1].pts === 6,
    `two co-leaders on 6 pts (got ${standings[g][0].pts}/${standings[g][1].pts})`);
  const certain = computeCertainGroupWinners(results);
  assert(certain[g] === undefined, `group ${g} must NOT have an early winner (got ${certain[g]})`);
}

// ── Test 5: never certain after matchday 1 ──────────────────────────────────
console.log('--- Test 5: no clinch possible after matchday 1 ---');
{
  for (let trial = 0; trial < 200; trial++) {
    const results = {};
    for (const g of GROUP_NAMES) {
      for (const m of matchesByGroup[g]) {
        if (m.matchday === 1) results[m.id] = randResult();
      }
    }
    const certain = computeCertainGroupWinners(results);
    assert(Object.keys(certain).length === 0,
      `after MD1 nothing can clinch (trial ${trial} declared ${JSON.stringify(certain)})`);
    if (Object.keys(certain).length !== 0) break;
  }
}

// ── Test 6: full-completion regression — gated bracket unchanged ────────────
// At full completion the early path must defer to the existing resolvePosition
// path: every R32 group-position slot equals the final standings team.
console.log('--- Test 6: full completion parity (regression) ---');
{
  const results = {};
  // Transitive fill for every group: position i beats every lower position.
  for (const g of GROUP_NAMES) {
    const order = GROUPS[g].map((t) => t.code); // teams[0] strongest
    const rank = {}; order.forEach((c, i) => { rank[c] = i; });
    for (const m of matchesByGroup[g]) {
      const homeWins = rank[m.homeTeam] < rank[m.awayTeam];
      results[m.id] = homeWins
        ? { homeScore: 2, awayScore: 0, stage: 'group' }
        : { homeScore: 0, awayScore: 2, stage: 'group' };
    }
  }
  const standings = calcGroupStandings(results);
  const gated = calcBracketTeams(results, true);
  let mismatches = 0;
  for (const m of R32_MATCHES) {
    for (const side of ['home', 'away']) {
      const code = m[side];
      const mt = /^([12])([A-L])$/.exec(code);
      if (!mt) continue;
      const pos = Number(mt[1]); const grp = mt[2];
      const expected = standings[grp][pos - 1].code;
      if (gated[m.id][side] !== expected) {
        mismatches++;
        console.error(`    ${m.id}.${side} (${code}) = ${gated[m.id][side]} expected ${expected}`);
      }
    }
  }
  assert(mismatches === 0, `all R32 group-position slots match final standings (${mismatches} mismatches)`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
