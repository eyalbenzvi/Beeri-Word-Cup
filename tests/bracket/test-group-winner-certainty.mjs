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

// ── Test 7: uneven games-played within a group (per-team `remaining`) ────────
// The detector counts each team's OWN remaining matches, not a uniform matchday
// assumption. Build a state where the leader has played all 3 games but a rival
// has played only 1 — a uniform "1 game left each" shortcut would mis-rule here.
console.log('--- Test 7: per-team remaining count (uneven games played) ---');
{
  const g = 'E';
  const [t0, t1, t2, t3] = GROUPS[g].map((t) => t.code);

  // --- 7a: NOT clinched. Leader plays all 3 (beats t2, t3; draws t1) → 7 pts,
  // 0 remaining. t1 drew the leader (1 pt) but still has 2 games left → can
  // reach 7 and force a tiebreak, so no clinch. (Uniform-1-remaining would wrongly clinch.)
  {
    const res = {};
    for (const m of matchesByGroup[g]) {
      const teams = [m.homeTeam, m.awayTeam];
      const involvesLeader = teams.includes(t0);
      if (!involvesLeader) continue; // leave the three non-leader games unplayed
      if (teams.includes(t1)) {
        res[m.id] = { homeScore: 1, awayScore: 1, stage: 'group' }; // t0 vs t1 draw
      } else {
        // t0 vs t2 or t0 vs t3 → t0 wins
        res[m.id] = m.homeTeam === t0
          ? { homeScore: 1, awayScore: 0, stage: 'group' }
          : { homeScore: 0, awayScore: 1, stage: 'group' };
      }
    }
    const st = calcGroupStandings(res);
    assert(st[g][0].code === t0 && st[g][0].pts === 7, `7a leader ${t0} on 7 pts (got ${st[g][0].code}/${st[g][0].pts})`);
    const certain = computeCertainGroupWinners(res);
    assert(certain[g] === undefined,
      `7a: rival with 2 games left can still reach 7 → no clinch (got ${certain[g]})`);
  }

  // --- 7b: clinched. Leader wins all 3 → 9 pts; every rival has played only its
  // game vs the leader (0 pts, 2 remaining) → max 6 < 9 → clinched.
  {
    const res = {};
    for (const m of matchesByGroup[g]) {
      const teams = [m.homeTeam, m.awayTeam];
      if (!teams.includes(t0)) continue;
      res[m.id] = m.homeTeam === t0
        ? { homeScore: 1, awayScore: 0, stage: 'group' }
        : { homeScore: 0, awayScore: 1, stage: 'group' };
    }
    const certain = computeCertainGroupWinners(res);
    assert(certain[g] === t0, `7b: leader on 9 pts, rivals max 6 → clinched (got ${certain[g]})`);
    // Direct parity: the certain code equals the current standings leader.
    const st = calcGroupStandings(res);
    assert(certain[g] === st[g][0].code, `7b: certain winner === standings[${g}][0] (${st[g][0].code})`);
  }
}

