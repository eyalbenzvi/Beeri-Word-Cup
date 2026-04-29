// Static-audit lock for the Leaderboard search box (form name / user / champion / top scorer).
// Belt-and-braces alongside the unit tests in tests/summary/test-summary-stats.mjs:
// the latter covers the pure pipeline (per-form day aggregates + global suggestions);
// this test covers the JSX-level wiring on the leaderboard so a regression that
// removes the input or breaks the privacy gate is caught at static-audit time.
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LEADERBOARD SEARCH TESTS ===\n");

const src = readMigratedSrc("src/pages/Leaderboard.jsx", "utf8");

// --- Search input exists and has the expected accessible label ---
assert(
  /id="lb-search"/.test(src),
  "Leaderboard exposes a search input with id=lb-search",
);
assert(
  /aria-label="חיפוש בטבלת הדירוג"/.test(src) || /aria-label=\{[^}]*חיפוש/.test(src),
  "search input has Hebrew aria-label",
);
// The placeholder is built from a template literal that mixes Hebrew copy
// with the centralised LABELS constants. We grep for both substrings and
// the template-literal punctuation rather than match the whole string verbatim
// (which would lock us into one specific phrasing).
assert(
  /placeholder=\{`[^`]*שם טופס[^`]*משתמש[^`]*\$\{LABELS\.champion\}[^`]*\$\{LABELS\.topScorer\}/.test(src),
  "search placeholder lists all four searchable fields (form / user / champion / top scorer) using LABELS constants",
);

// --- Search uses the centralized normalizeSearch helper (so niqqud + case work) ---
assert(
  /normalizeSearch/.test(src),
  "Leaderboard uses normalizeSearch from playerSearch (consistent with other search inputs)",
);

// --- Privacy gate: champion + top scorer must NOT be searchable when the form is
// not viewable to the current user (otherwise the search would silently leak
// private predictions before the lock).
assert(
  /canView\s*\?\s*championName\s*:\s*""/.test(src) ||
  /canView\s*&&\s*championName/.test(src),
  "search filter only includes champion when row is viewable",
);
assert(
  /canView\s*\?\s*topScorerName\s*:\s*""/.test(src) ||
  /canView\s*&&\s*topScorerName/.test(src),
  "search filter only includes top scorer when row is viewable",
);

// --- Filtered list is what's rendered (regression lock so the search isn't dead UI) ---
assert(
  /filteredLeaderboard\.slice\(0,\s*showCount\)\.map/.test(src),
  "render path uses filteredLeaderboard, not rankedLeaderboard",
);

// --- The "show more" CTA + remaining counter must reference the FILTERED length,
// not the full leaderboard, otherwise the user sees "show 20 more" while there
// are 0 more matches in their query.
assert(
  /showCount\s*<\s*filteredLeaderboard\.length/.test(src),
  "show-more CTA gates on filteredLeaderboard.length",
);
assert(
  /filteredLeaderboard\.length\s*-\s*showCount/.test(src),
  "remaining counter subtracts showCount from filteredLeaderboard.length",
);

// --- Auto-scroll-to-my-form must NOT fire while the user is searching
// (otherwise typing a query yanks the page to a row that isn't visible).
assert(
  /if\s*\(\s*isSearching\s*\)\s*return;?/.test(src),
  "auto-scroll effect bails when isSearching",
);

// --- Empty-state for "no matches" exists (so a typo doesn't drop the user
// onto a blank page with no recovery hint).
assert(
  /לא נמצאו טפסים תואמים/.test(src),
  "no-results empty state in place",
);

// --- Search box hidden in embedded admin preview ---
// Embedded leaderboard has its own context (admin preview, etc.) and shouldn't
// duplicate filter UI. Asserting that the search input is gated by !embedded.
const searchBlock = src.match(/!embedded[^]*?lb-search/);
assert(searchBlock, "search input is rendered inside an !embedded gate");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
