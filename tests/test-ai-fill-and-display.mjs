// ============================================================
// AI FILL PRESERVATION + LEADERBOARD DISPLAY + SIMULATOR LAYOUT
// ============================================================
// Covers three fixes:
//   1. predictAllMatches(existingPreds) preserves filled predictions
//      - Group and knockout matches are preserved verbatim
//      - advancingTeam on knockout ties is preserved
//      - Partial predictions (only one score) are treated as unfilled
//      - Knockout cascade uses user's group picks
//      - Top-scorer preservation logic (activeForm.topScorer check)
//      - Backwards-compatible signature (3 args still work)
//   2. Leaderboard row visibility guard
//      - Champion/top-scorer only shown when canView is true
//   3. Simulator layout regression
//      - home/away score mapping unchanged in handleSaveResult semantics
//      - Each team renders in its own row (structural markers)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { predictAllMatches } from '/home/user/Beeri-World-Cup/src/utils/fifaPredictor.js';
import { groupMatches, knockoutMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcBracketTeams } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

console.log('=== AI FILL + DISPLAY + SIMULATOR TESTS ===');

// ============================================================
// PART 1 — predictAllMatches existingPreds preservation
// ============================================================
section('1a. Group match preserved verbatim');
{
  const firstGroup = groupMatches[0];
  const userPred = { homeScore: 7, awayScore: 3 };
  const existing = { [firstGroup.id]: userPred };
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, existing);
  assert(
    preds[firstGroup.id]?.homeScore === 7 && preds[firstGroup.id]?.awayScore === 3,
    `Preserved group prediction: expected 7-3, got ${preds[firstGroup.id]?.homeScore}-${preds[firstGroup.id]?.awayScore}`,
  );
  // Object is a copy (not the same reference)
  assert(
    preds[firstGroup.id] !== userPred,
    'Preserved group prediction is a fresh copy (not same reference)',
  );
}

section('1b. Partial prediction (only homeScore) is NOT preserved');
{
  const firstGroup = groupMatches[0];
  const partial = { homeScore: 5 }; // awayScore missing
  const existing = { [firstGroup.id]: partial };
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, existing);
  // Since partial, the predictor generates a full prediction — awayScore must
  // be a number
  assert(
    typeof preds[firstGroup.id]?.homeScore === 'number' &&
      typeof preds[firstGroup.id]?.awayScore === 'number',
    `Partial predictions get fully predicted; got ${JSON.stringify(preds[firstGroup.id])}`,
  );
}

section('1c. Partial prediction (only awayScore) is NOT preserved');
{
  const firstGroup = groupMatches[0];
  const partial = { awayScore: 2 };
  const existing = { [firstGroup.id]: partial };
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, existing);
  assert(
    typeof preds[firstGroup.id]?.homeScore === 'number' &&
      typeof preds[firstGroup.id]?.awayScore === 'number',
    `Away-only partial triggers AI fill; got ${JSON.stringify(preds[firstGroup.id])}`,
  );
}

section('1d. Null / undefined / non-number scores are NOT preserved');
{
  const g = groupMatches[0];
  const cases = [
    { label: 'null-null', pred: { homeScore: null, awayScore: null } },
    { label: 'string scores', pred: { homeScore: '2', awayScore: '1' } },
    { label: 'empty object', pred: {} },
    { label: 'null entry', pred: null },
  ];
  for (const c of cases) {
    const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {
      [g.id]: c.pred,
    });
    assert(
      typeof preds[g.id]?.homeScore === 'number' &&
        typeof preds[g.id]?.awayScore === 'number',
      `Case "${c.label}" should trigger AI fill`,
    );
  }
}

