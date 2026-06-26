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
  /v\.advancingTeam && <AdvancingChip/.test(shared) &&
    /function AdvancingChip/.test(shared),
  "shared VoterList renders the advancing-team chip for knockout-tie voters",
);
assert(
  /getTeamByCode/.test(shared) && /from "\.\.\/data\/teams"/.test(shared),
  "AdvancingChip resolves the advancing team's flag/name from the team data",
);

// --- Tab reuses shared aggregators + components instead of duplicating ---
assert(
  /import \{ VoterList, VoterBarList \} from "\.\/VoterList"/.test(tab),
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
