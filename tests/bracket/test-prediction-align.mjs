// Tests for src/utils/predictionAlign.js.
//
// Core bug class being guarded against: displaying the user's prediction
// mirrored against the real match's home/away assignment. In knockout, the
// bracket slot can seat the same two teams in either order relative to the
// form's internal bracket. When roles are swapped, the displayed scores must
// mirror so the "home – away" pair matches the actual home/away teams shown
// on the card, not the form's internal ones.

import {
  teamsMatch,
  resolveMatchTeams,
  alignPredictionToActual,
} from "/home/user/Beeri-World-Cup/src/utils/predictionAlign.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== PREDICTION ALIGNMENT TESTS ===\n");

// ========== teamsMatch ==========
console.log("--- 1. teamsMatch: same order ---");
assert(
  teamsMatch({ home: "FRA", away: "ARG" }, { home: "FRA", away: "ARG" }) === true,
  "Identical pairs match"
);

console.log("--- 2. teamsMatch: swapped order ---");
assert(
  teamsMatch({ home: "FRA", away: "ARG" }, { home: "ARG", away: "FRA" }) === true,
  "Swapped home/away match (set equality)"
);

console.log("--- 3. teamsMatch: different teams ---");
assert(
  teamsMatch({ home: "FRA", away: "ARG" }, { home: "FRA", away: "BRA" }) === false,
  "Different away team -> no match"
);
assert(
  teamsMatch({ home: "FRA", away: "ARG" }, { home: "ESP", away: "POR" }) === false,
  "Completely different -> no match"
);

console.log("--- 4. teamsMatch: missing data ---");
assert(teamsMatch(null, { home: "A", away: "B" }) === false, "null a -> false");
assert(teamsMatch({ home: "A", away: "B" }, null) === false, "null b -> false");
assert(teamsMatch(null, null) === false, "both null -> false");
assert(teamsMatch(undefined, undefined) === false, "both undef -> false");
assert(teamsMatch({ home: "A" }, { home: "A", away: "B" }) === false, "missing a.away");
assert(teamsMatch({ home: "A", away: null }, { home: "A", away: "B" }) === false, "null a.away");
assert(teamsMatch({ home: "A", away: "B" }, { home: null, away: "B" }) === false, "null b.home");
assert(teamsMatch({}, {}) === false, "empty entries");

console.log("--- 5. teamsMatch: same-team pair (impossible in practice but safe) ---");
// {home: A, away: A} vs {home: A, away: B} — set([A]) vs set([A, B]) — depends
// on semantics. Here setA has "A" only, {home: A, away: B}: setA.has("A") true,
// setA.has("B") false → returns false. Safe behavior.
assert(
  teamsMatch({ home: "A", away: "A" }, { home: "A", away: "B" }) === false,
  "Degenerate pair doesn't falsely match"
);

// ========== resolveMatchTeams ==========
console.log("--- 6. resolveMatchTeams: group stage ---");
{
  const match = { id: "group-A-1", stage: "group", homeTeam: "MEX", awayTeam: "RSA" };
  const teams = resolveMatchTeams(match, {});
  assert(teams.home === "MEX" && teams.away === "RSA", "Group uses match fields");
}
{
  // Even if an actualBracket somehow has an entry, group stage ignores it
  const match = { id: "group-A-1", stage: "group", homeTeam: "MEX", awayTeam: "RSA" };
  const teams = resolveMatchTeams(match, { "group-A-1": { home: "X", away: "Y" } });
  assert(teams.home === "MEX" && teams.away === "RSA", "Group ignores bracket");
}

console.log("--- 7. resolveMatchTeams: knockout with bracket ---");
{
  const match = { id: "R32-1", stage: "R32" };
  const teams = resolveMatchTeams(match, { "R32-1": { home: "FRA", away: "ARG" } });
  assert(teams.home === "FRA" && teams.away === "ARG", "Knockout uses bracket");
}

console.log("--- 8. resolveMatchTeams: knockout without bracket ---");
{
  const match = { id: "R32-1", stage: "R32" };
  const teams = resolveMatchTeams(match, {});
  assert(teams.home === null && teams.away === null, "Missing bracket -> nulls");
}
{
  const match = { id: "R32-1", stage: "R32" };
  const teams = resolveMatchTeams(match, null);
  assert(teams.home === null && teams.away === null, "Null bracket -> nulls");
}
{
  const match = { id: "R32-1", stage: "R32" };
  const teams = resolveMatchTeams(match, { "R32-1": { home: null, away: "ARG" } });
  assert(teams.home === null && teams.away === "ARG", "Partial bracket passes through");
}

