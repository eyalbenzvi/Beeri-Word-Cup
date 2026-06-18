// Regression tests for the leaderboard form-detail view (UI/UX fixes).
//
// Two fixes are pinned here:
//   2. Matches in the opened form detail render in CHRONOLOGICAL kickoff order
//      (was Object.keys(results) — the random order the admin entered results).
//   3. Inside a form detail the actual result and the owner's prediction are
//      each explicitly LABELLED (תוצאה / ניחוש) and the prediction is no longer
//      a tiny muted line — so the big primary number can't be mistaken for the
//      owner's guess.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== FORM-DETAIL DISPLAY TESTS ===\n");

// ---- Fix 2: chronological ordering in the leaderboard form detail ----
console.log("--- Fix 2: chronological match order ---");
const lb = readMigratedSrc("src/pages/Leaderboard.jsx");

assert(/import \{ getMatchSortTime \} from "\.\.\/utils\/chronologicalSchedule"/.test(lb),
  "Leaderboard reuses getMatchSortTime (shared play-order key, no drift)");
assert(/Object\.keys\(results\)\.sort\(/.test(lb),
  "playedMatches is sorted (not raw Object.keys insertion order)");
assert(/getMatchSortTime\(ma\)\s*-\s*getMatchSortTime\(mb\)/.test(lb),
  "the sort key is each match's chronological kickoff instant");
assert(/fifaMatch \?\? 0/.test(lb),
  "kickoff ties fall back to FIFA match number (matches Results chronological view)");

// ---- Fix 3: labelled result vs. prediction in MatchCard ----
console.log("--- Fix 3: result/prediction labels ---");
const card = readMigratedSrc("src/components/MatchCard.jsx");

assert(/>תוצאה</.test(card), "actual result carries an explicit 'תוצאה' label");
assert(/>ניחוש</.test(card), "prediction carries an explicit 'ניחוש' label");
// The prediction line is no longer the old tiny muted "ניחוש: x:y".
assert(!/ניחוש: <Score/.test(card),
  "prediction is no longer the tiny inline 'ניחוש: x:y' muted line");
// Both Score renders survive (bidi-safe), guarded by the result gate.
assert(/home=\{actualResult\.homeScore\} away=\{actualResult\.awayScore\}/.test(card),
  "actual result still rendered via <Score>");
assert(/home=\{predHome\} away=\{predAway\}/.test(card),
  "prediction still rendered via <Score>");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
