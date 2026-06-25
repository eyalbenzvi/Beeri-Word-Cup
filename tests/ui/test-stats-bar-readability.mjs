// Regression tests for the Stats ("נתונים") tab bar-chart readability fix.
//
// Bug: the count label lived inside the colored fill of each Bar
// (flex justify-end). When the bar was narrow (low percentage, min-width
// 8%), the label was wider than the fill itself and got clipped by the
// track's overflow-hidden — users saw half-cut digits ("26" → "2|",
// "1" → sliver). See screenshot from 2026-06-10 report.
//
// Fix: when the fill is too narrow to contain the label, render the count
// on the track just past the fill's tip (insetInlineStart — RTL-aware),
// in ink color instead of white.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== STATS BAR READABILITY REGRESSION TESTS ===\n");

// The Bar primitive was extracted to a shared component (src/components/
// VoterList.tsx) so the admin "מידע ונתונים" tab can reuse it. The readability
// fix lives there now.
const stats = readMigratedSrc("src/components/VoterList.jsx", "utf8");

// The Bar component decides whether the count fits inside the fill.
assert(
  /countFitsInside/.test(stats),
  "Bar has a countFitsInside gate (narrow fills don't hold the label)",
);

// The threshold-based gate must not render the white in-fill label
// unconditionally: the inside label is guarded by the gate.
assert(
  /countFitsInside\s*&&[\s\S]{0,200}?text-white[\s\S]{0,100}?\{count\}/.test(stats),
  "in-fill (white) count label only renders when countFitsInside",
);

// The fallback label sits on the track, positioned right after the fill's
// tip with a logical (RTL-aware) inset, in readable ink color.
assert(
  /!countFitsInside\s*&&\s*count\s*>\s*0/.test(stats),
  "out-of-fill count label renders when fill is too narrow and count > 0",
);
assert(
  /insetInlineStart:\s*`\$\{width\}%`/.test(stats),
  "out-of-fill label uses insetInlineStart (RTL-aware) at the fill's tip",
);
assert(
  /!countFitsInside\s*&&\s*count\s*>\s*0[\s\S]{0,300}?text-ink\b/.test(stats),
  "out-of-fill label uses dark (text-ink) color, readable on the track",
);

// The track must be position:relative for the absolute label to anchor to
// it (not to some ancestor).
assert(
  /relative\s+flex-1\s+bg-bg-soft\s+rounded-full/.test(stats),
  "bar track is position:relative so the absolute count anchors to it",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
