// Unit tests for the shared knockout extra-time / penalty breakdown module
// (src/utils/resultBreakdown.ts): the canonical serializer, the write-time
// validator, and the read-time decision normalizer. These guard the data
// contract that the whole feature rests on, INCLUDING that presentation
// fields never imply a scoring change (homeScore/awayScore = 90' untouched).

import {
  DECIDED_BY,
  decidedByFromDuration,
  buildResultRecord,
  validateResultBreakdown,
  getResultDecision,
} from "../../src/utils/resultBreakdown.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }
function eq(a, b, m) { assert(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

console.log("=== RESULT BREAKDOWN MODULE TESTS ===\n");

// ---------- decidedByFromDuration ----------
eq(decidedByFromDuration("REGULAR"), "regular", "duration REGULAR -> regular");
eq(decidedByFromDuration("EXTRA_TIME"), "extra_time", "duration EXTRA_TIME -> extra_time");
eq(decidedByFromDuration("PENALTY_SHOOTOUT"), "penalties", "duration PEN -> penalties");
eq(decidedByFromDuration(null), "regular", "duration null -> regular");

// ---------- buildResultRecord: canonical full shape, NEVER undefined ----------
{
  const r = buildResultRecord();
  const keys = ["decidedBy", "etHomeScore", "etAwayScore", "penHomeScore", "penAwayScore", "breakdownSource"];
  for (const k of keys) assert(k in r, `buildResultRecord always emits key ${k}`);
  for (const k of keys) assert(r[k] !== undefined, `buildResultRecord ${k} is never undefined (merge-safe)`);
  eq(r.decidedBy, "regular", "empty input -> regular");
  eq(r.etHomeScore, null, "empty input -> et null");
  eq(r.penHomeScore, null, "empty input -> pen null");
}
{
  // String coercion + extra_time keeps ET, drops penalties.
  const r = buildResultRecord({ decidedBy: "extra_time", etHomeScore: "2", etAwayScore: "1", penHomeScore: 4, penAwayScore: 3 });
  eq(r.decidedBy, "extra_time", "extra_time preserved");
  eq(r.etHomeScore, 2, "ET home coerced from string");
  eq(r.etAwayScore, 1, "ET away coerced");
  eq(r.penHomeScore, null, "extra_time drops penalty home");
  eq(r.penAwayScore, null, "extra_time drops penalty away");
}
{
  // Penalties keeps both ET and pens.
  const r = buildResultRecord({ decidedBy: "penalties", etHomeScore: 1, etAwayScore: 1, penHomeScore: 5, penAwayScore: 4 });
  eq(r.penHomeScore, 5, "penalties keeps pen home");
  eq(r.etHomeScore, 1, "penalties keeps ET home");
}
{
  // Inference: pen numbers present but decidedBy missing -> penalties.
  const r = buildResultRecord({ penHomeScore: 3, penAwayScore: 2 });
  eq(r.decidedBy, "penalties", "infers penalties from pen numbers");
}
{
  // Inference: et numbers present, no pens, no decidedBy -> extra_time.
  const r = buildResultRecord({ etHomeScore: 2, etAwayScore: 1 });
  eq(r.decidedBy, "extra_time", "infers extra_time from ET numbers");
}
{
  // Regular drops everything.
  const r = buildResultRecord({ decidedBy: "regular", etHomeScore: 2, etAwayScore: 1 });
  eq(r.etHomeScore, null, "regular drops ET");
}

// ---------- validateResultBreakdown ----------
const ko = { isKnockout: true, homeTeam: "ESP", awayTeam: "GER" };
const grp = { isKnockout: false };

// group cannot carry decision data
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP" }, grp).valid, "group tie with advancing -> invalid");
assert(validateResultBreakdown({ homeScore: 1, awayScore: 1 }, grp).valid, "plain group tie -> valid");

// decisive knockout
assert(validateResultBreakdown({ homeScore: 2, awayScore: 1 }, ko).valid, "KO decisive -> valid");
assert(!validateResultBreakdown({ homeScore: 2, awayScore: 1, etHomeScore: 3, etAwayScore: 1 }, ko).valid, "KO decisive with ET -> invalid");
assert(!validateResultBreakdown({ homeScore: 2, awayScore: 1, decidedBy: "extra_time" }, ko).valid, "KO decisive marked extra_time -> invalid");

// KO tie integrity
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, decidedBy: "extra_time" }, ko).valid, "KO tie without advancing -> invalid");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "FRA", decidedBy: "penalties" }, ko).valid, "advancing not a participant -> invalid");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP" }, ko).valid, "KO tie decidedBy regular/absent -> invalid");

