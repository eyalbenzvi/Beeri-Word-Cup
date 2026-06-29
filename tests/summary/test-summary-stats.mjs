// Tests src/utils/summaryStats.js — the per-match aggregation used by the
// daily-summary blog. Pure functions, no Firestore, straightforward to run.
import { computeMatchStats, computeFormDayAggregates } from "/home/user/Beeri-World-Cup/src/utils/summaryStats.js";
import { getGlobalSuggestions } from "/home/user/Beeri-World-Cup/src/utils/statStarters.js";

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
  // Key format is `${away}-${home}` so the home digit lands on the right
  // (visually adjacent to the home team) when rendered in the RTL document.
  assert(s.topScores[0].score === "1-2", `most common score is 1-2 (away-home), got ${s.topScores[0].score}`);
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
  // Key format is `${away}-${home}` (RTL-correct visual order).
  assert(s.topScores[0].score === "0-1" && s.topScores[0].count === 3, "0-1 (home wins 1-0) most common");
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

// ============ NEW: knockout matchup gating ============
// In a knockout slot ("R32-1" = "מנצחת 73"), different forms seat DIFFERENT
// teams. A form's score for that slot describes ITS predicted matchup, so the
// blog must count only forms whose bracket produced the matchup that actually
// happened. When actualBracketTeams + getFormBracketTeams are supplied, the
// aggregator filters knockout forms by bracket alignment (no-op for group ids).

// A getFormBracketTeams resolver for tests: each form carries its own
// `_bracket` map ({ matchId: { home, away } }).
const formBracket = (f) => f._bracket || {};

console.log("--- 24. knockout: only matching-matchup forms count ---");
{
  const allPredictions = {
    // Predicted BRA-ARG (the matchup that happened) — counts. Exact 2-1.
    f1: { ...mkForm("u1", { "R32-1": { homeScore: 2, awayScore: 1 } }, "submitted", "אלון"),
          _bracket: { "R32-1": { home: "BRA", away: "ARG" } } },
    // Predicted GER-FRA in this slot — DIFFERENT game — must be excluded even
    // though its score (2-1) equals the actual scoreline.
    f2: { ...mkForm("u2", { "R32-1": { homeScore: 2, awayScore: 1 } }, "submitted", "דנה"),
          _bracket: { "R32-1": { home: "GER", away: "FRA" } } },
    // Predicted BRA-ARG (matches) but a draw — counts toward totals, not exact.
    f3: { ...mkForm("u3", { "R32-1": { homeScore: 0, awayScore: 0 } }, "submitted", "יוסי"),
          _bracket: { "R32-1": { home: "BRA", away: "ARG" } } },
  };
  const args = {
    matchId: "R32-1",
    result: { homeScore: 2, awayScore: 1 },
    allPredictions,
    users: USERS,
    actualBracketTeams: { "R32-1": { home: "BRA", away: "ARG" } },
    getFormBracketTeams: formBracket,
  };
  const s = computeMatchStats(args);
  assert(s.totalForms === 2, `knockout: totalForms excludes wrong matchup, got ${s.totalForms}`);
  assert(s.exactHitCount === 1, `knockout: only the matching form is an exact hit, got ${s.exactHitCount}`);
  assert(s.exactHitForms[0]?.formName === "אלון", "knockout: exact hit is the BRA-ARG form");
  assert(s.outcomeCounts.home === 1 && s.outcomeCounts.draw === 1 && s.outcomeCounts.away === 0,
    `knockout: outcome counts only matching forms, got ${JSON.stringify(s.outcomeCounts)}`);

  // Without the bracket inputs, the OLD (buggy) behaviour: all 3 count, 2 exacts.
  const sNoGate = computeMatchStats({
    matchId: args.matchId, result: args.result, allPredictions, users: USERS,
  });
  assert(sNoGate.totalForms === 3, "no bracket inputs → unfiltered (back-compat)");
  assert(sNoGate.exactHitCount === 2, "no bracket inputs → counts wrong-matchup exact too");
}

