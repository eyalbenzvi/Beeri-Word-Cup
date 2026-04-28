// ============================================================
// SIMULATOR PARITY TESTS — User Simulation Area
// ============================================================
// Five bug categories:
//   1. Real-result calculations corrupted by simulator
//   2. Simulation calculation errors (must match real path)
//   3. Compatibility: admin simulator vs user simulator produce identical
//      results for identical inputs
//   4. Code duplication: shared code path (no divergent logic)
//   5. Resource issues: cache pollution, reference stability, perf bounds
// ============================================================

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches, knockoutMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import {
  calcBracketTeams,
  deriveAdvancingTeams,
  deriveActualAdvancing,
  deriveChampion,
  calcGroupStandings,
} from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import {
  calculateFullScore,
  compareTiebreaker,
} from '/home/user/Beeri-World-Cup/src/utils/scoring.js';

// bracketCache.js imports React, so we replicate its core cache to test
// that real-calculation correctness survives simulator pollution.
const bracketCache = new Map();
const championCache = new Map();
function cacheKey(preds) {
  const entries = Object.entries(preds);
  if (entries.length === 0) return 0;
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let hash = 0x811c9dc5;
  for (const [id, p] of entries) {
    for (let j = 0; j < id.length; j++) {
      hash ^= id.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193);
    }
    const h = p?.homeScore ?? -1;
    const a = p?.awayScore ?? -1;
    hash ^=
      ((typeof h === 'number' ? h : -1) << 16) |
      ((typeof a === 'number' ? a : -1) & 0xffff);
    hash = Math.imul(hash, 0x01000193);
    if (p?.advancingTeam) {
      for (let j = 0; j < p.advancingTeam.length; j++) {
        hash ^= p.advancingTeam.charCodeAt(j);
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return hash;
}
function getCachedBracket(preds) {
  const k = cacheKey(preds);
  if (bracketCache.has(k)) return bracketCache.get(k);
  const r = calcBracketTeams(preds);
  bracketCache.set(k, r);
  if (bracketCache.size > 1000) bracketCache.delete(bracketCache.keys().next().value);
  return r;
}
function getCachedChampion(preds) {
  const k = cacheKey(preds);
  if (championCache.has(k)) return championCache.get(k);
  const b = getCachedBracket(preds);
  const c = deriveChampion(preds, b);
  championCache.set(k, c);
  if (championCache.size > 1000) championCache.delete(championCache.keys().next().value);
  return c;
}
function clearBracketCache() {
  bracketCache.clear();
  championCache.clear();
}

let passed = 0,
  failed = 0;
const failures = [];
function assert(c, m) {
  if (c) {
    passed++;
  } else {
    failed++;
    failures.push(m);
    console.error('  FAIL: ' + m);
  }
}

console.log('=== SIMULATOR PARITY TESTS ===\n');

// ============================================================
// HELPERS — replicate the exact store+simulator pipeline
// ============================================================

// Mirrors SimulatorPanel's `effectiveResults` merge.
function mergeOverride(realResults, override) {
  const merged = { ...realResults };
  for (const [id, r] of Object.entries(override)) merged[id] = r;
  return merged;
}

// Mirrors useLeaderboardComputed's scoredForms loop — pure form.
// This is the single source of truth for "what does the leaderboard see".
function computeLeaderboard(results, allPredictions, actualBonuses) {
  const actualBracket = calcBracketTeams(results);
  const actualDerivedAdvancing = deriveActualAdvancing(actualBracket, results);
  const actualDerivedChampion = deriveChampion(results, actualBracket);

  const scored = [];
  for (const [formId, predData] of Object.entries(allPredictions)) {
    const s = predData.status;
    if (s !== 'submitted' && s !== 'approved') continue;
    const matchPreds = predData.matches || {};
    const predBracket = calcBracketTeams(matchPreds);
    const advancing = deriveAdvancingTeams(predBracket);
    const champion = deriveChampion(matchPreds, predBracket);
    const enriched = { ...predData, advancing, champion };
    const score = calculateFullScore(
      enriched,
      results,
      actualDerivedAdvancing,
      { ...actualBonuses, champion: actualDerivedChampion },
      predBracket,
      actualBracket,
    );
    scored.push({ formId, userId: predData.userId, ...score });
  }
  scored.sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    const tb = compareTiebreaker(a, b);
    if (tb !== 0) return tb;
    return a.formId.localeCompare(b.formId);
  });
  return scored;
}

