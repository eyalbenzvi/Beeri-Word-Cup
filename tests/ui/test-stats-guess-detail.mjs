// Regression tests for the Stats ("נתונים") → match-predictions detail feature.
//
// Feature: in the per-match prediction breakdown, users can now click a
// popular result (e.g. 1-1) OR a 1/X/2 outcome card to expand an accordion
// listing the form names that predicted it. This requires the match-stats
// memo to retain form names per result/outcome (not just counts), plus
// clickable, accordion-toggling UI.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== STATS GUESS DETAIL REGRESSION TESTS ===\n");

const stats = readMigratedSrc("src/pages/Stats.jsx", "utf8");

// The memo must retain form names per outcome (1/X/2), not just counts.
assert(
  /outcomeVoters\s*=\s*\{\s*home:\s*\[\]\s*,\s*draw:\s*\[\]\s*,\s*away:\s*\[\]/.test(stats),
  "outcomeVoters tracks form names for home/draw/away outcomes",
);

// The memo must retain voters per score key (who predicted each score).
assert(
  /scoreVoters/.test(stats),
  "scoreVoters map retains the list of form names per predicted score",
);

// Counts must derive from the voter lists so they stay consistent.
assert(
  /outcomeVoters\.home\.length/.test(stats) &&
    /\(voters as string\[\]\)\.length/.test(stats),
  "counts derive from voter-list lengths (single source of truth)",
);

// Accordion state: a single expanded id, reset when the match changes.
assert(
  /useState<string \| null>\(null\)/.test(stats) &&
    /setExpanded\(null\)[\s\S]{0,40}\[selectedMatch\]/.test(stats),
  "expanded accordion state resets when selectedMatch changes",
);

// The voter list component renders names and scrolls for long lists.
assert(
  /function VoterList/.test(stats) && /max-h-48 overflow-y-auto/.test(stats),
  "VoterList renders a scrollable list of form names",
);

// Outcome cards are real buttons that toggle their accordion.
assert(
  /setExpanded\(expanded === "outcome:home" \? null : "outcome:home"\)/.test(stats),
  "home-win card toggles its voter accordion",
);
assert(
  /expanded === "outcome:draw"[\s\S]{0,200}?VoterList names=\{matchStats\.outcomeVoters\.draw\}/.test(stats),
  "draw accordion panel renders the draw voters",
);

// Popular-score bars are clickable and render their voter list when open.
assert(
  /VoterList names=\{matchStats\.scoreVoters\[score\]/.test(stats),
  "popular-score rows expand to the voters who predicted that score",
);

// aria-expanded for accessibility on the toggles.
assert(
  (stats.match(/aria-expanded=/g) || []).length >= 4,
  "toggles expose aria-expanded for accessibility",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
