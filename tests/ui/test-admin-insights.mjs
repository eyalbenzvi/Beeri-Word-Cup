// Regression tests for the admin "מידע ונתונים" tab (AdminInsightsTab).
//
// Asserts the UI wiring: the tab is registered in Admin, it reuses the shared
// aggregators / voter-list components (no duplication), the team breakdown
// renders all 10 parameters, and the knockout breakdown is gated on
// results-derived ("determined") matches. The aggregation logic itself is
// unit-tested in data/test-team-prediction-stats.mjs.

import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0,
  failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else {
    failed++;
    failures.push(m);
    console.error("  FAIL: " + m);
  }
}

console.log("=== ADMIN INSIGHTS (מידע ונתונים) REGRESSION TESTS ===\n");

const admin = readMigratedSrc("src/pages/Admin.jsx", "utf8");
const tab = readMigratedSrc("src/components/AdminInsightsTab.jsx", "utf8");
const shared = readMigratedSrc("src/components/VoterList.jsx", "utf8");

// --- Admin wiring ---
assert(
  /import AdminInsightsTab from "\.\.\/components\/AdminInsightsTab"/.test(admin),
  "Admin imports AdminInsightsTab",
);
assert(
  /id:\s*"insights",\s*label:\s*"מידע ונתונים"/.test(admin),
  "Admin registers the 'מידע ונתונים' tab",
);
assert(
  /activeTab === "insights" && <AdminInsightsTab \/>/.test(admin),
  "Admin renders AdminInsightsTab when the tab is active",
);