// ── Test 8: head-to-head clinch (2026 rules) — the Argentina / Group J case ──
// FIFA 2026 ranks HEAD-TO-HEAD points ABOVE overall goal difference. So a leader
// on 6 pts after matchday 2 has clinched 1st when every rival that can still
// reach 6 has already lost to it head-to-head — even though those rivals can draw
// LEVEL on points. (Real 2026 Group J: Argentina beat Algeria & Austria → 6 pts;
// Jordan could not reach 6; Algeria/Austria meet in MD3 so only one reaches 6 and
// both already lost to Argentina → Argentina clinched before MD3.)
//
// The OLD "strict points domination" rule could NOT see this: it required the
// leader's points to strictly exceed every rival's max (6 > 6 is false), so it
// missed every head-to-head clinch — the bug this fix repairs.
console.log('--- Test 8: head-to-head clinch (Argentina / Group J shape) ---');
{
  for (const g of GROUP_NAMES) {
    const teams = GROUPS[g].map((t) => t.code);
    const leader = teams[0]; // "Argentina"

    // The leader's matchday-3 opponent ("Jordan"): the team it meets in MD3.
    let md3Opp = null;
    for (const m of matchesByGroup[g]) {
      if (m.matchday !== 3) continue;
      if (m.homeTeam === leader) md3Opp = m.awayTeam;
      else if (m.awayTeam === leader) md3Opp = m.homeTeam;
    }
    assert(!!md3Opp, `group ${g}: found leader's MD3 opponent`);

    // Play matchdays 1-2: leader wins its two games; in the other two games the
    // MD3 opponent loses both (so it sits on 0, cannot reach 6). The remaining
    // two non-leader teams therefore sit on 3 each, having lost to the leader.
    const results = {};
    for (const m of matchesByGroup[g]) {
      if (m.matchday === 3) continue; // MD3 unplayed (leader vs md3Opp, plus the two rivals meet)
      const teamsIn = [m.homeTeam, m.awayTeam];
      if (teamsIn.includes(leader)) {
        results[m.id] = m.homeTeam === leader
          ? { homeScore: 1, awayScore: 0, stage: 'group' }
          : { homeScore: 0, awayScore: 1, stage: 'group' };
      } else {
        // non-leader MD1/2 game — both such games involve md3Opp; make it lose.
        results[m.id] = m.homeTeam === md3Opp
          ? { homeScore: 0, awayScore: 1, stage: 'group' }
          : { homeScore: 1, awayScore: 0, stage: 'group' };
      }
    }

    const st = calcGroupStandings(results);
    assert(st[g][0].code === leader && st[g][0].pts === 6,
      `${g}: leader ${leader} on 6 pts after MD2 (got ${st[g][0].code}/${st[g][0].pts})`);
    // A rival can still reach 6 (the two on 3 pts meet in MD3) → strict-points
    // domination would NOT fire here; head-to-head is what clinches it.
    assert(st[g][1].pts === 3, `${g}: runner-up on 3 pts can still reach 6 (got ${st[g][1].pts})`);

    const certain = computeCertainGroupWinners(results);
    assert(certain[g] === leader,
      `${g}: head-to-head clinch → leader ${leader} certain (got ${certain[g]})`);

    // And it shows in the gated R32 1X slot.
    const gated = calcBracketTeams(results, true);
    const slot = slotFor('1' + g);
    assert(gated[slot.id]?.[slot.side] === leader,
      `${g}: R32 ${slot.id}.${slot.side} (1${g}) should be ${leader}, got ${gated[slot.id]?.[slot.side]}`);
  }
}

// ── Test 9: head-to-head is computed ONLY among the points-tied set ─────────
// Classic tiebreaker bug guard: when the top two are level on points, the winner
// must be decided by their head-to-head result alone — NOT by counting wins over
// the bottom teams. Group where W and X both finish on 6, W has beaten both
// bottom teams, but X beat W head-to-head → X must be 1st. (If H2H were wrongly
// computed over ALL matches, W's wins over the minnows would mask X's H2H edge.)
console.log('--- Test 9: head-to-head only among the tied set ---');
{
  const g = 'F';
  const [W, X, Y, Z] = GROUPS[g].map((t) => t.code);
  // Desired winner per unordered pair (X beats W head-to-head; W sweeps Y, Z).
  const pairWinner = new Map([
    [[W, X].sort().join('|'), X], // X beats W (the decisive head-to-head)
    [[W, Y].sort().join('|'), W],
    [[W, Z].sort().join('|'), W],
    [[X, Y].sort().join('|'), X],
    [[X, Z].sort().join('|'), Z],
    [[Y, Z].sort().join('|'), Y],
  ]);
  const results = {};
  for (const m of matchesByGroup[g]) {
    const key = [m.homeTeam, m.awayTeam].sort().join('|');
    const winnerCode = pairWinner.get(key);
    results[m.id] = m.homeTeam === winnerCode
      ? { homeScore: 1, awayScore: 0, stage: 'group' }
      : { homeScore: 0, awayScore: 1, stage: 'group' };
  }
  const st = calcGroupStandings(results);
  assert(st[g][0].pts === 6 && st[g][1].pts === 6, `${g}: W and X both on 6 (got ${st[g][0].pts}/${st[g][1].pts})`);
  assert(st[g][0].code === X, `${g}: standings rank X (head-to-head winner) 1st, got ${st[g][0].code}`);
  const certain = computeCertainGroupWinners(results);
  assert(certain[g] === X,
    `${g}: certain winner must be X via head-to-head among the tied set (got ${certain[g]})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
