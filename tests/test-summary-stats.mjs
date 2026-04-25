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

// ============ NEW: editorial / piquancy hooks ============
// Hooks added for the suggestion panel in the admin editor. They power the
// "💡 רעיונות פיקנטיים" chips. Defaults (no result / no forms) must be safe.

console.log("--- 7. piquancy hooks: defaults (no result) ---");
{
  const s = computeMatchStats({
    matchId: "m",
    result: null,
    allPredictions: { f1: mkForm("u1", { m: { homeScore: 1, awayScore: 0 } }, "submitted", "טופס א") },
    users: USERS,
  });
  assert(Array.isArray(s.lonePicks) && s.lonePicks.length === 0, "lonePicks empty pre-match");
  assert(s.consensusFlop === null, "consensusFlop null pre-match");
  assert(Array.isArray(s.underdogHeroes) && s.underdogHeroes.length === 0, "underdogHeroes empty pre-match");
  assert(s.wasUnpredictable === false, "wasUnpredictable false pre-match");
}

console.log("--- 8. lonePicks: 1 form nailed it ---");
{
  // 5 forms, only one predicted exact 2-1 (which is the actual result)
  const allPredictions = {
    f1: mkForm("u1", { m: { homeScore: 1, awayScore: 0 } }, "submitted", "אלון"),
    f2: mkForm("u2", { m: { homeScore: 2, awayScore: 1 } }, "submitted", "דנה"),
    f3: mkForm("u3", { m: { homeScore: 1, awayScore: 1 } }, "submitted", "יוסי"),
    f4: mkForm("u4", { m: { homeScore: 0, awayScore: 0 } }, "submitted", "רותם"),
    f5: mkForm("u1", { m: { homeScore: 3, awayScore: 0 } }, "submitted", "אלון2"),
  };
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 2, awayScore: 1 },
    allPredictions,
    users: USERS,
  });
  assert(s.lonePicks.length === 1, "lonePicks has 1 entry");
  assert(s.lonePicks[0].formName === "דנה", "lonePicks names דנה");
}

console.log("--- 9. lonePicks: too many exact hits (>3) → empty ---");
{
  // 5 forms all picked the actual scoreline — not "lone" anymore
  const allPredictions = {};
  for (let i = 1; i <= 5; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 1, awayScore: 0 } }, "submitted", `טופס ${i}`);
  }
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 1, awayScore: 0 },
    allPredictions,
    users: USERS,
  });
  assert(s.lonePicks.length === 0, "lonePicks empty when >3 hit exact");
  assert(s.exactHitCount === 5, "but exactHitCount still 5");
}

console.log("--- 10. consensusFlop: 80% picked wrong outcome ---");
{
  // 10 forms: 8 said home win, 2 said away win. Actual: away win.
  const allPredictions = {};
  for (let i = 1; i <= 8; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 2, awayScore: 0 } }, "submitted", `H${i}`);
  }
  for (let i = 9; i <= 10; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 0, awayScore: 1 } }, "submitted", `A${i}`);
  }
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 0, awayScore: 2 },
    allPredictions,
    users: USERS,
  });
  assert(s.consensusFlop !== null, "consensusFlop fires");
  assert(s.consensusFlop.actualOutcome === "away", "consensusFlop tracks actual outcome");
  assert(s.consensusFlop.missPct >= 70, `consensusFlop missPct ≥ 70 (got ${s.consensusFlop?.missPct})`);
}

console.log("--- 11. consensusFlop: only 50% wrong → does NOT fire ---");
{
  const allPredictions = {
    f1: mkForm("u1", { m: { homeScore: 1, awayScore: 0 } }, "submitted", "א"),
    f2: mkForm("u2", { m: { homeScore: 0, awayScore: 1 } }, "submitted", "ב"),
  };
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 1, awayScore: 0 },
    allPredictions,
    users: USERS,
  });
  assert(s.consensusFlop === null, "consensusFlop does not fire at 50% miss");
}

