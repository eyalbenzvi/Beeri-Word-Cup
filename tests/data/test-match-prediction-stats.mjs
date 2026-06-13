// Unit tests for src/utils/matchPredictionStats.ts — the pure aggregator
// behind the Stats "ניחושים למשחק" panel. Verifies the voter lists, counts,
// and derived figures stay internally consistent and handle edge cases.
//
// Run with the .ts-aware loader (registered "yes" in run-all.sh).

import { aggregateMatchPredictions } from "../../src/utils/matchPredictionStats.ts";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== MATCH PREDICTION STATS UNIT TESTS ===\n");

const MID = "m1";
const form = (name, home, away) => ({
  formName: name,
  matches: { [MID]: { homeScore: home, awayScore: away } },
});

// ---- 1. Outcome buckets capture the right voters ----
{
  const forms = [
    form("Alice", 2, 1), // home win
    form("Bob", 0, 0),   // draw
    form("Carol", 1, 3), // away win
    form("Dave", 1, 1),  // draw
  ];
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.preds === 4, "counts all 4 predictions");
  assert(s.homeWin === 1 && s.outcomeVoters.home.join() === "Alice", "home-win voter is Alice");
  assert(s.draw === 2 && s.outcomeVoters.draw.join() === "Bob,Dave", "draw voters are Bob,Dave");
  assert(s.awayWin === 1 && s.outcomeVoters.away.join() === "Carol", "away-win voter is Carol");
}

// ---- 2. Outcome counts equal voter-list lengths (single source of truth) ----
{
  const forms = [form("A", 3, 0), form("B", 3, 0), form("C", 2, 2), form("D", 0, 1)];
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.homeWin === s.outcomeVoters.home.length, "homeWin === home voters length");
  assert(s.draw === s.outcomeVoters.draw.length, "draw === draw voters length");
  assert(s.awayWin === s.outcomeVoters.away.length, "awayWin === away voters length");
  assert(
    s.homeWin + s.draw + s.awayWin === s.preds,
    "outcome buckets partition every prediction exactly once",
  );
}

// ---- 3. Score voters use RTL away-home key and stay consistent ----
{
  const forms = [
    form("A", 2, 1), // key "1-2"
    form("B", 2, 1), // key "1-2"
    form("C", 1, 2), // key "2-1"
  ];
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.scoreVoters["1-2"].join() === "A,B", "score 2-1 (away-home key 1-2) voters are A,B");
  assert(s.scoreVoters["2-1"].join() === "C", "score 1-2 (away-home key 2-1) voter is C");
  // Sum of all score-voter lists equals total predictions.
  const total = Object.values(s.scoreVoters).reduce((n, v) => n + v.length, 0);
  assert(total === s.preds, "score voter lists sum to total predictions");
}

// ---- 4. topScores is sorted desc and capped at 5 ----
{
  const forms = [];
  // 6 distinct scores with descending frequency 6,5,4,3,2,1
  const freq = [6, 5, 4, 3, 2, 1];
  freq.forEach((n, i) => {
    for (let k = 0; k < n; k++) forms.push(form(`f${i}-${k}`, i, 0));
  });
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.topScores.length === 5, "topScores capped at 5 even with 6 distinct scores");
  const counts = s.topScores.map(([, c]) => c);
  assert(
    counts.join() === "6,5,4,3,2",
    "topScores sorted by descending count, least frequent dropped",
  );
  // Each topScores count matches its voter-list length.
  assert(
    s.topScores.every(([key, c]) => s.scoreVoters[key].length === c),
    "every topScores count equals its scoreVoters length",
  );
}

// ---- 5. Average goals ----
{
  const forms = [form("A", 2, 1), form("B", 0, 0), form("C", 3, 1)]; // total 7 goals / 3
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.avgGoals === "2.3", `avgGoals = 7/3 ≈ 2.3 (got ${s.avgGoals})`);
}

// ---- 6. Empty / no-prediction edge cases ----
{
  assert(aggregateMatchPredictions([], MID).preds === 0, "no forms → 0 predictions");
  assert(aggregateMatchPredictions([], MID).avgGoals === "0", "no forms → avgGoals '0' (no divide-by-zero)");
  // Forms that didn't predict THIS match are ignored.
  const mixed = [form("A", 1, 0), { formName: "B", matches: { other: { homeScore: 1, awayScore: 1 } } }];
  const s = aggregateMatchPredictions(mixed, MID);
  assert(s.preds === 1 && s.outcomeVoters.home.join() === "A", "forms without this match are skipped");
}

// ---- 7. Missing form name falls back, never undefined in the list ----
{
  const forms = [{ matches: { [MID]: { homeScore: 1, awayScore: 0 } } }];
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.outcomeVoters.home[0] === "טופס ללא שם", "missing formName falls back to placeholder");
  assert(
    s.scoreVoters["0-1"][0] === "טופס ללא שם",
    "missing formName placeholder also in score voters",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