console.log("--- 9. resolveMatchTeams: null match ---");
{
  const teams = resolveMatchTeams(null, {});
  assert(teams.home === null && teams.away === null, "Null match -> nulls");
}

// ========== alignPredictionToActual ==========
console.log("--- 10. alignPredictionToActual: same roles (no swap) ---");
{
  const pred = { homeScore: 2, awayScore: 1 };
  const formEntry = { home: "FRA", away: "ARG" };
  const actualTeams = { home: "FRA", away: "ARG" };
  const r = alignPredictionToActual(pred, formEntry, actualTeams);
  assert(r.homeScore === 2 && r.awayScore === 1, "Same roles: unchanged");
}

console.log("--- 11. alignPredictionToActual: swapped roles (mirror) ---");
{
  // User's form has FRA as home, ARG as away, predicted FRA 2-1 ARG.
  // Actual bracket has ARG as home, FRA as away.
  // Display must show: home (ARG) scored 1, away (FRA) scored 2.
  const pred = { homeScore: 2, awayScore: 1 };
  const formEntry = { home: "FRA", away: "ARG" };
  const actualTeams = { home: "ARG", away: "FRA" };
  const r = alignPredictionToActual(pred, formEntry, actualTeams);
  assert(r.homeScore === 1, `Swapped home: expected 1 (ARG's goals), got ${r.homeScore}`);
  assert(r.awayScore === 2, `Swapped away: expected 2 (FRA's goals), got ${r.awayScore}`);
}

console.log("--- 12. alignPredictionToActual: advancingTeam preserved across swap ---");
{
  // Tie 1-1, user picked FRA to advance. After swap, FRA still advances.
  const pred = { homeScore: 1, awayScore: 1, advancingTeam: "FRA" };
  const formEntry = { home: "FRA", away: "ARG" };
  const actualTeams = { home: "ARG", away: "FRA" };
  const r = alignPredictionToActual(pred, formEntry, actualTeams);
  assert(r.homeScore === 1 && r.awayScore === 1, "Tie stays tie after swap");
  assert(r.advancingTeam === "FRA", `advancingTeam preserved, got ${r.advancingTeam}`);
}

console.log("--- 13. alignPredictionToActual: missing data ---");
{
  const r = alignPredictionToActual(null, null, null);
  assert(r.homeScore === null && r.awayScore === null, "Null pred -> nulls");
}
{
  const pred = { homeScore: 3, awayScore: 0 };
  const r = alignPredictionToActual(pred, null, { home: "A", away: "B" });
  assert(r.homeScore === 3 && r.awayScore === 0, "Null formEntry -> no swap");
}
{
  const pred = { homeScore: 3, awayScore: 0 };
  const r = alignPredictionToActual(pred, { home: "A", away: "B" }, null);
  assert(r.homeScore === 3 && r.awayScore === 0, "Null actualTeams -> no swap");
}
{
  const pred = { homeScore: 3, awayScore: 0 };
  const r = alignPredictionToActual(pred, { home: "A", away: "B" }, { home: null, away: "B" });
  assert(r.homeScore === 3 && r.awayScore === 0, "Missing actual home -> no swap");
}
{
  const pred = { homeScore: 3, awayScore: 0 };
  const r = alignPredictionToActual(pred, { home: "A", away: "B" }, { home: "A", away: null });
  assert(r.homeScore === 3 && r.awayScore === 0, "Missing actual away -> no swap");
}

console.log("--- 14. alignPredictionToActual: advancingTeam without scores ---");
{
  // Defensive: pred has advancingTeam even if scores are mid-entry.
  const pred = { homeScore: null, awayScore: null, advancingTeam: "FRA" };
  const r = alignPredictionToActual(pred, { home: "FRA", away: "ARG" }, { home: "FRA", away: "ARG" });
  assert(r.advancingTeam === "FRA", "advancingTeam preserved with null scores");
}

console.log("--- 15. alignPredictionToActual: zero scores handled ---");
{
  const pred = { homeScore: 0, awayScore: 0 };
  const r1 = alignPredictionToActual(pred, { home: "A", away: "B" }, { home: "A", away: "B" });
  assert(r1.homeScore === 0 && r1.awayScore === 0, "0-0 preserves identity");
  const r2 = alignPredictionToActual(pred, { home: "A", away: "B" }, { home: "B", away: "A" });
  assert(r2.homeScore === 0 && r2.awayScore === 0, "0-0 swap still 0-0");
}