// extra_time consistency
assert(validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "extra_time", etHomeScore: 2, etAwayScore: 1 }, ko).valid, "ET winner matches advancing -> valid");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "GER", decidedBy: "extra_time", etHomeScore: 2, etAwayScore: 1 }, ko).valid, "ET winner mismatches advancing -> invalid");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "extra_time", etHomeScore: 2, etAwayScore: 2 }, ko).valid, "level ET for extra_time -> invalid");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "extra_time", etHomeScore: 2, etAwayScore: 1, penHomeScore: 4, penAwayScore: 3 }, ko).valid, "extra_time with penalty scores -> invalid");
assert(validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "extra_time" }, ko).valid, "extra_time tolerant of missing ET numbers -> valid");

// penalties consistency
assert(validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "penalties", etHomeScore: 1, etAwayScore: 1, penHomeScore: 4, penAwayScore: 3 }, ko).valid, "valid penalty result");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "penalties", etHomeScore: 2, etAwayScore: 1 }, ko).valid, "non-level ET before penalties -> invalid");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "penalties", penHomeScore: 4, penAwayScore: 4 }, ko).valid, "level shootout -> invalid");
assert(!validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "GER", decidedBy: "penalties", penHomeScore: 5, penAwayScore: 4 }, ko).valid, "shootout winner mismatches advancing -> invalid");
assert(validateResultBreakdown({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "penalties" }, ko).valid, "penalties tolerant of missing numbers -> valid");

// ---------- getResultDecision ----------
{
  const d = getResultDecision({ homeScore: 2, awayScore: 1 });
  assert(d.played && !d.isKnockoutTie, "decisive -> played, not a KO tie");
  eq(d.decidedBy, "regular", "decisive -> regular");
}
{
  const d = getResultDecision({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "extra_time", etHomeScore: 2, etAwayScore: 1 });
  assert(d.isKnockoutTie, "ET tie -> knockout tie");
  eq(d.decidedBy, "extra_time", "ET tie -> extra_time");
  eq(d.et.home, 2, "ET home parsed");
  assert(!d.numbersMissing, "ET tie with numbers -> not missing");
}
{
  const d = getResultDecision({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", decidedBy: "penalties", etHomeScore: 1, etAwayScore: 1, penHomeScore: 4, penAwayScore: 3 });
  eq(d.decidedBy, "penalties", "pen tie -> penalties");
  eq(d.pens.home, 4, "pen home parsed");
  assert(!d.numbersMissing, "pen tie complete -> not missing");
}
{
  // Legacy tie: advancing only, no decidedBy/et/pen.
  const d = getResultDecision({ homeScore: 1, awayScore: 1, advancingTeam: "ESP" });
  assert(d.isKnockoutTie, "legacy tie with advancing -> knockout tie");
  eq(d.decidedBy, "unknown_tie", "legacy tie -> unknown_tie, NEVER fabricated penalties");
  assert(d.numbersMissing, "legacy tie -> numbersMissing");
}
{
  // Group tie (no advancing) is NOT a knockout tie.
  const d = getResultDecision({ homeScore: 0, awayScore: 0 });
  assert(!d.isKnockoutTie, "group 0-0 -> not a knockout tie");
}
{
  // Self-heal: pen numbers but no decidedBy.
  const d = getResultDecision({ homeScore: 1, awayScore: 1, advancingTeam: "ESP", penHomeScore: 5, penAwayScore: 4 });
  eq(d.decidedBy, "penalties", "self-heals to penalties from pen numbers");
}
{
  const d = getResultDecision({ homeScore: null, awayScore: null });
  assert(!d.played, "unplayed -> not played");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.error("\nFailures:\n  - " + failures.join("\n  - ")); process.exit(1); }