section('1e. All group matches preserved → cascade uses user picks');
{
  // Fill all group matches with a deterministic 1-0 home win
  const existing = {};
  for (const m of groupMatches) {
    existing[m.id] = { homeScore: 1, awayScore: 0 };
  }
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, existing);
  // Every group match must be preserved exactly
  let allMatch = true;
  for (const m of groupMatches) {
    if (preds[m.id]?.homeScore !== 1 || preds[m.id]?.awayScore !== 0) {
      allMatch = false;
      break;
    }
  }
  assert(allMatch, 'All group predictions preserved verbatim when all pre-filled');

  // Knockout matches exist and each has both scores
  const r32 = knockoutMatches.filter((m) => m.stage === 'R32');
  assert(r32.length === 16, `R32 has 16 matches, got ${r32.length}`);
  let knockoutOk = true;
  for (const m of r32) {
    const p = preds[m.id];
    if (!p || typeof p.homeScore !== 'number' || typeof p.awayScore !== 'number') {
      knockoutOk = false;
      break;
    }
  }
  assert(knockoutOk, 'R32 predictions generated on top of preserved group picks');
}

section('1f. Knockout match with advancingTeam preserved verbatim');
{
  // Find the first R32 match whose teams are deterministically known once groups
  // are fixed. To avoid brittleness, fill groups deterministically first.
  const existing = {};
  for (const m of groupMatches) {
    existing[m.id] = { homeScore: 1, awayScore: 0 };
  }
  // Take the first R32 match, force a 2-2 tie with a specific advancing team
  const r32 = knockoutMatches.find((m) => m.stage === 'R32');
  // Figure out which teams would play this match
  const preliminary = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, existing);
  const actualHome = preliminary[r32.id]?.homeScore != null
    ? { homeScore: 2, awayScore: 2, advancingTeam: 'ARG' }
    : null;
  assert(actualHome !== null, 'Preliminary cascade assigned the target R32 match');

  existing[r32.id] = { homeScore: 2, awayScore: 2, advancingTeam: 'ARG' };
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, existing);
  assert(
    preds[r32.id]?.homeScore === 2 &&
      preds[r32.id]?.awayScore === 2 &&
      preds[r32.id]?.advancingTeam === 'ARG',
    `Preserved knockout tie with advancingTeam: ${JSON.stringify(preds[r32.id])}`,
  );
}

section('1g. Empty existingPreds behaves like original (all predicted)');
{
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {});
  let allHaveScores = true;
  for (const m of groupMatches) {
    const p = preds[m.id];
    if (!p || typeof p.homeScore !== 'number' || typeof p.awayScore !== 'number') {
      allHaveScores = false;
      break;
    }
  }
  assert(allHaveScores, 'Empty existingPreds produces a full group prediction');
}

section('1h. Backwards compatibility — 3-arg call still works');
{
  // Must not throw, must return a full group slate
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams);
  let allHaveScores = true;
  for (const m of groupMatches) {
    const p = preds[m.id];
    if (!p || typeof p.homeScore !== 'number' || typeof p.awayScore !== 'number') {
      allHaveScores = false;
      break;
    }
  }
  assert(allHaveScores, '3-arg legacy signature still works');
}

section('1i. Preserved prediction is a shallow copy (caller cannot mutate through)');
{
  const firstGroup = groupMatches[0];
  const userPred = { homeScore: 2, awayScore: 1, advancingTeam: 'BRA' };
  const preds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams, {
    [firstGroup.id]: userPred,
  });
  // Mutating the returned object must not leak back into the input
  preds[firstGroup.id].homeScore = 99;
  assert(userPred.homeScore === 2, 'Returned predictions do not share reference with caller input');
}