console.log("--- 25. knockout: unresolved actual slot → no forms credited ---");
{
  const allPredictions = {
    f1: { ...mkForm("u1", { "R32-1": { homeScore: 2, awayScore: 1 } }, "submitted", "אלון"),
          _bracket: { "R32-1": { home: "BRA", away: "ARG" } } },
  };
  // actualBracketTeams has no entry for R32-1 (feeding results missing) → we
  // can't know the real teams, so nothing is attributed.
  const s = computeMatchStats({
    matchId: "R32-1",
    result: { homeScore: 2, awayScore: 1 },
    allPredictions,
    users: USERS,
    actualBracketTeams: {},
    getFormBracketTeams: formBracket,
  });
  assert(s.totalForms === 0, `unresolved actual slot → 0 forms, got ${s.totalForms}`);
  assert(s.exactHitCount === 0, "unresolved actual slot → 0 exacts");
}

console.log("--- 26. group match: bracket inputs are a no-op ---");
{
  const allPredictions = {
    // Even with a divergent _bracket, a GROUP id must never be filtered.
    f1: { ...mkForm("u1", { "group-A-1": { homeScore: 1, awayScore: 0 } }, "submitted", "אלון"),
          _bracket: { "group-A-1": { home: "XXX", away: "YYY" } } },
    f2: { ...mkForm("u2", { "group-A-1": { homeScore: 1, awayScore: 0 } }, "submitted", "דנה"),
          _bracket: {} },
  };
  const s = computeMatchStats({
    matchId: "group-A-1",
    result: { homeScore: 1, awayScore: 0 },
    allPredictions,
    users: USERS,
    actualBracketTeams: { "group-A-1": { home: "BRA", away: "ARG" } },
    getFormBracketTeams: formBracket,
  });
  assert(s.totalForms === 2, `group id: all forms counted despite brackets, got ${s.totalForms}`);
  assert(s.exactHitCount === 2, "group id: both forms are exact hits");
}

console.log("--- 27. knockout: underdogHeroes respects matchup gate ---");
{
  // 9 forms predicted BRA-ARG home win; 1 (רותם) predicted BRA-ARG away win.
  // Plus a wrong-matchup form that ALSO predicted an away win — it must not
  // pollute the underdog count or names.
  const allPredictions = {};
  for (let i = 1; i <= 9; i++) {
    allPredictions[`f${i}`] = {
      ...mkForm(`u${i}`, { "R32-1": { homeScore: 2, awayScore: 0 } }, "submitted", `H${i}`),
      _bracket: { "R32-1": { home: "BRA", away: "ARG" } },
    };
  }
  allPredictions["f10"] = {
    ...mkForm("u4", { "R32-1": { homeScore: 0, awayScore: 3 } }, "submitted", "רותם"),
    _bracket: { "R32-1": { home: "BRA", away: "ARG" } },
  };
  allPredictions["f11"] = {
    ...mkForm("u4", { "R32-1": { homeScore: 0, awayScore: 3 } }, "submitted", "מתחזה"),
    _bracket: { "R32-1": { home: "GER", away: "FRA" } },
  };
  const s = computeMatchStats({
    matchId: "R32-1",
    result: { homeScore: 0, awayScore: 1 },
    allPredictions,
    users: USERS,
    actualBracketTeams: { "R32-1": { home: "BRA", away: "ARG" } },
    getFormBracketTeams: formBracket,
  });
  assert(s.totalForms === 10, `underdog gate: totalForms excludes impostor, got ${s.totalForms}`);
  assert(s.underdogHeroes.length === 1, `underdog gate: 1 hero, got ${s.underdogHeroes.length}`);
  assert(s.underdogHeroes[0].formName === "רותם", "underdog gate: hero is רותם, not the impostor");
}