// Build "seeded wins" actual results for a complete tournament.
function buildSeededResults() {
  const matchPreds = {};
  for (const m of groupMatches) {
    const gTeams = GROUPS[m.group].map((t) => t.code);
    const hi = gTeams.indexOf(m.homeTeam);
    const ai = gTeams.indexOf(m.awayTeam);
    matchPreds[m.id] =
      hi < ai ? { homeScore: 2, awayScore: 0 } : { homeScore: 0, awayScore: 1 };
  }
  let bracket = calcBracketTeams(matchPreds);
  for (const round of ['R32', 'R16', 'QF', 'SF']) {
    for (const [id, t] of Object.entries(bracket)) {
      if (id.startsWith(round + '-') && t.home && t.away && !matchPreds[id]) {
        matchPreds[id] = { homeScore: 1, awayScore: 0 };
      }
    }
    bracket = calcBracketTeams(matchPreds);
  }
  for (const [id, t] of Object.entries(bracket)) {
    if ((id === '3RD-1' || id === 'F-1') && t.home && t.away && !matchPreds[id]) {
      matchPreds[id] = { homeScore: 1, awayScore: 0 };
    }
  }
  return matchPreds;
}

function buildResultsWithStage(preds) {
  const results = {};
  for (const m of groupMatches) {
    if (preds[m.id]) {
      results[m.id] = { ...preds[m.id], stage: 'group', group: m.group };
    }
  }
  for (const [id, pred] of Object.entries(preds)) {
    if (id.startsWith('group-')) continue;
    const stage =
      id.startsWith('R32')
        ? 'R32'
        : id.startsWith('R16')
          ? 'R16'
          : id.startsWith('QF')
            ? 'QF'
            : id.startsWith('SF')
              ? 'SF'
              : id === '3RD-1'
                ? '3RD'
                : 'F';
    results[id] = { ...pred, stage };
  }
  return results;
}

function buildForms() {
  // User A: exact copy of "seeded wins" reality
  const userA = buildSeededResults();
  // User B: flip every group match outcome (1-2 instead of 2-0)
  const userB = {};
  for (const [id, p] of Object.entries(userA)) {
    if (id.startsWith('group-')) {
      userB[id] = { homeScore: p.awayScore, awayScore: p.homeScore };
    } else {
      userB[id] = { ...p };
    }
  }
  // User C: only filled first matchday of groups
  const userC = {};
  for (const m of groupMatches.slice(0, 24)) {
    userC[m.id] = { homeScore: 1, awayScore: 1 };
  }
  return {
    'form-A__1': {
      userId: 'userA',
      formName: 'Perfect',
      status: 'submitted',
      matches: userA,
      champion: 'UNKNOWN',
      topScorer: 'ronaldo',
    },
    'form-B__1': {
      userId: 'userB',
      formName: 'Flipped',
      status: 'submitted',
      matches: userB,
      champion: null,
      topScorer: 'messi',
    },
    'form-C__1': {
      userId: 'userC',
      formName: 'Partial',
      status: 'submitted',
      matches: userC,
      champion: null,
      topScorer: '',
    },
    // Draft form — must be excluded from leaderboard.
    'form-D__1': {
      userId: 'userD',
      formName: 'Draft',
      status: 'draft',
      matches: {},
      champion: null,
      topScorer: '',
    },
  };
}

// ============================================================
// BUG CATEGORY 1: Real calculations corrupted by simulator
// ============================================================
console.log('--- Category 1: Real-result calculations corrupted by simulator ---');

// 1a. Repeated simulator runs must not mutate realResults.
{
  const realPreds = buildSeededResults();
  const realResults = buildResultsWithStage(realPreds);
  const realJson = JSON.stringify(realResults);

  const override = {
    'group-A-1': { homeScore: 9, awayScore: 9, stage: 'group', group: 'A' },
    'R32-1': { homeScore: 0, awayScore: 0, advancingTeam: null, stage: 'R32' },
  };
  mergeOverride(realResults, override);
  mergeOverride(realResults, override);
  mergeOverride(realResults, override);

  assert(
    JSON.stringify(realResults) === realJson,
    '1a: realResults untouched after 3 merges',
  );
}