// ============================================================
// PART 2 — Top-scorer preservation logic (extracted from handleAIFill)
// ============================================================
section('2. Top-scorer preservation — simulated handler flow');
{
  // Emulate the guarded write: if activeForm.topScorer is set, do not write.
  function guardedTopScorerWrite(activeForm, writer) {
    if (!activeForm?.topScorer) {
      writer('RANDOM_PLAYER');
      return true;
    }
    return false;
  }

  // Case A: existing top scorer → no write
  let wrote = false;
  const didWriteA = guardedTopScorerWrite({ topScorer: 'מסי' }, () => {
    wrote = true;
  });
  assert(!wrote && didWriteA === false, 'Existing topScorer is preserved, no write performed');

  // Case B: empty string → treated as missing, write happens
  wrote = false;
  let val;
  const didWriteB = guardedTopScorerWrite({ topScorer: '' }, (v) => {
    wrote = true;
    val = v;
  });
  assert(
    wrote && didWriteB === true && val === 'RANDOM_PLAYER',
    'Empty topScorer triggers a write',
  );

  // Case C: missing field → write happens
  wrote = false;
  const didWriteC = guardedTopScorerWrite({}, () => {
    wrote = true;
  });
  assert(wrote && didWriteC === true, 'Missing topScorer triggers a write');

  // Case D: null activeForm → write happens (defensive)
  wrote = false;
  const didWriteD = guardedTopScorerWrite(null, () => {
    wrote = true;
  });
  assert(wrote && didWriteD === true, 'Null activeForm is handled (writes random)');
}

// ============================================================
// PART 3 — Leaderboard privacy guard
// ============================================================
section('3. Leaderboard canView / row-level privacy');
{
  // Mirrors the guard in Leaderboard.jsx:
  //   canView = forceUnlockView || locked || entry.userId === user?.id
  function canView({ forceUnlockView, locked, entryUserId, viewerUserId }) {
    return forceUnlockView || locked || entryUserId === viewerUserId;
  }

  // Unlocked, other user's form → cannot view
  assert(
    !canView({ forceUnlockView: false, locked: false, entryUserId: 'u1', viewerUserId: 'u2' }),
    'Unlocked + other user → hidden',
  );

  // Unlocked, own form → can view
  assert(
    canView({ forceUnlockView: false, locked: false, entryUserId: 'u2', viewerUserId: 'u2' }),
    'Unlocked + own form → visible',
  );

  // Locked, any user → can view
  assert(
    canView({ forceUnlockView: false, locked: true, entryUserId: 'u1', viewerUserId: 'u2' }),
    'Locked → all rows visible',
  );

  // forceUnlockView (admin preview) → can view
  assert(
    canView({ forceUnlockView: true, locked: false, entryUserId: 'u1', viewerUserId: 'u2' }),
    'Admin preview → visible',
  );

  // Unauthenticated viewer (user=null) → only locked unlocks rows
  assert(
    !canView({ forceUnlockView: false, locked: false, entryUserId: 'u1', viewerUserId: undefined }),
    'No viewer + unlocked + other-user → hidden',
  );
  assert(
    canView({ forceUnlockView: false, locked: true, entryUserId: 'u1', viewerUserId: undefined }),
    'No viewer + locked → visible',
  );
}

// ============================================================
// PART 4 — Source file sanity checks
// ============================================================
// These are lightweight structural checks that catch regressions where the
// visibility guard or layout changes get undone by a later edit.
section('4. Source-level regression guards');
{
  const leaderboardSrc = fs.readFileSync(
    path.resolve('/home/user/Beeri-World-Cup/src/pages/Leaderboard.jsx'),
    'utf8',
  );

  // Fix 2 guards: champion/top-scorer display is gated by canView
  assert(
    /canView\s*&&\s*championName/.test(leaderboardSrc),
    'Leaderboard: champion display is guarded by canView',
  );
  assert(
    /canView\s*&&\s*topScorerDisplay/.test(leaderboardSrc),
    'Leaderboard: top-scorer display is guarded by canView',
  );
  assert(
    leaderboardSrc.includes('🏆 '),
    'Leaderboard row renders the champion medal emoji',
  );
  assert(
    leaderboardSrc.includes('⚽ '),
    'Leaderboard row renders the top-scorer ball emoji',
  );
  // The canView definition should exist once inside the row block
  assert(
    /const canView\s*=\s*[\s\S]*?forceUnlockView\s*\|\|\s*locked\s*\|\|\s*entry\.userId === user\?\.id/.test(
      leaderboardSrc,
    ),
    'Leaderboard: canView combines forceUnlockView, locked, and ownership',
  );
}

