// Unit tests for the two-source auto-fill consensus logic.
// Pure module (no network, no firebase) — imported directly.

import { computeConsensus, decideSingleSource } from "../../netlify/functions/_sources/consensus.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }
function eq(a, b, m) { assert(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

console.log("=== AUTO-FILL CONSENSUS TESTS ===\n");

const groupExpected = { matchId: "group-A-1", isKnockout: false, homeTeam: "MEX", awayTeam: "RSA" };
const koExpected = { matchId: "R32-1", isKnockout: true, homeTeam: "ESP", awayTeam: "GER" };

function fd(over = {}) {
  return {
    name: "football-data", error: false, finished: true,
    home90: 2, away90: 1, homeCode: "MEX", awayCode: "RSA",
    advancingTeam: null, duration: "REGULAR", regulationAmbiguous: false,
    ...over,
  };
}
function as(over = {}) {
  return {
    name: "api-sports", error: false, finished: true,
    home90: 2, away90: 1, homeCode: "MEX", awayCode: "RSA",
    advancingTeam: null, duration: "FT", regulationAmbiguous: false,
    ...over,
  };
}

// --- 1. Happy path: both finished + agree ---
{
  const r = computeConsensus(groupExpected, [fd(), as()]);
  eq(r.decision, "agreed", "happy path -> agreed");
  eq(r.homeScore, 2, "happy path home score");
  eq(r.awayScore, 1, "happy path away score");
  eq(r.advancingTeam, null, "group has no advancing team");
}

// --- 2. One FINISHED + other IN_PLAY (not finished) ---
{
  const r = computeConsensus(groupExpected, [fd(), as({ finished: false })]);
  eq(r.decision, "not-finished", "one source still in play -> not-finished");
}

// --- 3. Disagreement on score ---
{
  const r = computeConsensus(groupExpected, [fd({ home90: 2 }), as({ home90: 3 })]);
  eq(r.decision, "disagree", "score mismatch -> disagree");
}

// --- 4. One returns ET total, other returns 90' (must reject) ---
// Simulated: FD reports 1-1 at 90', AS mistakenly reports the post-ET 2-1.
{
  const r = computeConsensus(
    koExpected,
    [
      fd({ homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: "ESP", duration: "EXTRA_TIME" }),
      as({ homeCode: "ESP", awayCode: "GER", home90: 2, away90: 1, advancingTeam: "ESP", duration: "AET" }),
    ],
  );
  eq(r.decision, "disagree", "ET total vs 90' -> disagree (reject)");
}

// --- 4b. regulationAmbiguous flag forces ambiguous ---
{
  const r = computeConsensus(groupExpected, [fd({ regulationAmbiguous: true }), as()]);
  eq(r.decision, "ambiguous", "regulationAmbiguous -> ambiguous");
}

// --- 5. Knockout advancing-team agreement (1-1 at 90', both say ESP) ---
{
  const r = computeConsensus(
    koExpected,
    [
      fd({ homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: "ESP", duration: "PENALTY_SHOOTOUT" }),
      as({ homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: "ESP", duration: "PEN" }),
    ],
  );
  eq(r.decision, "agreed", "KO tie, agreed advancing -> agreed");
  eq(r.homeScore, 1, "KO records 90' home score");
  eq(r.awayScore, 1, "KO records 90' away score");
  eq(r.advancingTeam, "ESP", "KO advancing team recorded");
}

// --- 5b. Knockout advancing-team disagreement ---
{
  const r = computeConsensus(
    koExpected,
    [
      fd({ homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: "ESP", duration: "AET" }),
      as({ homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: "GER", duration: "AET" }),
    ],
  );
  eq(r.decision, "disagree", "KO advancing mismatch -> disagree");
}

// --- 5c. Knockout tie with no advancing team from a source ---
{
  const r = computeConsensus(
    koExpected,
    [
      fd({ homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: null }),
      as({ homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: "ESP" }),
    ],
  );
  eq(r.decision, "ambiguous", "KO tie missing advancing -> ambiguous");
}

// --- 5d. Knockout NOT level at 90' needs no advancing team ---
{
  const r = computeConsensus(
    koExpected,
    [
      fd({ homeCode: "ESP", awayCode: "GER", home90: 2, away90: 1, advancingTeam: null }),
      as({ homeCode: "ESP", awayCode: "GER", home90: 2, away90: 1, advancingTeam: null }),
    ],
  );
  eq(r.decision, "agreed", "KO decided in 90' -> agreed");
  eq(r.advancingTeam, null, "KO decided in 90' -> advancing null");
}

// --- 6. Source unreachable -> error ---
{
  const r = computeConsensus(groupExpected, [fd(), { name: "api-sports", error: true }]);
  eq(r.decision, "error", "source unreachable -> error");
}

// --- 7. Team-code mismatch -> ambiguous ---
{
  const r = computeConsensus(groupExpected, [fd({ homeCode: "FRA" }), as()]);
  eq(r.decision, "ambiguous", "team code mismatch -> ambiguous");
}

// --- 8. Out-of-range / non-integer score -> ambiguous ---
{
  const r1 = computeConsensus(groupExpected, [fd({ home90: 99 }), as({ home90: 99 })]);
  eq(r1.decision, "ambiguous", "out-of-range score -> ambiguous");
  const r2 = computeConsensus(groupExpected, [fd({ home90: 1.5 }), as({ home90: 1.5 })]);
  eq(r2.decision, "ambiguous", "non-integer score -> ambiguous");
  const r3 = computeConsensus(groupExpected, [fd({ home90: null }), as({ home90: null })]);
  eq(r3.decision, "ambiguous", "missing score -> ambiguous");
}

// --- 9. Wrong cardinality of sources ---
{
  const r = computeConsensus(groupExpected, [fd()]);
  eq(r.decision, "error", "single source array -> error");
}

// --- 10. Single-source mode (football-data only) ---
{
  // Happy path: one finished, valid source -> agreed.
  const r = decideSingleSource(groupExpected, fd());
  eq(r.decision, "agreed", "single source finished+valid -> agreed");
  eq(r.homeScore, 2, "single source home score");
  eq(r.awayScore, 1, "single source away score");

  // Not finished.
  eq(decideSingleSource(groupExpected, fd({ finished: false })).decision, "not-finished", "single not finished");

  // Source error.
  eq(decideSingleSource(groupExpected, { name: "football-data", error: true }).decision, "error", "single source error");

  // Bad score.
  eq(decideSingleSource(groupExpected, fd({ home90: 99 })).decision, "ambiguous", "single out-of-range score");
  eq(decideSingleSource(groupExpected, fd({ home90: null })).decision, "ambiguous", "single missing score");

  // Team mismatch.
  eq(decideSingleSource(groupExpected, fd({ homeCode: "FRA" })).decision, "ambiguous", "single team mismatch");

  // regulation ambiguous.
  eq(decideSingleSource(groupExpected, fd({ regulationAmbiguous: true })).decision, "ambiguous", "single regulation ambiguous");

  // Knockout tie at 90' WITH advancing -> agreed; records 90' + advancing.
  const ko = decideSingleSource(koExpected, fd({
    homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: "ESP", duration: "AET",
  }));
  eq(ko.decision, "agreed", "single KO tie + advancing -> agreed");
  eq(ko.homeScore, 1, "single KO records 90' home");
  eq(ko.advancingTeam, "ESP", "single KO advancing recorded");

  // Knockout tie WITHOUT advancing -> ambiguous.
  eq(decideSingleSource(koExpected, fd({
    homeCode: "ESP", awayCode: "GER", home90: 1, away90: 1, advancingTeam: null,
  })).decision, "ambiguous", "single KO tie missing advancing -> ambiguous");

  // Knockout decided in 90' -> agreed, no advancing needed.
  const koDec = decideSingleSource(koExpected, fd({
    homeCode: "ESP", awayCode: "GER", home90: 2, away90: 1, advancingTeam: null,
  }));
  eq(koDec.decision, "agreed", "single KO decided in 90' -> agreed");
  eq(koDec.advancingTeam, null, "single KO decided in 90' -> advancing null");
}

console.log("");
if (failures.length) {
  console.log("Failures:");
  failures.forEach((f) => console.log("  - " + f));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