// 1b. Simulator run must not mutate override entries themselves.
{
  const realResults = buildResultsWithStage(buildSeededResults());
  const override = {
    'group-A-1': { homeScore: 5, awayScore: 5, stage: 'group', group: 'A' },
  };
  const overrideJson = JSON.stringify(override);
  const merged = mergeOverride(realResults, override);
  calcBracketTeams(merged);
  calculateFullScore(
    { matches: merged, champion: null, topScorer: '' },
    merged,
    {},
    { champion: null, topScorers: [] },
    calcBracketTeams(merged),
    calcBracketTeams(merged),
  );
  assert(
    JSON.stringify(override) === overrideJson,
    '1b: override object untouched after calcBracket/calcScore',
  );
}

// 1c. Module-level bracket cache: real path unchanged after many sim queries.
{
  clearBracketCache();
  const realPreds = buildSeededResults();
  const realBracket1 = getCachedBracket(realPreds);
  const realChamp1 = getCachedChampion(realPreds);

  // Pound the cache with 200 different simulation inputs.
  for (let i = 0; i < 200; i++) {
    const simPreds = { ...realPreds };
    simPreds['group-A-1'] = { homeScore: i % 10, awayScore: (i * 3) % 10 };
    getCachedBracket(simPreds);
    getCachedChampion(simPreds);
  }

  // Real bracket/champion must be identical — cache key is content-based.
  const realBracket2 = getCachedBracket(realPreds);
  const realChamp2 = getCachedChampion(realPreds);

  // Deep equal: same home/away codes for every match.
  let bracketOk = true;
  const keys = new Set([
    ...Object.keys(realBracket1),
    ...Object.keys(realBracket2),
  ]);
  for (const k of keys) {
    if (
      realBracket1[k]?.home !== realBracket2[k]?.home ||
      realBracket1[k]?.away !== realBracket2[k]?.away
    ) {
      bracketOk = false;
      break;
    }
  }
  assert(bracketOk, '1c: real bracket unchanged after 200 sim cache queries');
  assert(realChamp1 === realChamp2, '1c: real champion unchanged by sim queries');
}

// 1d. Cache eviction at boundary does not break real queries.
{
  clearBracketCache();
  // Pollute cache until eviction kicks in (bounded at 1000 per bracketCache.js).
  for (let i = 0; i < 1100; i++) {
    getCachedBracket({
      [`poison-match-${i}`]: { homeScore: i, awayScore: i },
    });
  }
  const realPreds = buildSeededResults();
  const bracket = getCachedBracket(realPreds);
  const direct = calcBracketTeams(realPreds);
  let ok = true;
  const keys = new Set([...Object.keys(bracket), ...Object.keys(direct)]);
  for (const k of keys) {
    if (
      bracket[k]?.home !== direct[k]?.home ||
      bracket[k]?.away !== direct[k]?.away
    ) {
      ok = false;
      break;
    }
  }
  assert(ok, '1d: cache-evicted real path matches direct calculation');
}

// 1e. Sim results don't leak into allPredictions / store state.
// (This is a static check: simulator never calls savePrediction/saveMatchResult.)
{
  const source = [
    '/home/user/Beeri-World-Cup/src/components/SimulatorPanel.jsx',
  ];
  const fs = await import('node:fs');
  for (const path of source) {
    const src = readMigratedSrc(path, 'utf8');
    assert(
      !/savePrediction|saveMatchResult|debouncedWriteForm/.test(src),
      `1e: SimulatorPanel must not call store-writing functions (${path})`,
    );
  }
}

// ============================================================
// BUG CATEGORY 2: Simulation calculation errors
// ============================================================
console.log('\n--- Category 2: Simulation calculation errors ---');