// ============ NEW: form-level day aggregates ============
// `computeFormDayAggregates` powers the new "who shone today" suggestions
// in the blog editor. It buckets per-match correctness up by formId across
// every covered match in the post and feeds the chips alongside the
// existing cross-match observations.

function mkMatch(id, stage = "group") {
  return { id, stage, group: "A", homeTeam: "BRA", awayTeam: "ARG" };
}

console.log("--- 18. form aggregates: empty inputs ---");
{
  const out = computeFormDayAggregates({ coveredMatches: [], allPredictions: {} });
  assert(Array.isArray(out) && out.length === 0, "empty input → empty array");
  const out2 = computeFormDayAggregates({
    coveredMatches: [{ match: mkMatch("m"), result: null }],
    allPredictions: { f1: mkForm("u1", { m: { homeScore: 1, awayScore: 0 } }) },
  });
  assert(out2.length === 0, "matches without result are skipped");
}

console.log("--- 19. form aggregates: scoring + sort order ---");
{
  // 3 group matches, 3 forms. Group stage points: outcome=1, exact=3 (additive).
  const matches = [
    { match: mkMatch("m1"), result: { homeScore: 1, awayScore: 0 } },
    { match: mkMatch("m2"), result: { homeScore: 2, awayScore: 2 } },
    { match: mkMatch("m3"), result: { homeScore: 0, awayScore: 3 } },
  ];
  const allPredictions = {
    // Form A: exact on m1 (4pts), exact on m2 (4pts), miss on m3 (0pts)  → 8 total
    fA: mkForm("uA", {
      m1: { homeScore: 1, awayScore: 0 },
      m2: { homeScore: 2, awayScore: 2 },
      m3: { homeScore: 1, awayScore: 1 },
    }, "submitted", "טופס A"),
    // Form B: exact on m1 (4pts), outcome on m2 (none, draw≠draw is fine; predicted 0-0=draw matches m2's 2-2 draw → 1pt), exact on m3 (4pts) → 9 total
    fB: mkForm("uB", {
      m1: { homeScore: 1, awayScore: 0 },
      m2: { homeScore: 0, awayScore: 0 },
      m3: { homeScore: 0, awayScore: 3 },
    }, "submitted", "טופס B"),
    // Form C: outcomes only — wrong on all 3 → 0 total
    fC: mkForm("uC", {
      m1: { homeScore: 0, awayScore: 1 },
      m2: { homeScore: 1, awayScore: 0 },
      m3: { homeScore: 1, awayScore: 0 },
    }, "submitted", "טופס C"),
  };
  const out = computeFormDayAggregates({ coveredMatches: matches, allPredictions });
  assert(out.length === 3, `expected 3 aggregates, got ${out.length}`);
  // sorted desc by points
  assert(out[0].formName === "טופס B", `top by points should be B, got ${out[0].formName}`);
  assert(out[0].totalPoints === 9, `top points = 9, got ${out[0].totalPoints}`);
  assert(out[0].exactCount === 2, `top exactCount = 2, got ${out[0].exactCount}`);
  assert(out[0].outcomeCount === 3, `top outcomeCount = 3 (all directions right), got ${out[0].outcomeCount}`);
  assert(out[0].perfectOutcome === true, "B got every direction right → perfectOutcome");
  assert(out[1].formName === "טופס A", `second is A, got ${out[1].formName}`);
  assert(out[1].totalPoints === 8, `A total = 8, got ${out[1].totalPoints}`);
  // C: wrong on all 3 directions, predicted all 3
  const c = out.find((f) => f.formName === "טופס C");
  assert(c.totalPoints === 0, "C total = 0");
  assert(c.outcomeCount === 0, "C outcomeCount = 0");
  assert(c.missedAllOutcome === true, "C predicted all 3 yet got 0 → missedAllOutcome");
}

