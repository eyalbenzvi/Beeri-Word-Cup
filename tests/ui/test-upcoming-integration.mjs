// End-to-end integration tests for the Upcoming Matches feature.
//
// Exercises the full pipeline:
//   selectUpcomingMatches -> resolveMatchTeams -> teamsMatch -> alignPredictionToActual
//
// Using realistic fixtures: a user with multiple forms, group + knockout
// matches, partial actual results driving the bracket forward.

import { selectUpcomingMatches } from "/home/user/Beeri-World-Cup/src/utils/upcomingMatches.js";
import {
  teamsMatch,
  resolveMatchTeams,
  alignPredictionToActual,
} from "/home/user/Beeri-World-Cup/src/utils/predictionAlign.js";
import { calcBracketTeams } from "/home/user/Beeri-World-Cup/src/utils/bracket.js";
import { ALL_MATCHES, groupMatches } from "/home/user/Beeri-World-Cup/src/data/matches.js";
import { getMatchKickoffUTC } from "/home/user/Beeri-World-Cup/src/utils/matchTime.js";
import { isScoreValid } from "/home/user/Beeri-World-Cup/src/utils/helpers.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== UPCOMING MATCHES INTEGRATION TESTS ===\n");

// ===== Fixture: a simple 72-match group prediction set =====
// Fills every group match with a deterministic result so we get a complete
// bracket when feeding into calcBracketTeams.
function buildFullGroupPredictions(tweak = {}) {
  const preds = {};
  for (const m of groupMatches) {
    // Deterministic: hash-based, but avoid 0-0 so outcomes are definite.
    const h = (m.fifaMatch * 7) % 3;
    const a = (m.fifaMatch * 5) % 3;
    preds[m.id] = { homeScore: h, awayScore: h === a ? h + 1 : a };
  }
  return { ...preds, ...tweak };
}

// ---- 1. User with no forms: widget shows matches only ----
console.log("--- 1. No forms ---");
{
  const matches = selectUpcomingMatches(ALL_MATCHES, {}, Date.UTC(2026, 5, 1, 0, 0));
  assert(matches.length >= 1, "Matches returned");
  // simulate "no user" -> PredictionsList not rendered, matches still shown
  // (the selector itself is indifferent to user; this is a sanity check)
}

// ---- 2. Single form, group match, valid prediction ----
console.log("--- 2. Single form, group match ---");
{
  const match = groupMatches[0]; // Jun 11
  const forms = [
    {
      formId: "u1__1",
      formName: "טופס ראשי",
      matches: { [match.id]: { homeScore: 2, awayScore: 1 } },
    },
  ];
  const pred = forms[0].matches[match.id];
  assert(isScoreValid(pred), "Prediction valid");
  // Group: actualTeams taken directly from match
  const actualTeams = resolveMatchTeams(match, {});
  assert(actualTeams.home === match.homeTeam, "Group home direct");
  assert(actualTeams.away === match.awayTeam, "Group away direct");
  // No alignment needed for group — formBracket ignored
  const aligned = alignPredictionToActual(pred, null, actualTeams);
  assert(aligned.homeScore === 2 && aligned.awayScore === 1, "Group no swap");
}

// ---- 3. Knockout match: user + actual brackets agree ----
console.log("--- 3. Knockout, brackets agree ---");
{
  // Build a full-group prediction set so the user's bracket resolves R32
  const userMatches = buildFullGroupPredictions();
  const userBracket = calcBracketTeams(userMatches);
  const r32Match = { id: "R32-1", stage: "R32" };
  // Use the same predictions as the actual results for simplicity -> same bracket
  const actualResults = { ...userMatches };
  const actualBracket = calcBracketTeams(actualResults);
  assert(
    userBracket["R32-1"].home === actualBracket["R32-1"].home,
    "User + actual brackets agree on R32-1 home"
  );
  assert(
    teamsMatch(userBracket["R32-1"], actualBracket["R32-1"]),
    "teamsMatch: identical brackets"
  );
  // User predicted R32-1 result: 1-0
  userMatches["R32-1"] = { homeScore: 1, awayScore: 0 };
  const aligned = alignPredictionToActual(
    userMatches["R32-1"],
    userBracket["R32-1"],
    actualBracket["R32-1"],
  );
  assert(aligned.homeScore === 1 && aligned.awayScore === 0, "No mirror when same roles");
}

