// Regression tests for the Stats ("נתונים") → match-predictions detail feature.
//
// Feature: in the per-match prediction breakdown, users can click a popular
// result (e.g. 1-1) OR a 1/X/2 outcome card to expand an accordion listing
// the form names that predicted it. This file asserts the UI WIRING; the
// aggregation logic itself is unit-tested in
// data/test-match-prediction-stats.mjs.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== STATS GUESS DETAIL (UI WIRING) REGRESSION TESTS ===\n");

const stats = readMigratedSrc("src/pages/Stats.jsx", "utf8");
// The Bar / VoterList / VoterBarList primitives were extracted to a shared
// component so the admin "מידע ונתונים" tab can reuse them without duplication.
const shared = readMigratedSrc("src/components/VoterList.jsx", "utf8");

// Aggregation is delegated to the shared, unit-tested helper.
assert(
  /import \{ aggregateMatchPredictions \} from "\.\.\/utils\/matchPredictionStats"/.test(stats),
  "Stats imports the aggregateMatchPredictions helper",
);
// The voter-list primitives are imported from the shared component.
assert(
  /import \{ Bar, VoterList, VoterBarList \} from "\.\.\/components\/VoterList"/.test(stats),
  "Stats imports the shared voter-list primitives",
);
assert(
  /aggregateMatchPredictions\(forms,\s*selectedMatch\b/.test(stats),
  "match-stats memo delegates to aggregateMatchPredictions",
);

// Accordion state: a single expanded id, reset when the match changes.
assert(
  /useState<string \| null>\(null\)/.test(stats) &&
    /setExpanded\(null\)[\s\S]{0,40}\[selectedMatch\]/.test(stats),
  "expanded accordion state resets when selectedMatch changes",
);

// The shared voter list component renders names and scrolls for long lists.
assert(
  /function VoterList/.test(shared) && /max-h-48 overflow-y-auto/.test(shared),
  "VoterList renders a scrollable list of form names",
);
assert(
  /אין נתונים/.test(shared),
  "VoterList has an empty-state fallback",
);

// Outcome cards are real buttons that toggle their accordion + render voters.
assert(
  /setExpanded\(expanded === "outcome:home" \? null : "outcome:home"\)/.test(stats),
  "home-win card toggles its voter accordion",
);
assert(
  /expanded === "outcome:draw"[\s\S]{0,200}?VoterList voters=\{matchStats\.outcomeVoters\.draw\}/.test(stats),
  "draw accordion panel renders the draw voters",
);
assert(
  /expanded === "outcome:away"[\s\S]{0,200}?VoterList voters=\{matchStats\.outcomeVoters\.away\}/.test(stats),
  "away accordion panel renders the away voters",
);

// Popular-score bars are clickable and render their voter list when open.
assert(
  /VoterList voters=\{matchStats\.scoreVoters\[score\]/.test(stats),
  "popular-score rows expand to the voters who predicted that score",
);

// Voter form names deep-link to the form's view via ClickableName + navigate.
assert(
  /ClickableName[\s\S]{0,120}?navigate\("leaderboard", \{ form: v\.formId \}\)/.test(shared),
  "voter form names link to that form in the leaderboard",
);

// aria-expanded for accessibility on every toggle (3 outcomes + scores).
assert(
  (stats.match(/aria-expanded=/g) || []).length >= 4,
  "toggles expose aria-expanded for accessibility",
);

// --- Teams tab: champion + top scorer get the same click-to-detail bars ---

// Shared clickable-bar component drives both team breakdowns.
assert(
  /function VoterBarList/.test(shared) && /<VoterList voters=\{item\.voters\}/.test(shared),
  "VoterBarList renders clickable bars that expand to their voters",
);

// Champion breakdown tracks voters and uses the shared component.
assert(
  /title="מי תהיה האלופה\?"[\s\S]{0,400}?<VoterBarList/.test(stats),
  "ChampionStats renders via VoterBarList (clickable champion bars)",
);
assert(
  /לחצו על קבוצה כדי לראות מי ניחש אותה/.test(stats),
  "ChampionStats has a click-for-detail hint",
);

// Top-scorer breakdown tracks voters, uses the shared component, and is uncapped.
assert(
  /title="מי יהיה מלך השערים\?"[\s\S]{0,400}?<VoterBarList/.test(stats),
  "TopScorerStats renders via VoterBarList (clickable scorer bars)",
);
assert(
  /לחצו על שחקן כדי לראות מי ניחש אותו/.test(stats),
  "TopScorerStats has a click-for-detail hint",
);
assert(
  !/\.slice\(0, 10\)/.test(stats),
  "TopScorerStats no longer caps the list at 10 — shows all predicted scorers",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
