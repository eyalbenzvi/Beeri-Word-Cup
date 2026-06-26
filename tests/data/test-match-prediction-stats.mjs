// Unit tests for src/utils/matchPredictionStats.ts — the pure aggregator
// behind the Stats "ניחושים למשחק" panel. Verifies the voter lists, counts,
// and derived figures stay internally consistent and handle edge cases.
//
// Run with the .ts-aware loader (registered "yes" in run-all.sh).

import {
  aggregateMatchPredictions,
  groupVotersByAdvancing,
} from "../../src/utils/matchPredictionStats.ts";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== MATCH PREDICTION STATS UNIT TESTS ===\n");

const MID = "m1";
const form = (name, home, away) => ({
  formId: `id-${name}`,
  formName: name,
  matches: { [MID]: { homeScore: home, awayScore: away } },
});

// Voters are now { formId, name } objects (so the UI can deep-link to a form).
// These helpers keep the assertions reading like the original name-based ones.
const names = (voters) => voters.map((v) => v.name).join();

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
  assert(s.homeWin === 1 && names(s.outcomeVoters.home) === "Alice", "home-win voter is Alice");
  assert(s.draw === 2 && names(s.outcomeVoters.draw) === "Bob,Dave", "draw voters are Bob,Dave");
  assert(s.awayWin === 1 && names(s.outcomeVoters.away) === "Carol", "away-win voter is Carol");
  // Each voter carries the form id so the UI can deep-link to it.
  assert(s.outcomeVoters.home[0].formId === "id-Alice", "voter carries formId for deep-linking");
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
  assert(names(s.scoreVoters["1-2"]) === "A,B", "score 2-1 (away-home key 1-2) voters are A,B");
  assert(names(s.scoreVoters["2-1"]) === "C", "score 1-2 (away-home key 2-1) voter is C");
  // Sum of all score-voter lists equals total predictions.
  const total = Object.values(s.scoreVoters).reduce((n, v) => n + v.length, 0);
  assert(total === s.preds, "score voter lists sum to total predictions");
}

// ---- 4. scores lists EVERY distinct result, sorted desc, not capped ----
{
  const forms = [];
  // 6 distinct scores with descending frequency 6,5,4,3,2,1
  const freq = [6, 5, 4, 3, 2, 1];
  freq.forEach((n, i) => {
    for (let k = 0; k < n; k++) forms.push(form(`f${i}-${k}`, i, 0));
  });
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.scores.length === 6, "scores includes ALL 6 distinct scores (not capped at 5)");
  const counts = s.scores.map(([, c]) => c);
  assert(
    counts.join() === "6,5,4,3,2,1",
    "scores sorted by descending count, nothing dropped",
  );
  // Each scores count matches its voter-list length.
  assert(
    s.scores.every(([key, c]) => s.scoreVoters[key].length === c),
    "every scores count equals its scoreVoters length",
  );
}

// ---- 4b. ties break deterministically by key (stable order) ----
{
  // Three scores each predicted once → tie-break by away-home key asc.
  const forms = [form("A", 0, 2), form("B", 0, 1), form("C", 1, 0)];
  const s = aggregateMatchPredictions(forms, MID);
  // keys: "2-0", "1-0", "0-1" → sorted asc: "0-1","1-0","2-0"
  assert(
    s.scores.map(([k]) => k).join() === "0-1,1-0,2-0",
    "equal-count scores ordered by key for a stable, deterministic list",
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
  assert(s.preds === 1 && names(s.outcomeVoters.home) === "A", "forms without this match are skipped");
}

// ---- 7. Missing form name falls back, never undefined in the list ----
{
  const forms = [{ matches: { [MID]: { homeScore: 1, awayScore: 0 } } }];
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.outcomeVoters.home[0].name === "טופס ללא שם", "missing formName falls back to placeholder");
  assert(
    s.scoreVoters["0-1"][0].name === "טופס ללא שם",
    "missing formName placeholder also in score voters",
  );
}

// ---- 8. Knockout-tie predictions carry the advancing team on the voter ----
{
  // A level score with an explicit qualifier — the form sent ISR through on
  // penalties. The voter must expose advancingTeam so VoterList can show it.
  const tieForm = {
    formId: "id-Tie",
    formName: "Tie",
    matches: { [MID]: { homeScore: 1, awayScore: 1, advancingTeam: "ISR" } },
  };
  // A decisive score: winner is implied, so no annotation should ride along.
  const winForm = {
    formId: "id-Win",
    formName: "Win",
    matches: { [MID]: { homeScore: 2, awayScore: 1, advancingTeam: "ARG" } },
  };
  const s = aggregateMatchPredictions([tieForm, winForm], MID);
  const drawVoter = s.outcomeVoters.draw.find((v) => v.name === "Tie");
  assert(drawVoter && drawVoter.advancingTeam === "ISR", "knockout-tie draw voter carries advancingTeam");
  // The same voter object is reused in the score lists, so the tie score (away-home key "1-1") carries it too.
  assert(
    (s.scoreVoters["1-1"] || []).some((v) => v.advancingTeam === "ISR"),
    "tie-score voter carries advancingTeam",
  );
  // A decisive result must NOT surface advancingTeam even if the field exists
  // on the prediction — the winner is unambiguous from the score.
  const winVoter = s.outcomeVoters.home.find((v) => v.name === "Win");
  assert(winVoter && winVoter.advancingTeam == null, "decisive-score voter has no advancingTeam annotation");
}

