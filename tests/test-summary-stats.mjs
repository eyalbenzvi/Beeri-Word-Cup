// Tests src/utils/summaryStats.js — the per-match aggregation used by the
// daily-summary blog. Pure functions, no Firestore, straightforward to run.
import { computeMatchStats } from "/home/user/Beeri-World-Cup/src/utils/summaryStats.js";

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error("  FAIL: " + msg); }
}

console.log("=== SUMMARY STATS TESTS ===\n");

// --- helpers ---
function mkForm(userId, matches, status = "submitted", formName = "") {
  return {
    userId,
    formName,
    status,
    matches,
  };
}

const USERS = {
  u1: { id: "u1", displayName: "אלון" },
  u2: { id: "u2", displayName: "דנה" },
  u3: { id: "u3", displayName: "יוסי" },
  u4: { id: "u4", displayName: "רותם" },
};

// ============ 1. empty inputs ============
console.log("--- 1. no forms, no result ---");
{
  const s = computeMatchStats({
    matchId: "group-A-1",
    result: null,
    allPredictions: {},
    users: {},
  });
  assert(s.totalForms === 0, "totalForms === 0 when no predictions");
  assert(s.outcomeCounts.home === 0 && s.outcomeCounts.draw === 0 && s.outcomeCounts.away === 0,
    "all outcome counts zero");
  assert(Array.isArray(s.topScores) && s.topScores.length === 0, "no top scores");
  assert(s.exactHitCount === 0, "no exact hits");
  assert(s.actual === null, "actual is null when no result");
  assert(s.outcomeHitPct === 0, "outcome hit pct is 0 with no forms");
}

// ============ 2. result with mixed predictions ============
console.log("--- 2. mixed predictions, full result ---");
{
  const allPredictions = {
    f1: mkForm("u1", { "match1": { homeScore: 2, awayScore: 1 } }),
    f2: mkForm("u2", { "match1": { homeScore: 2, awayScore: 1 } }),
    f3: mkForm("u3", { "match1": { homeScore: 1, awayScore: 1 } }),
    f4: mkForm("u4", { "match1": { homeScore: 0, awayScore: 3 } }),
  };
  const s = computeMatchStats({
    matchId: "match1",
    result: { homeScore: 2, awayScore: 1 },
    allPredictions,
    users: USERS,
  });
  assert(s.totalForms === 4, "total forms is 4");
  assert(s.outcomeCounts.home === 2, `expected 2 home, got ${s.outcomeCounts.home}`);
  assert(s.outcomeCounts.draw === 1, `expected 1 draw, got ${s.outcomeCounts.draw}`);
  assert(s.outcomeCounts.away === 1, `expected 1 away, got ${s.outcomeCounts.away}`);
  assert(s.exactHitCount === 2, `expected 2 exact hits, got ${s.exactHitCount}`);
  assert(s.exactHitForms.length === 2, "exact hit forms array length");
  assert(s.exactHitForms.some((f) => f.userId === "u1"), "u1 is in exact hits");
  assert(s.exactHitForms.some((f) => f.userId === "u2"), "u2 is in exact hits");
  assert(s.outcomeHitCount === 2, `expected 2 outcome hits, got ${s.outcomeHitCount}`);
  assert(s.actual.outcome === "home", `actual outcome should be home, got ${s.actual.outcome}`);
  assert(s.topScores[0].score === "2-1", `most common score is 2-1, got ${s.topScores[0].score}`);
  assert(s.topScores[0].count === 2, "top score count 2");
  assert(s.actualScoreCount === 2, "actualScoreCount is 2 (same as exact hits)");
  // Percentages
  assert(s.outcomePct.home === 50, `home pct 50, got ${s.outcomePct.home}`);
  assert(s.outcomePct.draw === 25, `draw pct 25, got ${s.outcomePct.draw}`);
  assert(s.outcomePct.away === 25, `away pct 25, got ${s.outcomePct.away}`);
  assert(s.outcomeHitPct === 50, "outcome hit pct 50");
}