// ---- 4. Knockout match: roles swapped between user and actual ----
console.log("--- 4. Knockout, roles swapped ---");
{
  const teamA = "TEAM_A", teamB = "TEAM_B";
  // User's bracket slot: A home, B away. Predicted A 3-1 B.
  // Actual bracket slot: B home, A away (swapped).
  // Expected display after alignment:
  //   homeScore represents B's goals = 1
  //   awayScore represents A's goals = 3
  const pred = { homeScore: 3, awayScore: 1 };
  const formEntry = { home: teamA, away: teamB };
  const actualTeams = { home: teamB, away: teamA };
  assert(teamsMatch(formEntry, actualTeams), "Set equality despite swap");
  const aligned = alignPredictionToActual(pred, formEntry, actualTeams);
  assert(aligned.homeScore === 1, `home = B's goals = 1, got ${aligned.homeScore}`);
  assert(aligned.awayScore === 3, `away = A's goals = 3, got ${aligned.awayScore}`);
}

// ---- 5. Knockout tie with advancingTeam, swapped ----
console.log("--- 5. Knockout tie + advancing after swap ---");
{
  // User's form: A home, B away, predicted 1-1, A wins on penalties.
  // Actual bracket: B home, A away.
  const pred = { homeScore: 1, awayScore: 1, advancingTeam: "A" };
  const formEntry = { home: "A", away: "B" };
  const actualTeams = { home: "B", away: "A" };
  const aligned = alignPredictionToActual(pred, formEntry, actualTeams);
  assert(aligned.homeScore === 1 && aligned.awayScore === 1, "Tie unchanged");
  assert(aligned.advancingTeam === "A", "Advancing code preserved — still A");
}

// ---- 6. Bracket mismatch (different teams entirely) -> should be treated as no-show ----
console.log("--- 6. Bracket mismatch (different teams) ---");
{
  const formEntry = { home: "FRA", away: "ARG" };
  const actualTeams = { home: "ESP", away: "POR" };
  assert(!teamsMatch(formEntry, actualTeams), "Different teams -> no match");
  // Caller's responsibility: when teamsMatch is false, don't show prediction.
  // Verify that even if alignment were called, it wouldn't swap.
  const pred = { homeScore: 2, awayScore: 1 };
  const aligned = alignPredictionToActual(pred, formEntry, actualTeams);
  // formEntry.home="FRA" !== actualTeams.home="ESP" AND !== actualTeams.away="POR"
  // -> falls through to no-swap branch (by design)
  assert(aligned.homeScore === 2 && aligned.awayScore === 1, "Unrelated teams -> no swap");
}

// ---- 7. Multiple forms per user, same match, different predictions ----
console.log("--- 7. Multiple forms, same match ---");
{
  const match = groupMatches[0];
  const forms = [
    { formId: "u__1", formName: "שמרני", matches: { [match.id]: { homeScore: 1, awayScore: 0 } } },
    { formId: "u__2", formName: "אופטימי", matches: { [match.id]: { homeScore: 3, awayScore: 0 } } },
    { formId: "u__3", formName: "שוויון", matches: { [match.id]: { homeScore: 1, awayScore: 1 } } },
    { formId: "u__4", formName: "בלי ניחוש", matches: {} },
    { formId: "u__5", formName: "לא תקין", matches: { [match.id]: { homeScore: null, awayScore: 2 } } },
  ];
  // Validate each
  assert(isScoreValid(forms[0].matches[match.id]) === true, "form 1 valid");
  assert(isScoreValid(forms[3].matches[match.id]) === false, "form 4 no prediction");
  assert(isScoreValid(forms[4].matches[match.id]) === false, "form 5 null home");
}