console.log("--- 20. form aggregates: status filter + missing predictions ---");
{
  const matches = [
    { match: mkMatch("m1"), result: { homeScore: 1, awayScore: 0 } },
    { match: mkMatch("m2"), result: { homeScore: 1, awayScore: 0 } },
  ];
  const allPredictions = {
    // Submitted, but only predicted m1 → predictedCount = 1, not flagged perfect/zero
    fA: mkForm("uA", { m1: { homeScore: 1, awayScore: 0 } }, "submitted", "A"),
    // Draft → ignored
    fB: mkForm("uB", { m1: { homeScore: 1, awayScore: 0 }, m2: { homeScore: 1, awayScore: 0 } }, "draft", "B"),
  };
  const out = computeFormDayAggregates({ coveredMatches: matches, allPredictions });
  assert(out.length === 1, `only submitted forms appear, got ${out.length}`);
  assert(out[0].predictedCount === 1, `predictedCount counts only filled matches, got ${out[0].predictedCount}`);
  assert(out[0].perfectOutcome === false, "perfectOutcome requires filling EVERY covered match");
  assert(out[0].missedAllOutcome === false, "missedAllOutcome requires filling EVERY covered match");
}

console.log("--- 21. form aggregates: single-match day → no perfect/zero flags ---");
{
  const matches = [{ match: mkMatch("m1"), result: { homeScore: 1, awayScore: 0 } }];
  const allPredictions = {
    fA: mkForm("uA", { m1: { homeScore: 0, awayScore: 1 } }, "submitted", "A"),
  };
  const out = computeFormDayAggregates({ coveredMatches: matches, allPredictions });
  assert(out[0].missedAllOutcome === false, "missedAllOutcome only fires for 2+ match days");
  // perfectOutcome can fire with 1 match — but flag is mostly meaningful for multi-match
  // We don't assert false here; just ensure the structure holds.
  assert("perfectOutcome" in out[0], "perfectOutcome field present");
}

console.log("--- 22. global suggestions: form-level chip surfaces ---");
{
  const matches = [
    { match: mkMatch("m1"), result: { homeScore: 1, awayScore: 0 } },
    { match: mkMatch("m2"), result: { homeScore: 2, awayScore: 1 } },
  ];
  // Form-A nails both; rest miss outcome on both → expect day-top-points + zero chip.
  // The day-perfect-outcome chip is INTENTIONALLY suppressed here because the
  // only perfect form is also the day-top-points winner — naming the same
  // form on two adjacent chips reads as redundant praise. See the dedup
  // guard in statStarters.ts (`namedFormIds`).
  const allPredictions = {
    fA: mkForm("uA", {
      m1: { homeScore: 1, awayScore: 0 },
      m2: { homeScore: 2, awayScore: 1 },
    }, "submitted", "טופס מנצח"),
    fB: mkForm("uB", {
      m1: { homeScore: 0, awayScore: 1 },
      m2: { homeScore: 0, awayScore: 1 },
    }, "submitted", "טופס מפסיד"),
  };
  const sugg = getGlobalSuggestions({
    coveredMatches: matches,
    allPredictions,
    users: USERS,
  });
  const ids = sugg.map((s) => s.id);
  assert(ids.includes("day-top-points"), `expected day-top-points chip, got ${ids.join(",")}`);
  assert(!ids.includes("day-perfect-outcome"),
    `day-perfect-outcome chip should be deduped against day-top-points for the same form, got ${ids.join(",")}`);
  assert(ids.includes("day-zero-outcome"), `expected day-zero-outcome chip, got ${ids.join(",")}`);
  // The top-points chip should mention the winning form by name in its text.
  const topChip = sugg.find((s) => s.id === "day-top-points");
  assert(topChip.text.includes("טופס מנצח"), `top-points text should name the winner, got: ${topChip.text}`);
}

