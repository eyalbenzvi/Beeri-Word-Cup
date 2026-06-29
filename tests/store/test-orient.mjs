// Unit tests for the shared source orientation helper
// (netlify/functions/_sources/orient.js). This is the single most bug-prone
// spot once a result carries THREE score pairs + winner flags: a reversed-
// fixture feed must flip ALL of them together, or a flipped ET / penalty score
// leaks into the UI. advancingTeam is a code and must NEVER be swapped.

import { orientToExpected } from "../../netlify/functions/_sources/orient.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }
function eq(a, b, m) { assert(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

console.log("=== ORIENT HELPER TESTS ===\n");

const raw = {
  home90: 1, away90: 0,
  homeCode: "ESP", awayCode: "GER",
  etHome: 2, etAway: 1,
  penHome: 4, penAway: 3,
  homeWinner: true, awayWinner: false,
};

// --- Already correct orientation: unchanged ---
{
  const o = orientToExpected(raw, "ESP", "GER");
  eq(o.home90, 1, "aligned: home90");
  eq(o.away90, 0, "aligned: away90");
  eq(o.etHome, 2, "aligned: etHome");
  eq(o.penHome, 4, "aligned: penHome");
  eq(o.homeCode, "ESP", "aligned: homeCode");
  eq(o.homeWinner, true, "aligned: homeWinner");
}

// --- Reversed feed: every pair + winner flags swap together ---
{
  const o = orientToExpected(raw, "GER", "ESP");
  eq(o.home90, 0, "reversed: home90 swapped");
  eq(o.away90, 1, "reversed: away90 swapped");
  eq(o.homeCode, "GER", "reversed: homeCode swapped");
  eq(o.awayCode, "ESP", "reversed: awayCode swapped");
  eq(o.etHome, 1, "reversed: etHome swapped");
  eq(o.etAway, 2, "reversed: etAway swapped");
  eq(o.penHome, 3, "reversed: penHome swapped");
  eq(o.penAway, 4, "reversed: penAway swapped");
  eq(o.homeWinner, false, "reversed: homeWinner swapped");
  eq(o.awayWinner, true, "reversed: awayWinner swapped");
}

// --- Nulls survive a swap without becoming undefined ---
{
  const o = orientToExpected(
    { home90: 0, away90: 0, homeCode: "ESP", awayCode: "GER", etHome: null, etAway: null, penHome: null, penAway: null },
    "GER", "ESP",
  );
  eq(o.etHome, null, "reversed: null ET stays null");
  eq(o.penAway, null, "reversed: null pen stays null");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.error("\nFailures:\n  - " + failures.join("\n  - ")); process.exit(1); }