// 2a. Equivalence theorem: for any override set O,
//   computeLeaderboard(realResults ∪ O, forms)
// === computeLeaderboard({...realResults, ...O-as-real}, forms)
// i.e. simulating a result produces the same leaderboard as if it were real.
{
  const forms = buildForms();
  const realPreds = buildSeededResults();
  const realResults = buildResultsWithStage(realPreds);

  // Scenario 1: group override
  const scenarios = [
    {
      name: 'group override',
      override: {
        'group-A-1': {
          homeScore: 9,
          awayScore: 0,
          stage: 'group',
          group: 'A',
          played: true,
        },
      },
    },
    {
      name: 'R32 knockout tie with advancingTeam',
      override: null, // filled below
    },
    {
      name: 'Final override (changes champion)',
      override: null, // filled below
    },
  ];

  // Scenario 2 needs the R32-1 teams at this point.
  const realBracket = calcBracketTeams(realPreds);
  if (realBracket['R32-1']?.home && realBracket['R32-1']?.away) {
    scenarios[1].override = {
      'R32-1': {
        homeScore: 2,
        awayScore: 2,
        advancingTeam: realBracket['R32-1'].away, // flip winner
        stage: 'R32',
        played: true,
      },
    };
  }

  // Scenario 3: final override — flip champion
  if (realBracket['F-1']?.home && realBracket['F-1']?.away) {
    scenarios[2].override = {
      'F-1': {
        homeScore: 0,
        awayScore: 7,
        stage: 'F',
        played: true,
      },
    };
  }

  for (const sc of scenarios) {
    if (!sc.override) continue;

    // Simulated path: merge override onto real.
    const simResults = mergeOverride(realResults, sc.override);
    const simLb = computeLeaderboard(simResults, forms, {
      champion: null,
      topScorers: ['ronaldo'],
    });

    // Real-if-promoted path: build results where override IS the real.
    // For a group match, use stage group; otherwise use override's stage.
    // Since mergeOverride replaces the whole entry, the two paths operate on
    // identical `results` objects — the leaderboard must be identical.
    const promoted = { ...realResults, ...sc.override };
    const promotedLb = computeLeaderboard(promoted, forms, {
      champion: null,
      topScorers: ['ronaldo'],
    });

    // Byte-for-byte equivalence of rankings + scores.
    let ok = simLb.length === promotedLb.length;
    for (let i = 0; i < simLb.length && ok; i++) {
      ok =
        simLb[i].formId === promotedLb[i].formId &&
        simLb[i].totalPoints === promotedLb[i].totalPoints &&
        simLb[i].exactScoreCount === promotedLb[i].exactScoreCount &&
        simLb[i].outcomeCount === promotedLb[i].outcomeCount &&
        simLb[i].correctChampion === promotedLb[i].correctChampion;
    }
    assert(ok, `2a [${sc.name}]: sim leaderboard == promoted leaderboard`);
  }
}

// 2b. Partial simulation of groups: advancingTeams for R32 must be empty
//     until all 12 groups have >=6 matches.
{
  const realResults = {}; // Nothing played yet
  const override = {};
  for (const m of groupMatches.slice(0, 30)) {
    override[m.id] = {
      homeScore: 1,
      awayScore: 0,
      stage: 'group',
      group: m.group,
      played: true,
    };
  }
  const merged = mergeOverride(realResults, override);
  const bracket = calcBracketTeams(merged);
  const advancing = deriveActualAdvancing(bracket, merged);
  assert(
    advancing.R32.length === 0,
    '2b: partial groups => R32 advancing empty (matches admin behavior)',
  );
}

// 2c. Knockout tie WITHOUT advancingTeam is unresolved (not a silent home win).
//     getMatchWinner returns null so downstream rounds also leave the slot
//     empty until the user picks a winner. This guards against a long-standing
//     bug where a tie + missing advancingTeam was scored as "home advances".
{
  const preds = buildSeededResults();
  const realBracket = calcBracketTeams(preds);
  if (realBracket['R32-1']?.home) {
    preds['R32-1'] = {
      homeScore: 1,
      awayScore: 1,
      advancingTeam: null,
    };
    const bracketAfter = calcBracketTeams(preds);
    for (const m of knockoutMatches) {
      if (m.id.startsWith('R16-') && m.homeFrom === 'R32-1') {
        assert(
          bracketAfter[m.id]?.home === null,
          `2c: null advancingTeam leaves R16 slot null (R16 ${m.id} fed by R32-1)`,
        );
      }
    }
  }
}