console.log("--- 16. alignPredictionToActual: symmetry (swap twice = identity) ---");
{
  const pred = { homeScore: 3, awayScore: 1, advancingTeam: "A" };
  const formEntry = { home: "A", away: "B" };
  const swapped = alignPredictionToActual(pred, formEntry, { home: "B", away: "A" });
  // Now treat the swapped result as pred against a twice-swapped alignment
  const double = alignPredictionToActual(swapped, { home: "B", away: "A" }, { home: "A", away: "B" });
  assert(double.homeScore === pred.homeScore && double.awayScore === pred.awayScore, "Double swap returns identity");
  assert(double.advancingTeam === pred.advancingTeam, "advancingTeam stays through double swap");
}

console.log("--- 17. alignPredictionToActual: does not swap when only home differs ---");
{
  // Safety: if actualTeams.home matches formEntry.home, no swap regardless of away
  // (away mismatch would be caught by teamsMatch earlier; this tests alignment alone)
  const pred = { homeScore: 2, awayScore: 1 };
  const r = alignPredictionToActual(pred, { home: "A", away: "B" }, { home: "A", away: "C" });
  assert(r.homeScore === 2 && r.awayScore === 1, "Same home -> no swap even with bad away");
}

console.log("--- 18. alignPredictionToActual: advancingTeam integrity after swap ---");
{
  // User's form: home=X, away=Y, tied 0-0, advancing picked Y (the away team).
  // Actual: home=Y, away=X. After swap display, the advancing team is still Y.
  // Y now appears on the "home" side of the display, but the team code is
  // preserved so the UI will label it correctly by name.
  const pred = { homeScore: 0, awayScore: 0, advancingTeam: "Y" };
  const r = alignPredictionToActual(pred, { home: "X", away: "Y" }, { home: "Y", away: "X" });
  assert(r.advancingTeam === "Y", "advancingTeam code stays Y after swap");
}

// ========== Integration: AllForms.jsx:41 + MatchCard.jsx:205 convention ==========
// Existing pattern: <span dir="ltr">{awayScore} – {homeScore}</span>
// After alignment, the UI displays aligned.awayScore – aligned.homeScore.
// Verify that the mirror makes the dispayed score match the real match's
// home/away rendering.
console.log("--- 19. Display convention: score aligns with team positions ---");
{
  // Real match shows HOME team on right (Hebrew RTL), AWAY on left.
  // User predicted FRA 2-1 ARG in their form (home=FRA).
  // If actual match swaps (home=ARG), UI renders:
  //   Right side (home position) = ARG team label
  //   Left side (away position) = FRA team label
  //   Score span LTR: "{awayScore} – {homeScore}" (left to right)
  //     -> Left number (near AWAY team): should be FRA's goals = 2
  //     -> Right number (near HOME team): should be ARG's goals = 1
  // After alignPredictionToActual with swap: homeScore=1 (ARG), awayScore=2 (FRA).
  // Rendered: `{awayScore=2} – {homeScore=1}` -> "2 – 1" LTR.
  //   Left "2" = FRA goals, Right "1" = ARG goals. Correct.
  const pred = { homeScore: 2, awayScore: 1 }; // form: FRA 2-1 ARG
  const r = alignPredictionToActual(
    pred,
    { home: "FRA", away: "ARG" }, // form bracket
    { home: "ARG", away: "FRA" }, // actual bracket (swapped)
  );
  // In display: displayed as `{r.awayScore} – {r.homeScore}`
  // Left of dash = 2 (FRA's goals, visually near AWAY team = FRA). Correct.
  // Right of dash = 1 (ARG's goals, visually near HOME team = ARG). Correct.
  assert(r.awayScore === 2, "Display-left corresponds to FRA=2");
  assert(r.homeScore === 1, "Display-right corresponds to ARG=1");
}

console.log("--- 20. Display convention: non-swap case unchanged ---");
{
  const pred = { homeScore: 3, awayScore: 0 };
  const r = alignPredictionToActual(
    pred,
    { home: "BRA", away: "NED" },
    { home: "BRA", away: "NED" },
  );
  // Rendered: `0 – 3` LTR. Left 0 = NED, right 3 = BRA. Correct.
  assert(r.awayScore === 0, "NED's goals displayed on left");
  assert(r.homeScore === 3, "BRA's goals displayed on right");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  - " + f));
  process.exit(1);
}