// --- Shared, de-duplicated voter-list primitives live in VoterList.tsx ---
assert(
  /export function VoterList/.test(shared) &&
    /export function VoterBarList/.test(shared) &&
    /export function Bar/.test(shared),
  "VoterList.tsx exports the shared Bar/VoterList/VoterBarList primitives",
);
assert(
  /max-h-48 overflow-y-auto/.test(shared) && /אין נתונים/.test(shared),
  "shared VoterList is scrollable with an empty-state fallback",
);
// --- Knockout-tie qualifier is surfaced for every voter (Stats + Admin) ---
assert(
  /showAdvancingChip && v\.advancingTeam && \(/.test(shared) &&
    /<AdvancingChip/.test(shared) &&
    /function AdvancingChip/.test(shared),
  "shared VoterList renders the advancing-team chip for knockout-tie voters",
);
assert(
  /getTeamByCode/.test(shared) && /from "\.\.\/data\/teams"/.test(shared),
  "AdvancingChip resolves the advancing team's flag/name from the team data",
);
// --- Tie predictors grouped by advancing team, reusing VoterBarList (DRY) ---
assert(
  /export function AdvancingVoterBreakdown/.test(shared) &&
    /groupVotersByAdvancing/.test(shared),
  "VoterList exports AdvancingVoterBreakdown built on the shared grouping helper",
);
assert(
  /<VoterBarList items=\{items\} total=\{total\} showAdvancingChip=\{false\}/.test(shared),
  "the breakdown renders one bar per advancing team via the shared VoterBarList (no per-row chip duplication)",
);
// Admin surfaces a dedicated tie-advancement section over the draw bucket.
assert(
  /תיקו — מי עולה\?/.test(tab) &&
    /<AdvancingVoterBreakdown voters=\{matchStats\.stats\.outcomeVoters\.draw\}/.test(tab),
  "AdminInsightsTab shows a 'תיקו — מי עולה?' breakdown over the draw voters",
);
assert(
  /matchStats\.stats\.draw > 0/.test(tab),
  "the tie-advancement section is gated on there being tie predictions",
);

// --- Tab reuses shared aggregators + components instead of duplicating ---
assert(
  /import \{ VoterList, VoterBarList, AdvancingVoterBreakdown \} from "\.\/VoterList"/.test(tab),
  "AdminInsightsTab imports the shared voter-list components",
);
assert(
  /aggregateTeamStats/.test(tab) &&
    /from "\.\.\/utils\/teamPredictionStats"/.test(tab),
  "AdminInsightsTab delegates team stats to the shared aggregator",
);
assert(
  /aggregateMatchPredictions/.test(tab) &&
    /from "\.\.\/utils\/matchPredictionStats"/.test(tab),
  "AdminInsightsTab reuses aggregateMatchPredictions for knockout matches",
);
assert(
  /getCachedStandings|getCachedBracket|getCachedChampion/.test(tab) &&
    /from "\.\.\/utils\/bracketCache"/.test(tab),
  "AdminInsightsTab uses the cached bracket helpers (no recompute per render)",
);

// --- Only submitted forms feed the stats (consistent with public Stats) ---
assert(
  /normalizeStatus\(\(f as any\)\.status\) === "submitted"/.test(tab),
  "AdminInsightsTab counts only submitted forms",
);

// --- Team breakdown renders all parameters via the shared bar list ---
assert(
  /TEAM_STAT_KEYS\.map/.test(tab) && /<VoterBarList items=\{items\}/.test(tab),
  "team breakdown maps all stat keys into a VoterBarList",
);

// --- Knockout breakdown is gated on results-derived determined matches ---
assert(
  /getCachedBracket\(results, true\)/.test(tab),
  "knockout breakdown derives the actual bracket from real results (gated)",
);
assert(
  /determinedMatches|bt\?\.home && bt\?\.away/.test(tab),
  "knockout breakdown only lists matches with both teams determined",
);
assert(
  /ניחשו את קיום המשחק/.test(tab),
  "knockout breakdown shows the match-existence count",
);
assert(
  /existenceVoters/.test(tab) &&
    /outcomeVoters\.home[\s\S]{0,80}outcomeVoters\.draw[\s\S]{0,80}outcomeVoters\.away/.test(tab),
  "match-existence voters are the union of the outcome buckets",
);
assert(
  /scoreVoters\[score\]/.test(tab),
  "predicted-score rows expose the voters who predicted each score",
);

// --- Forms analytics sub-view (new "📋 טפסים" view) ---
const metrics = readMigratedSrc("src/utils/formMetrics.js", "utf8");

assert(
  /id:\s*"forms",\s*label:\s*"📋 טפסים"/.test(tab),
  "AdminInsightsTab registers the third '📋 טפסים' sub-view chip",
);
assert(
  /view === "forms"|<FormsInsights \/>/.test(tab),
  "AdminInsightsTab renders FormsInsights for the forms view",
);
assert(
  /function FormsInsights/.test(tab),
  "AdminInsightsTab defines the FormsInsights component",
);
// Reuses the shared leaderboard scoring core so דירוג/ניקוד match the public board.
assert(
  /useLeaderboardComputed/.test(tab) &&
    /from "\.\.\/hooks\/useLeaderboardComputed"/.test(tab),
  "FormsInsights reuses useLeaderboardComputed (no parallel scoring)",
);
// Metric derivations come from the shared pure util, not inline duplication.
assert(
  /computeAdvancingCounts/.test(tab) &&
    /computeMatchupHitsByStage/.test(tab) &&
    /computeExactPositionTeamsByStage/.test(tab) &&
    /computeFormMetricValues/.test(tab) &&
    /sortFormMetricRows/.test(tab) &&
    /from "\.\.\/utils\/formMetrics"/.test(tab),
  "FormsInsights delegates metric math to formMetrics.ts",
);
// Per-stage team + matchup metrics are bracket-based (Results-tab parity),
// NOT scoring's all-groups-gated advancing — so they don't wait for the group
// stage to finish.
assert(
  /getCachedBracket\(results, true\)/.test(tab) &&
    /deriveAdvancingTeams\(actualBracketTeams\)/.test(tab),
  "FormsInsights derives actual advancing/matchups from the results-gated bracket",
);
assert(
  !/actualDerivedAdvancing/.test(tab),
  "FormsInsights does NOT use scoring's gated actualDerivedAdvancing for the table",
);
// Up-to-3 cap is enforced in the picker.
assert(
  /MAX_SELECTED_METRICS/.test(tab) &&
    /selected\.length >= MAX_SELECTED_METRICS/.test(tab),
  "FormsInsights enforces the max-3 metric cap",
);
// Sort is by the first selected metric initially, and tappable headers re-sort.
assert(
  /applySort/.test(tab) && /aria-label=\{`מיין לפי /.test(tab),
  "FormsInsights exposes tappable, labelled column sort controls",
);
// RTL-safe numbers everywhere in the table.
assert(
  /<bdi>\{r\.values\[m\.key\]\}<\/bdi>/.test(tab) && /tabular-nums/.test(tab),
  "metric cells render numbers in <bdi> with tabular-nums (RTL-safe)",
);
// Owner identity + secondary rank for principled-order reassurance.
assert(
  /#\{r\.rank\}|#\{r\.rank\}/.test(tab) || /<bdi>#\{r\.rank\}<\/bdi>/.test(tab),
  "rows show a secondary official rank",
);
// Search + count line for 200+ forms.
assert(
  /חיפוש לפי שם טופס/.test(tab) && /aria-live="polite"/.test(tab),
  "FormsInsights provides a form search + live result count",
);

// --- formMetrics.ts registry contract (mirrors the unit test, static guard) ---
assert(
  /export const FORM_METRICS/.test(metrics) &&
    /key: "rank"[\s\S]*?key: "exact3RD"/.test(metrics),
  "formMetrics exports the ordered FORM_METRICS registry incl. exact3RD",
);
assert(
  /export function computeAdvancingCounts/.test(metrics) &&
    /export function computeMatchupHitsByStage/.test(metrics) &&
    /export function computeExactPositionTeamsByStage/.test(metrics) &&
    /export function sortFormMetricRows/.test(metrics),
  "formMetrics exports the pure derivations + sort",
);
// Tiebreak: equal metric falls back to official rank then formId (determinism).
assert(
  /if \(a\.rank !== b\.rank\) return a\.rank - b\.rank;[\s\S]*?localeCompare\(b\.formId\)/.test(
    metrics,
  ),
  "sortFormMetricRows tiebreaks by rank then formId",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
