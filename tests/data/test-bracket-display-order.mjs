// Regression tests for the knockout bracket DISPLAY ORDER (#bracket-display-order).
//
// BracketView renders each knockout round as a stacked column and relies purely
// on vertical adjacency to read as a tree. The raw R32/R16/QF arrays are ordered
// by FIFA match number, which does NOT match the bracket links (R16-1 is fed by
// R32-2 & R32-5, SF-1 by QF-1 & QF-3). Rendering in raw order mis-pairs the tree
// — the winner of R32-2 (e.g. Germany) lines up next to the winner of R32-1
// instead of its real opponent from R32-5 (France).
//
// BRACKET_DISPLAY_ORDER is a feeders-first DFS that fixes this. This suite pins
// (a) the exact per-stage order, (b) the structural invariant that each parent's
// two feeders are the contiguous child pair directly above/below it, and (c) the
// BracketView wiring that sorts by it.

import { BRACKET_DISPLAY_ORDER, knockoutMatches } from "../../src/data/matches.ts";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== BRACKET DISPLAY ORDER REGRESSION TESTS ===\n");

const byId = Object.fromEntries(knockoutMatches.map((m) => [m.id, m]));

// ---- (a) Exact per-stage order ---------------------------------------------
// Hand-derived from the homeFrom/awayFrom links so a future schedule edit that
// silently breaks the DFS gets caught.
const EXPECTED = {
  R32: ["R32-2", "R32-5", "R32-1", "R32-3", "R32-11", "R32-12", "R32-9", "R32-10",
        "R32-4", "R32-6", "R32-7", "R32-8", "R32-14", "R32-16", "R32-13", "R32-15"],
  R16: ["R16-1", "R16-2", "R16-5", "R16-6", "R16-3", "R16-4", "R16-7", "R16-8"],
  QF: ["QF-1", "QF-3", "QF-2", "QF-4"],
  SF: ["SF-1", "SF-2"],
  F: ["F-1"],
};

for (const [stage, expected] of Object.entries(EXPECTED)) {
  assert(
    JSON.stringify(BRACKET_DISPLAY_ORDER[stage]) === JSON.stringify(expected),
    `${stage} display order is ${expected.join(",")} (got ${JSON.stringify(BRACKET_DISPLAY_ORDER[stage])})`,
  );
}

// The specific bug from the brief: Germany (R32-2 winner) must be stacked
// directly above France (R32-5 winner), feeding R16-1.
const r32 = BRACKET_DISPLAY_ORDER.R32;
assert(
  r32.indexOf("R32-5") === r32.indexOf("R32-2") + 1,
  "R32-2 and R32-5 (feeders of R16-1) are vertically adjacent",
);

// ---- (b) Structural invariant: parent feeders are the contiguous child pair --
// For every round transition, parent i must be fed by child[2i] and child[2i+1]
// (as a set). This is exactly the alignment justify-around produces.
const TRANSITIONS = [["R16", "R32"], ["QF", "R16"], ["SF", "QF"], ["F", "SF"]];
for (const [parentStage, childStage] of TRANSITIONS) {
  const parents = BRACKET_DISPLAY_ORDER[parentStage];
  const children = BRACKET_DISPLAY_ORDER[childStage];
  assert(children.length === parents.length * 2,
    `${childStage} has exactly twice as many matches as ${parentStage}`);
  parents.forEach((pid, i) => {
    const p = byId[pid];
    const feeders = new Set([p.homeFrom, p.awayFrom]);
    const pair = new Set([children[2 * i], children[2 * i + 1]]);
    const same = feeders.size === pair.size && [...feeders].every((f) => pair.has(f));
    assert(same,
      `${pid} feeders {${[...feeders]}} are the child pair {${[...pair]}} at slots ${2 * i},${2 * i + 1}`);
  });
}

// Every knockout match (except the standalone 3rd-place game) appears once.
const ordered = Object.values(BRACKET_DISPLAY_ORDER).flat();
assert(ordered.length === knockoutMatches.filter((m) => m.stage !== "3RD").length,
  "every tree match appears exactly once in the display order");
assert(new Set(ordered).size === ordered.length, "no match is listed twice");

// ---- (c) BracketView wiring -------------------------------------------------
const b = readMigratedSrc("src/components/BracketView.jsx");
assert(/BRACKET_DISPLAY_ORDER/.test(b), "BracketView imports BRACKET_DISPLAY_ORDER");
assert(/\.sort\(\(a, b\) => order\.indexOf\(a\.id\) - order\.indexOf\(b\.id\)\)/.test(b),
  "BracketView sorts each round's matches by the bracket display order");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