{
  const simSrc = fs.readFileSync(
    path.resolve('/home/user/Beeri-World-Cup/src/components/SimulatorPanel.jsx'),
    'utf8',
  );

  // Fix 3 structural markers: two aria-labeled inputs for home/away
  assert(
    /aria-label=\{`גולים \$\{homeTeam\?\.name \|\| "ביתית"\}`\}/.test(simSrc),
    'Simulator: home input has Hebrew aria-label keyed to homeTeam name',
  );
  assert(
    /aria-label=\{`גולים \$\{awayTeam\?\.name \|\| "חוץ"\}`\}/.test(simSrc),
    'Simulator: away input has Hebrew aria-label keyed to awayTeam name',
  );
  // Flags are rendered (fix 3 uses the team flag to disambiguate)
  assert(
    simSrc.includes('homeTeam.flag') && simSrc.includes('awayTeam.flag'),
    'Simulator: flags are rendered per team',
  );
  // <bdi> used for team names to keep RTL/LTR text sane in Hebrew
  assert(
    /bdi[^>]*>\{homeTeam\?\.name/.test(simSrc),
    'Simulator: home team name wrapped in <bdi>',
  );
  assert(
    /bdi[^>]*>\{awayTeam\?\.name/.test(simSrc),
    'Simulator: away team name wrapped in <bdi>',
  );
  // No more ambiguous "homeScore-awayScore" display; scores live per-row now
  assert(
    !simSrc.includes('${result.homeScore}-${result.awayScore}'),
    'Simulator: ambiguous combined score string is gone',
  );
}

{
  const predictSrc = fs.readFileSync(
    path.resolve('/home/user/Beeri-World-Cup/src/pages/Predict.jsx'),
    'utf8',
  );

  // Fix 1 guards
  assert(
    /predictAllMatches\(\s*groupMatches,\s*knockoutMatches,\s*calcBracketTeams,\s*existingMatches/.test(
      predictSrc,
    ),
    'Predict.handleAIFill: existing matches are passed to predictAllMatches',
  );
  assert(
    /if\s*\(!activeForm\?\.topScorer\)/.test(predictSrc),
    'Predict.handleAIFill: guards saveBonusPrediction for topScorer',
  );
  assert(
    predictSrc.includes('הניחושים החסרים ימולאו בעזרת AI'),
    'Predict.handleAIFill: updated confirm text reflects preservation',
  );
  // Old destructive message must be gone
  assert(
    !predictSrc.includes('כל הניחושים הקיימים יימחקו'),
    'Predict.handleAIFill: old destructive confirm text removed',
  );
}

// ============================================================
// PART 5 — Simulator handleSaveResult semantics unchanged (safety)
// ============================================================
// The layout changed, but the save-result code path must continue mapping
// the "homeScore" state field to the home team. Reading the source and
// confirming the call site remained home-first.
section('5. Simulator handleSaveResult mapping remains home-first');
{
  const simSrc = fs.readFileSync(
    path.resolve('/home/user/Beeri-World-Cup/src/components/SimulatorPanel.jsx'),
    'utf8',
  );
  // The save handler must still build the result with homeScore parsed from
  // editScores.homeScore AND persist derived.home as homeTeam.
  assert(
    /homeScore\s*=\s*parseInt\(editScores\.homeScore/.test(simSrc),
    'handleSaveResult parses homeScore from editScores.homeScore',
  );
  assert(
    /awayScore\s*=\s*parseInt\(editScores\.awayScore/.test(simSrc),
    'handleSaveResult parses awayScore from editScores.awayScore',
  );
  assert(
    /homeTeam:\s*derived\.home/.test(simSrc),
    'handleSaveResult stores derived.home as the homeTeam',
  );
  assert(
    /awayTeam:\s*derived\.away/.test(simSrc),
    'handleSaveResult stores derived.away as the awayTeam',
  );
}

// ============================================================
console.log(`\n==========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