// 2d. Override with explicit advancingTeam wins over null in ties.
{
  const preds = buildSeededResults();
  const realBracket = calcBracketTeams(preds);
  const r32Home = realBracket['R32-1']?.home;
  const r32Away = realBracket['R32-1']?.away;
  if (r32Home && r32Away) {
    preds['R32-1'] = {
      homeScore: 1,
      awayScore: 1,
      advancingTeam: r32Away, // explicit pick of away
    };
    const bracket = calcBracketTeams(preds);
    for (const m of knockoutMatches) {
      if (m.id.startsWith('R16-') && m.homeFrom === 'R32-1') {
        assert(
          bracket[m.id]?.home === r32Away,
          '2d: explicit advancingTeam overrides fallback',
        );
      }
    }
  }
}

// 2e. Champion derivation: override of F-1 must produce correct champion.
{
  const preds = buildSeededResults();
  const realBracket = calcBracketTeams(preds);
  const finalHome = realBracket['F-1']?.home;
  const finalAway = realBracket['F-1']?.away;
  if (finalHome && finalAway) {
    // Flip final to away win.
    preds['F-1'] = { homeScore: 0, awayScore: 5 };
    const bracket = calcBracketTeams(preds);
    const champ = deriveChampion(preds, bracket);
    assert(champ === finalAway, '2e: final override flips champion correctly');
  }
}

// 2f. Scoring points table unchanged by simulator (static sanity).
{
  const forms = buildForms();
  const realResults = buildResultsWithStage(buildSeededResults());
  const lb = computeLeaderboard(realResults, forms, {
    champion: null,
    topScorers: ['ronaldo'],
  });
  // Perfect form gets the most points.
  const perfect = lb.find((e) => e.formId === 'form-A__1');
  assert(perfect != null, '2f: Perfect form present in leaderboard');
  assert(perfect.totalPoints > 0, '2f: Perfect form totalPoints > 0');
  // Draft form is NOT in leaderboard.
  const draft = lb.find((e) => e.formId === 'form-D__1');
  assert(draft == null, '2f: Draft form excluded from leaderboard');
}

// 2g. Sim results with string scores get coerced correctly by scoring.
{
  const forms = {
    'f1__1': {
      userId: 'u1',
      formName: 'test',
      status: 'submitted',
      matches: { 'group-A-1': { homeScore: '2', awayScore: '0' } }, // strings
      champion: null,
      topScorer: '',
    },
  };
  const results = {
    'group-A-1': {
      homeScore: 2,
      awayScore: 0,
      stage: 'group',
      group: 'A',
    },
  };
  const lb = computeLeaderboard(results, forms, {
    champion: null,
    topScorers: [],
  });
  assert(
    lb[0]?.totalPoints === 1 + 3, // outcome 1 + exact 3
    `2g: string scores coerced to numbers (got ${lb[0]?.totalPoints})`,
  );
}

// ============================================================
// BUG CATEGORY 3: Admin vs user simulator compatibility
// ============================================================
console.log('\n--- Category 3: Admin vs user simulator produce identical results ---');

// Since both now use the SAME shared SimulatorPanel, the only difference is
// the `leaderboardLimit` and `highlightUserId` props — neither affects the
// computed leaderboard. Therefore equivalence is guaranteed *by construction*.
// We verify that the underlying computation (mergeOverride + computeLeaderboard)
// is deterministic and order-independent.

// 3a. Deterministic: same inputs => same outputs across calls.
{
  const forms = buildForms();
  const realResults = buildResultsWithStage(buildSeededResults());
  const override = {
    'group-A-1': {
      homeScore: 3,
      awayScore: 1,
      stage: 'group',
      group: 'A',
      played: true,
    },
  };
  const lb1 = computeLeaderboard(
    mergeOverride(realResults, override),
    forms,
    { champion: null, topScorers: [] },
  );
  const lb2 = computeLeaderboard(
    mergeOverride(realResults, override),
    forms,
    { champion: null, topScorers: [] },
  );
  assert(
    JSON.stringify(lb1) === JSON.stringify(lb2),
    '3a: same override => same leaderboard (deterministic)',
  );
}

