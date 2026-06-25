// Regression tests for the leaderboard form-detail view (UI/UX fixes).
//
// Fixes pinned here:
//   2. Matches in the opened form detail render in REVERSE-chronological kickoff
//      order — newest finished match first (was ascending; before that, raw
//      Object.keys(results) insertion order). The descending sort also inverts
//      the stage grouping so the latest stage heads the list.
//   3. Inside a form detail the actual result and the owner's prediction are
//      each explicitly LABELLED (תוצאה / ניחוש) and the prediction is no longer
//      a tiny muted line — so the big primary number can't be mistaken for the
//      owner's guess.
//   4. Upcoming matches (not finished, kicking off within 24h) render ABOVE the
//      finished stages, reusing the shared useUpcomingMatches selector.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== FORM-DETAIL DISPLAY TESTS ===\n");

// ---- Fix 2: reverse-chronological ordering in the leaderboard form detail ----
console.log("--- Fix 2: reverse-chronological match order ---");
const lb = readMigratedSrc("src/pages/Leaderboard.jsx");

assert(/import \{ getMatchSortTime \} from "\.\.\/utils\/chronologicalSchedule"/.test(lb),
  "Leaderboard reuses getMatchSortTime (shared play-order key, no drift)");
assert(/Object\.keys\(results\)\.sort\(/.test(lb),
  "playedMatches is sorted (not raw Object.keys insertion order)");
assert(/getMatchSortTime\(mb\)\s*-\s*getMatchSortTime\(ma\)/.test(lb),
  "the sort is DESCENDING by kickoff instant (newest finished match first)");
assert(/\(mb\?\.fifaMatch \?\? 0\)\s*-\s*\(ma\?\.fifaMatch \?\? 0\)/.test(lb),
  "kickoff ties fall back to FIFA match number, also descending");

// ---- Fix 4: upcoming matches (24h) above the finished stages ----
console.log("--- Fix 4: upcoming matches section ---");

assert(/import \{ useUpcomingMatches \} from "\.\.\/hooks\/useUpcomingMatches"/.test(lb),
  "Leaderboard reuses the shared useUpcomingMatches selector (no duplicated 24h window)");
assert(/const upcomingMatches = useUpcomingMatches\(\)/.test(lb),
  "the upcoming-matches list is read from the hook");
assert(/המשחקים הקרובים/.test(lb),
  "form detail renders an 'upcoming matches' heading");
assert(/upcomingMatches\.map\(\(m\) => renderMatchCard\(m\.id, m, null\)\)/.test(lb),
  "each upcoming match is rendered via the shared renderMatchCard with a null result");
// The shared helper is reused by the finished stages too (single source of truth).
assert(/renderMatchCard\(matchId, match, result\)/.test(lb),
  "finished stages render through the same shared renderMatchCard helper");
// A null result must not crash the helper: result-derived reads are guarded.
assert(/result\?\.stage/.test(lb) && /result\?\.homeTeam/.test(lb),
  "renderMatchCard guards result-derived reads so a null (upcoming) result is safe");
// The empty-state no longer fires when only upcoming matches exist.
assert(/playedMatches\.length === 0 && upcomingMatches\.length === 0/.test(lb),
  "'no matches played' empty-state is suppressed while upcoming matches are shown");

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