// ---- 9. Tie WITHOUT a recorded qualifier yields null (no crash, no ghost) ----
{
  const forms = [form("NoAdv", 0, 0)]; // group-style draw, no advancingTeam
  const s = aggregateMatchPredictions(forms, MID);
  assert(s.outcomeVoters.draw[0].advancingTeam == null, "draw without advancingTeam → null, not undefined-team");
}

// ---- 10. A GROUP draw never surfaces a qualifier, even with stale data ----
{
  // Stale/imported form: a group 1-1 that still carries a leftover advancingTeam.
  // The aggregator must not annotate it — group draws send no one through.
  const GID = "group-A-1";
  const forms = [
    {
      formId: "id-Grp",
      formName: "Grp",
      matches: { [GID]: { homeScore: 1, awayScore: 1, advancingTeam: "ISR" } },
    },
  ];
  const s = aggregateMatchPredictions(forms, GID);
  assert(
    s.outcomeVoters.draw[0].advancingTeam == null,
    "group-match draw never carries advancingTeam (self-enforcing gate, not UI-dependent)",
  );
}

// ---- 11. groupVotersByAdvancing groups by team, ordered by crowd size ----
{
  const v = (name, team) => ({ formId: `id-${name}`, name, advancingTeam: team });
  const voters = [
    v("A", "ISR"),
    v("B", "ARG"),
    v("C", "ISR"),
    v("D", "ISR"),
    v("E", "ARG"),
  ];
  const { groups, ungrouped } = groupVotersByAdvancing(voters);
  assert(ungrouped.length === 0, "all qualified voters are grouped (none left ungrouped)");
  assert(groups.length === 2, "one group per distinct advancing team");
  // ISR has 3, ARG has 2 → ISR first (count desc).
  assert(groups[0].team === "ISR" && groups[0].count === 3, "biggest tie-group (ISR×3) ranked first");
  assert(groups[1].team === "ARG" && groups[1].count === 2, "runner-up tie-group (ARG×2) ranked second");
  // Each group lists exactly its own voters, consecutively.
  assert(
    groups[0].voters.map((x) => x.name).join() === "A,C,D",
    "ISR group lists its three predictors consecutively",
  );
  assert(
    groups[0].count === groups[0].voters.length,
    "group count equals its voter-list length (single source of truth)",
  );
}

// ---- 12. Equal-size groups break ties by team code (deterministic order) ----
{
  const v = (name, team) => ({ formId: `id-${name}`, name, advancingTeam: team });
  const { groups } = groupVotersByAdvancing([v("A", "ZZZ"), v("B", "AAA")]);
  assert(
    groups.map((g) => g.team).join() === "AAA,ZZZ",
    "equal-count groups ordered by team code for a stable, testable list",
  );
}

// ---- 13. Voters without a qualifier are separated, not dropped ----
{
  const withTeam = { formId: "id-T", name: "T", advancingTeam: "ISR" };
  const noTeam = { formId: "id-N", name: "N" }; // e.g. a group-stage draw
  const { groups, ungrouped } = groupVotersByAdvancing([withTeam, noTeam]);
  assert(groups.length === 1 && groups[0].team === "ISR", "only qualified voters form groups");
  assert(
    ungrouped.length === 1 && ungrouped[0].name === "N",
    "voters without advancingTeam are returned as ungrouped, never lost",
  );
}

// ---- 14. Aggregator output feeds the grouper end-to-end ----
{
  const tie = (name, adv) => ({
    formId: `id-${name}`,
    formName: name,
    matches: { [MID]: { homeScore: 1, awayScore: 1, advancingTeam: adv } },
  });
  const s = aggregateMatchPredictions([tie("A", "ISR"), tie("B", "ISR"), tie("C", "ARG")], MID);
  const { groups } = groupVotersByAdvancing(s.outcomeVoters.draw);
  assert(
    groups[0].team === "ISR" && groups[0].count === 2 && groups[1].team === "ARG",
    "draw bucket from the aggregator groups straight into the advancing breakdown",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