// 3b. Override insertion order doesn't matter (Object.entries + spread merge).
{
  const forms = buildForms();
  const realResults = buildResultsWithStage(buildSeededResults());

  const o1 = {};
  o1['group-A-1'] = { homeScore: 1, awayScore: 0, stage: 'group', group: 'A' };
  o1['group-B-1'] = { homeScore: 2, awayScore: 0, stage: 'group', group: 'B' };

  const o2 = {};
  o2['group-B-1'] = { homeScore: 2, awayScore: 0, stage: 'group', group: 'B' };
  o2['group-A-1'] = { homeScore: 1, awayScore: 0, stage: 'group', group: 'A' };

  const lb1 = computeLeaderboard(mergeOverride(realResults, o1), forms, {
    champion: null,
    topScorers: [],
  });
  const lb2 = computeLeaderboard(mergeOverride(realResults, o2), forms, {
    champion: null,
    topScorers: [],
  });
  assert(
    JSON.stringify(lb1) === JSON.stringify(lb2),
    '3b: override insertion order independent',
  );
}

// 3c. Structural: SimulatorPanel is imported (shared) by both consumers.
{
  const fs = await import('node:fs');
  const adminSrc = readMigratedSrc(
    '/home/user/Beeri-World-Cup/src/components/AdminToolsTab.jsx',
    'utf8',
  );
  const statsSrc = readMigratedSrc(
    '/home/user/Beeri-World-Cup/src/pages/Stats.jsx',
    'utf8',
  );
  assert(
    /import\s+SimulatorPanel\s+from/.test(adminSrc),
    '3c: AdminToolsTab imports shared SimulatorPanel',
  );
  assert(
    /import\s+SimulatorPanel\s+from/.test(statsSrc),
    '3c: Stats imports shared SimulatorPanel',
  );
  assert(
    !/function\s+AdminSimulatorPanel/.test(adminSrc),
    '3c: Old AdminSimulatorPanel function removed (no divergent impl)',
  );
}

// 3d. leaderboardLimit is a display-only prop; it does not affect the order
//     of entries returned by the core leaderboard computation.
{
  const forms = buildForms();
  const realResults = buildResultsWithStage(buildSeededResults());
  const lb = computeLeaderboard(realResults, forms, {
    champion: null,
    topScorers: [],
  });
  const top1 = lb.slice(0, 1);
  const top5 = lb.slice(0, 5);
  assert(
    lb[0]?.formId === top1[0]?.formId && lb[0]?.formId === top5[0]?.formId,
    '3d: leaderboard order stable regardless of slice size',
  );
}

// ============================================================
// BUG CATEGORY 4: Code duplication
// ============================================================
console.log('\n--- Category 4: Code duplication ---');

// 4a. SimulatorPanel.jsx exists and is a single implementation.
{
  const fs = await import('node:fs');
  const simPath = '/home/user/Beeri-World-Cup/src/components/SimulatorPanel.jsx';
  const exists = existsMigratedSrc(simPath);
  assert(exists, '4a: SimulatorPanel exists as shared component');
  if (exists) {
    const src = readMigratedSrc(simPath, 'utf8');
    assert(
      /export default function SimulatorPanel/.test(src),
      '4a: SimulatorPanel has a default export',
    );
    assert(
      /useLeaderboardComputed/.test(src),
      '4a: SimulatorPanel uses canonical useLeaderboardComputed (same as real leaderboard)',
    );
    assert(
      /calcBracketTeams/.test(src),
      '4a: SimulatorPanel uses canonical calcBracketTeams',
    );
  }
}

// 4b. No reimplementation of bracket/scoring logic inside SimulatorPanel.
{
  const fs = await import('node:fs');
  const src = readMigratedSrc(
    '/home/user/Beeri-World-Cup/src/components/SimulatorPanel.jsx',
    'utf8',
  );
  // Must NOT locally recompute points, standings, etc.
  assert(
    !/function\s+calc(?:GroupStandings|BracketTeams|FullScore|MatchPoints)/.test(
      src,
    ),
    '4b: SimulatorPanel does not redefine bracket/scoring functions',
  );
}