// ---- 8. Knockout with multiple forms: each has distinct brackets ----
console.log("--- 8. Multiple forms with distinct brackets ---");
{
  // Simulate two users' predictions produce different brackets
  const preds1 = buildFullGroupPredictions({ "group-A-1": { homeScore: 5, awayScore: 0 } });
  const preds2 = buildFullGroupPredictions({ "group-A-1": { homeScore: 0, awayScore: 5 } });
  const bracket1 = calcBracketTeams(preds1);
  const bracket2 = calcBracketTeams(preds2);
  // They should differ somewhere in the knockout
  const keys = Object.keys(bracket1);
  const anyDiff = keys.some((k) =>
    bracket1[k]?.home !== bracket2[k]?.home || bracket1[k]?.away !== bracket2[k]?.away
  );
  assert(anyDiff, "Different group predictions produce different brackets");
}

// ---- 9. Day clustering with 4 matches ----
console.log("--- 9. Day with 4 matches ---");
{
  // Jun 14 has ~4 matches in Israel time
  const now = Date.UTC(2026, 5, 13, 21, 0, 0); // Jun 14 00:00 Israel
  const result = selectUpcomingMatches(ALL_MATCHES, {}, now);
  assert(result.length >= 4, `Jun 14 has 4+ matches, got ${result.length}`);
  // Kickoffs should be strictly increasing
  for (let i = 1; i < result.length; i++) {
    assert(
      getMatchKickoffUTC(result[i - 1]) < getMatchKickoffUTC(result[i]),
      `Strict order at index ${i}`,
    );
  }
}

// ---- 10. No actual results at all: bracket is empty ----
console.log("--- 10. No actual results -> empty bracket ---");
{
  const bracket = calcBracketTeams({});
  // calcBracketTeams returns {} when no group predictions exist.
  assert(
    !bracket["R32-1"] || !bracket["R32-1"].home,
    "No actual results -> R32-1 has no home team",
  );
  // Widget behavior for a knockout match without resolved teams:
  // FormPredictionRow flags bracketMismatch=true and hides the prediction.
  // Verified by alignPredictionToActual no-swap-when-incomplete tests.
}

// ---- 11. Full simulation: selector returns R32 matches on Jun 28 when groups done ----
console.log("--- 11. Full simulation: transition to knockout ---");
{
  const allGroupResults = {};
  for (const m of groupMatches) {
    allGroupResults[m.id] = { homeScore: 1, awayScore: 0 };
  }
  const now = Date.UTC(2026, 5, 27, 12, 0, 0); // Jun 27 15:00 Israel, near end of groups
  const result = selectUpcomingMatches(ALL_MATCHES, allGroupResults, now);
  // Should be R32 matches (first R32 is Jun 28)
  assert(result.length > 0, "Returns matches");
  assert(result.every((m) => m.stage !== "group"), "All returned are knockout");
}

// ---- 12. Form with invalid (half-filled) prediction is treated as no prediction ----
console.log("--- 12. Half-filled prediction -> invalid ---");
{
  const invalid = { homeScore: 2 }; // missing awayScore
  assert(!isScoreValid(invalid), "Missing awayScore -> invalid");
  const alsoInvalid = { homeScore: "", awayScore: 1 };
  assert(!isScoreValid(alsoInvalid), "Empty string score -> invalid");
}

// ---- 13. Widget key consistency (all matches have ids) ----
console.log("--- 13. All matches have unique ids ---");
{
  const ids = new Set();
  for (const m of ALL_MATCHES) {
    assert(m.id, `Match has id`);
    assert(!ids.has(m.id), `Duplicate id: ${m.id}`);
    ids.add(m.id);
  }
  assert(ids.size === ALL_MATCHES.length, "All ids unique");
}

// ---- 14. Heading date label integration ----
console.log("--- 14. Heading date label ---");
{
  const { formatIsraelDateLabel } = await import("/home/user/Beeri-World-Cup/src/utils/matchTime.js");
  const matches = selectUpcomingMatches(ALL_MATCHES, {}, Date.UTC(2026, 5, 13, 21, 0));
  assert(matches.length > 0, "Matches found");
  const label = formatIsraelDateLabel(matches[0]);
  assert(label === "14.6", `Jun 14 -> "14.6", got "${label}"`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  - " + f));
  process.exit(1);
}