console.log("--- 12. underdogHeroes: minority outcome was right ---");
{
  // 10 forms: 9 picked home win, 1 picked away win. Actual: away win.
  const allPredictions = {};
  for (let i = 1; i <= 9; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 2, awayScore: 0 } }, "submitted", `H${i}`);
  }
  allPredictions["f10"] = mkForm("u4", { m: { homeScore: 0, awayScore: 3 } }, "submitted", "רותם");
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 0, awayScore: 1 },
    allPredictions,
    users: USERS,
  });
  assert(s.underdogHeroes.length === 1, `underdogHeroes has 1 (got ${s.underdogHeroes.length})`);
  assert(s.underdogHeroes[0].formName === "רותם", "underdogHeroes names רותם");
}

console.log("--- 13. underdogHeroes: actual outcome was popular → empty ---");
{
  // 8 picked home, actual was home → no underdog story
  const allPredictions = {};
  for (let i = 1; i <= 8; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 1, awayScore: 0 } }, "submitted", `H${i}`);
  }
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 2, awayScore: 0 },
    allPredictions,
    users: USERS,
  });
  assert(s.underdogHeroes.length === 0, "underdogHeroes empty when actual was popular");
}

console.log("--- 14. wasUnpredictable: underdog AND ≤2 exacts ---");
{
  // 10 forms: 9 picked home, 1 picked away (rotem). Actual: away 0-1. Only rotem matches outcome (and exact).
  const allPredictions = {};
  for (let i = 1; i <= 9; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 1, awayScore: 0 } }, "submitted", `H${i}`);
  }
  allPredictions["f10"] = mkForm("u4", { m: { homeScore: 0, awayScore: 1 } }, "submitted", "רותם");
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 0, awayScore: 1 },
    allPredictions,
    users: USERS,
  });
  assert(s.wasUnpredictable === true, "wasUnpredictable true for underdog+lone-exact");
}

console.log("--- 15. wasUnpredictable: underdog but many exacts → false ---");
{
  // Edge: hypothetically 3 forms picked exact "0-1" away but only because they were the underdog group.
  // Actually here we just test that >2 exacts kills the unpredictable flag.
  const allPredictions = {};
  for (let i = 1; i <= 7; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 1, awayScore: 0 } }, "submitted", `H${i}`);
  }
  // 3 forms picked exact 0-1
  for (let i = 8; i <= 10; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 0, awayScore: 1 } }, "submitted", `A${i}`);
  }
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 0, awayScore: 1 },
    allPredictions,
    users: USERS,
  });
  // 3/10 = 30% which is ≥ 25% (underdogOutcomePct threshold) → underdog won't fire
  // Even if it did, 3 exacts > 2 unpredictableExactMax → still false
  assert(s.wasUnpredictable === false, "wasUnpredictable false with many exacts");
}

console.log("--- 16. underdogHeroes: capped at 5 ---");
{
  // 100 forms picked home win, 6 picked away win. Actual: away win.
  // Underdog at 6/106 ≈ 5.7% < 25%, so underdogHeroes should fire and cap at 5.
  const allPredictions = {};
  for (let i = 1; i <= 100; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i % 4 + 1}`, { m: { homeScore: 1, awayScore: 0 } }, "submitted", `H${i}`);
  }
  for (let i = 101; i <= 106; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i % 4 + 1}`, { m: { homeScore: 0, awayScore: 2 } }, "submitted", `A${i}`);
  }
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 0, awayScore: 1 },
    allPredictions,
    users: USERS,
  });
  assert(s.underdogHeroes.length === 5, `underdogHeroes capped at 5 (got ${s.underdogHeroes.length})`);
}

console.log("--- 17. backwards compat: existing fields untouched ---");
{
  // Sanity: the new fields don't break the old shape.
  const s = computeMatchStats({
    matchId: "m",
    result: { homeScore: 1, awayScore: 0 },
    allPredictions: {
      f1: mkForm("u1", { m: { homeScore: 1, awayScore: 0 } }, "submitted", "א"),
    },
    users: USERS,
  });
  assert("totalForms" in s, "still has totalForms");
  assert("outcomeCounts" in s, "still has outcomeCounts");
  assert("outcomePct" in s, "still has outcomePct");
  assert("topScores" in s, "still has topScores");
  assert("exactHitCount" in s, "still has exactHitCount");
  assert("exactHitForms" in s, "still has exactHitForms");
  assert("outcomeHitCount" in s, "still has outcomeHitCount");
  assert("actual" in s, "still has actual");
  assert("actualScoreCount" in s, "still has actualScoreCount");
  assert("actualScorePct" in s, "still has actualScorePct");
}

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
process.exit(0);