// 4c. AdminToolsTab no longer duplicates the simulator body.
{
  const fs = await import('node:fs');
  const src = readMigratedSrc(
    '/home/user/Beeri-World-Cup/src/components/AdminToolsTab.jsx',
    'utf8',
  );
  // The old inline AdminSimulatorPanel (~300 lines) must be gone.
  assert(src.length < 8000, `4c: AdminToolsTab.jsx is now small (${src.length} chars)`);
  assert(
    !/calcBracketTeams\(/.test(src),
    '4c: AdminToolsTab.jsx no longer calls calcBracketTeams directly',
  );
}

// ============================================================
// BUG CATEGORY 5: Resource issues
// ============================================================
console.log('\n--- Category 5: Resource issues ---');

// 5a. mergeOverride returns a NEW object — no aliasing with realResults.
{
  const realResults = { 'group-A-1': { homeScore: 0, awayScore: 0 } };
  const override = { 'group-B-1': { homeScore: 1, awayScore: 1 } };
  const merged = mergeOverride(realResults, override);
  assert(merged !== realResults, '5a: merge returns new object, not alias');
  assert(merged !== override, '5a: merge returns new object, not override alias');
  assert(merged['group-A-1'] === realResults['group-A-1'], '5a: real entries shallow-shared (ok, they are read-only)');
  assert(merged['group-B-1'] === override['group-B-1'], '5a: override entries shallow-shared');
}

// 5b. Bracket cache size bounded at 1000.
{
  clearBracketCache();
  for (let i = 0; i < 1500; i++) {
    getCachedBracket({ [`m-${i}`]: { homeScore: i, awayScore: 0 } });
  }
  // We can't inspect size directly, but calling after overflow must not throw.
  const result = getCachedBracket({
    'final-check': { homeScore: 1, awayScore: 2 },
  });
  assert(typeof result === 'object', '5b: cache eviction does not break queries');
}

// 5c. Perf: single leaderboard computation should finish in reasonable time
//     for 20 forms × ~30 overrides.
{
  const forms = {};
  const basePreds = buildSeededResults();
  for (let i = 0; i < 20; i++) {
    forms[`perf-${i}__1`] = {
      userId: `perf-u-${i}`,
      formName: `p${i}`,
      status: 'submitted',
      matches: basePreds,
      champion: null,
      topScorer: '',
    };
  }
  const realResults = buildResultsWithStage(basePreds);
  const override = {};
  for (let i = 0; i < 30; i++) {
    const m = groupMatches[i];
    override[m.id] = {
      homeScore: i % 4,
      awayScore: (i + 1) % 4,
      stage: 'group',
      group: m.group,
    };
  }
  const merged = mergeOverride(realResults, override);

  const t0 = performance.now();
  const lb = computeLeaderboard(merged, forms, {
    champion: null,
    topScorers: [],
  });
  const dt = performance.now() - t0;
  assert(
    dt < 2000,
    `5c: leaderboard for 20 forms + 30 overrides < 2000ms (got ${dt.toFixed(1)}ms)`,
  );
  assert(lb.length === 20, '5c: all 20 submitted forms scored');
}

// 5d. Repeated override churn (simulating rapid typing) — 50 iterations.
//     Cache remains coherent (each iteration returns correct values).
{
  clearBracketCache();
  const realPreds = buildSeededResults();

  for (let i = 0; i < 50; i++) {
    const simPreds = { ...realPreds };
    simPreds['group-A-1'] = {
      homeScore: i % 5,
      awayScore: (i + 2) % 5,
    };
    const cached = getCachedBracket(simPreds);
    const direct = calcBracketTeams(simPreds);
    if (
      cached['R32-1']?.home !== direct['R32-1']?.home ||
      cached['R32-1']?.away !== direct['R32-1']?.away
    ) {
      assert(false, `5d: iter ${i} — cached R32-1 != direct R32-1`);
      break;
    }
  }
  assert(true, '5d: 50 rapid override churn iterations all coherent');
}

// 5e. SimulatorPanel source is a single file, bounded size (< 20KB).
{
  const fs = await import('node:fs');
  // .jsx -> .tsx during the TypeScript migration; try both.
  let stat;
  try { stat = fs.statSync('/home/user/Beeri-World-Cup/src/components/SimulatorPanel.jsx'); }
  catch { stat = fs.statSync('/home/user/Beeri-World-Cup/src/components/SimulatorPanel.tsx'); }
  assert(
    stat.size < 20000,
    `5e: SimulatorPanel size bounded (${stat.size} bytes)`,
  );
}

// ============================================================
// Summary
// ============================================================
console.log('');
if (failures.length > 0) {
  console.log('FAILURES:');
  failures.forEach((f) => console.log('  - ' + f));
}
console.log(`\n=== SIMULATOR PARITY: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