// ============ 3. only submitted/approved forms count ============
console.log("--- 3. status filter: drafts/pending excluded ---");
{
  const allPredictions = {
    f1: mkForm("u1", { "m": { homeScore: 1, awayScore: 0 } }, "submitted"),
    f2: mkForm("u2", { "m": { homeScore: 0, awayScore: 1 } }, "pending"), // excluded
    f3: mkForm("u3", { "m": { homeScore: 1, awayScore: 0 } }, "draft"),   // excluded
    f4: mkForm("u4", { "m": { homeScore: 1, awayScore: 0 } }, "approved"),
  };
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 1, awayScore: 0 },
    allPredictions,
    users: USERS,
  });
  assert(s.totalForms === 2, `only submitted+approved counted, got ${s.totalForms}`);
  assert(s.exactHitCount === 2, "both submitted got exact hits");
}

// ============ 4. forms without a prediction for this match ============
console.log("--- 4. forms missing this match prediction ---");
{
  const allPredictions = {
    f1: mkForm("u1", { "other": { homeScore: 1, awayScore: 0 } }), // no prediction for target match
    f2: mkForm("u2", { "m": { homeScore: 1, awayScore: 0 } }),
  };
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 1, awayScore: 0 },
    allPredictions,
    users: USERS,
  });
  assert(s.totalForms === 2, "totalForms still counts submitted forms");
  assert(s.outcomeCounts.home === 1, "only f2 contributes outcome");
  assert(s.exactHitCount === 1, "only f2 is an exact hit");
}

// ============ 5. result without actual data (pre-tournament case) ============
console.log("--- 5. no result yet ---");
{
  const allPredictions = {
    f1: mkForm("u1", { "m": { homeScore: 2, awayScore: 1 } }),
    f2: mkForm("u2", { "m": { homeScore: 1, awayScore: 1 } }),
  };
  const s = computeMatchStats({
    matchId: "m",
    result: null,
    allPredictions,
    users: USERS,
  });
  assert(s.actual === null, "actual is null");
  assert(s.exactHitCount === 0, "no exact hits without actual");
  assert(s.outcomeHitCount === 0, "no outcome hits without actual");
  assert(s.topScores.length === 2, "top scores still aggregated");
  assert(s.outcomeCounts.home === 1, "outcome counts still computed");
}

// ============ 6. malformed predictions are ignored ============
console.log("--- 6. malformed predictions ignored ---");
{
  const allPredictions = {
    f1: mkForm("u1", { "m": { homeScore: "foo", awayScore: 1 } }),  // NaN home
    f2: mkForm("u2", { "m": null }),                                 // null entry
    f3: mkForm("u3", { "m": { homeScore: 2, awayScore: 1 } }),
  };
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 2, awayScore: 1 },
    allPredictions,
    users: USERS,
  });
  assert(s.totalForms === 3, "all 3 submitted counted as totalForms");
  assert(s.outcomeCounts.home === 1, "only f3 has valid outcome");
  assert(s.exactHitCount === 1, "only f3 is an exact hit");
}

// ============ 7. top 3 scores slicing ============
console.log("--- 7. top 3 scores, sorted descending ---");
{
  const allPredictions = {
    f1: mkForm("u1", { "m": { homeScore: 1, awayScore: 0 } }),
    f2: mkForm("u2", { "m": { homeScore: 1, awayScore: 0 } }),
    f3: mkForm("u3", { "m": { homeScore: 1, awayScore: 0 } }),
    f4: mkForm("u4", { "m": { homeScore: 2, awayScore: 2 } }),
    f5: mkForm("u1", { "m": { homeScore: 2, awayScore: 2 } }),
    f6: mkForm("u2", { "m": { homeScore: 0, awayScore: 0 } }),
    f7: mkForm("u3", { "m": { homeScore: 3, awayScore: 1 } }),
  };
  const s = computeMatchStats({
    matchId: "m",
    result: null,
    allPredictions,
    users: USERS,
  });
  assert(s.topScores.length === 3, "top scores capped at 3");
  assert(s.topScores[0].score === "1-0" && s.topScores[0].count === 3, "1-0 most common");
  assert(s.topScores[1].score === "2-2" && s.topScores[1].count === 2, "2-2 second");
}

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
process.exit(0);