console.log("--- 22b. perfect-outcome chip surfaces when names diverge from top-points ---");
{
  // 2 group matches. Form-A has 1 exact + 1 outcome (4+1=5pts, perfect outcomes).
  // Form-B has 2 exacts (4+4=8pts, perfect outcomes) — the day's top-points winner.
  // Both are perfect-outcome forms but multi-form (length=2), so the chip is
  // a multi-name observation that ADDS info on top of day-top-points naming
  // only the leader → keep it.
  const matches = [
    { match: mkMatch("m1"), result: { homeScore: 1, awayScore: 0 } },
    { match: mkMatch("m2"), result: { homeScore: 2, awayScore: 1 } },
  ];
  const allPredictions = {
    fA: mkForm("uA", {
      m1: { homeScore: 1, awayScore: 0 }, // exact
      m2: { homeScore: 3, awayScore: 0 }, // outcome only (home wins)
    }, "submitted", "טופס א"),
    fB: mkForm("uB", {
      m1: { homeScore: 1, awayScore: 0 },
      m2: { homeScore: 2, awayScore: 1 },
    }, "submitted", "טופס ב"),
  };
  const sugg = getGlobalSuggestions({
    coveredMatches: matches,
    allPredictions,
    users: USERS,
  });
  const ids = sugg.map((s) => s.id);
  assert(ids.includes("day-top-points"), `expected day-top-points, got ${ids.join(",")}`);
  assert(ids.includes("day-perfect-outcome"),
    `expected day-perfect-outcome chip when 2 forms share perfect outcome, got ${ids.join(",")}`);
}

console.log("--- 22c. exact-hits chip handles ties (mirrors top-points behaviour) ---");
{
  // 3 group matches; 4 forms all tie at exactly 2 exacts each.
  // top-points may also tie; either way, the day-top-exact chip should
  // either name all 4 (it won't, since cap is 3) or be SUPPRESSED — never
  // single out one of them and pretend they were alone.
  const matches = [
    { match: mkMatch("m1"), result: { homeScore: 1, awayScore: 0 } },
    { match: mkMatch("m2"), result: { homeScore: 2, awayScore: 1 } },
    { match: mkMatch("m3"), result: { homeScore: 0, awayScore: 0 } },
  ];
  const exact = (m1, m2) => ({
    m1: { homeScore: 1, awayScore: 0 },
    m2: { homeScore: 2, awayScore: 1 },
    m3: { homeScore: m1, awayScore: m2 }, // miss m3 to keep exactCount = 2
  });
  const allPredictions = {
    f1: mkForm("u1", exact(1, 0), "submitted", "T1"),
    f2: mkForm("u2", exact(2, 0), "submitted", "T2"),
    f3: mkForm("u3", exact(3, 0), "submitted", "T3"),
    f4: mkForm("u4", exact(4, 0), "submitted", "T4"),
  };
  const sugg = getGlobalSuggestions({
    coveredMatches: matches,
    allPredictions,
    users: USERS,
  });
  const exactChip = sugg.find((s) => s.id === "day-top-exact");
  // Tied at 4 forms → exceeds cap=3, so the chip is suppressed entirely.
  assert(!exactChip,
    `4-way tie on exact-hits should suppress the chip (cap=3); got ${exactChip?.text}`);
}

console.log("--- 23. global suggestions: tied leaders → no individual chip ---");
{
  // 5 forms all on 1 outcome point on a single match; nobody stands out
  const matches = [{ match: mkMatch("m"), result: { homeScore: 1, awayScore: 0 } }];
  const allPredictions = {};
  for (let i = 1; i <= 5; i++) {
    allPredictions[`f${i}`] = mkForm(`u${i}`, { m: { homeScore: 1, awayScore: 0 } }, "submitted", `T${i}`);
  }
  const sugg = getGlobalSuggestions({
    coveredMatches: matches,
    allPredictions,
    users: USERS,
  });
  const top = sugg.find((s) => s.id === "day-top-points");
  // 5-way tie at top → suppressed (only mention if ≤3 leaders)
  assert(!top, `day-top-points should be suppressed for 5-way tie, got ${top?.text}`);
}

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
process.exit(0);
