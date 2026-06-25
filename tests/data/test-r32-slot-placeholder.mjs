// Regression tests for the Round-of-32 slot placeholder (#stage-32).
//
// Before the group stage finishes, the two sides of an R32 match are unknown.
// Every surface that shows a match must render WHO will play in the slot — the
// group-finish code ("1A", "2B") or a third-place descriptor — instead of a
// bare "טרם נקבע". This suite pins both the pure helper (`r32SlotLabel`) and the
// wiring across every consumer surface.

import { r32SlotLabel } from "../../src/utils/matchSlot.ts";
import { knockoutMatches, R32_MATCHES } from "../../src/data/matches.ts";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== R32 SLOT PLACEHOLDER REGRESSION TESTS ===\n");

// ---- Pure helper logic ------------------------------------------------------

// Every R32 match resolves a placeholder for BOTH sides (no bare null).
const r32 = knockoutMatches.filter((m) => m.stage === "R32");
assert(r32.length === 16, "16 R32 matches present in the schedule");
for (const m of r32) {
  const h = r32SlotLabel(m, "home");
  const a = r32SlotLabel(m, "away");
  assert(!!h, `${m.id} home slot has a placeholder (got ${JSON.stringify(h)})`);
  assert(!!a, `${m.id} away slot has a placeholder (got ${JSON.stringify(a)})`);
}

// Group-finish codes are passed through verbatim (the example from the brief).
const r32_1 = R32_MATCHES.find((m) => m.id === "R32-1");
assert(r32SlotLabel({ ...r32_1, stage: "R32" }, "home") === "2A", "group-finish code passes through ('2A')");
const r32_7 = R32_MATCHES.find((m) => m.id === "R32-7");
assert(r32SlotLabel({ ...r32_7, stage: "R32" }, "home") === "1A", "group-winner code passes through ('1A')");

// Third-place slots become a descriptor that names the candidate groups.
assert(
  r32SlotLabel({ ...r32_7, stage: "R32" }, "away") === "מקום 3 (C/E/F/H/I)",
  "third-place slot lists the candidate groups",
);
assert(
  r32SlotLabel({ stage: "R32", away: "3rd" }, "away") === "מקום 3",
  "third-place slot falls back to bare 'מקום 3' without group data",
);

// Non-R32 stages and missing data yield null — callers keep their own fallback.
assert(r32SlotLabel({ stage: "R16", home: "W74" }, "home") === null, "R16 returns null (no opaque W-codes)");
assert(r32SlotLabel({ stage: "group", homeTeam: "BRA" }, "home") === null, "group stage returns null");
assert(r32SlotLabel(null, "home") === null, "null match returns null");
assert(r32SlotLabel({ stage: "R32" }, "home") === null, "missing slot returns null");

// ---- Wiring across every consumer surface -----------------------------------

const CONSUMERS = [
  "src/components/MatchCard.tsx",
  "src/components/BracketView.tsx",
  "src/pages/Results.tsx",
  "src/components/MatchDigest.tsx",
  "src/components/TeamModal.tsx",
  "src/components/FormMatchesView.tsx",
  "src/components/UnfilledQueue.tsx",
  "src/components/MatchSearch.tsx",
  "src/components/UpcomingMatches.tsx",
  "src/pages/Stats.tsx",
  "src/components/AdminResultsTab.tsx",
  "src/components/AdminFormsTab.tsx",
  "src/components/SimulatorPanel.tsx",
  "src/utils/exportFormExcel.ts",
];

for (const path of CONSUMERS) {
  const src = readMigratedSrc(path);
  assert(/r32SlotLabel/.test(src), `${path} imports and uses r32SlotLabel`);
}

// ---- Stats "נתונים" tab resolves qualified teams before the placeholder ------
// A team that already qualified for an R32 slot must show its real name (like
// the Results tab), not the "1A" placeholder. Stats does this by resolving
// knockout slots from the actual (results-gated) bracket before falling back.
const stats = readMigratedSrc("src/pages/Stats.tsx");
assert(
  /m\.stage !== "group" && actualBracketTeams\?\.\[m\.id\]/.test(stats),
  "Stats match list resolves knockout slots from the actual bracket",
);
assert(
  /actualBracketTeams\?\.\[matchStats\.match\.id\]/.test(stats),
  "Stats selected-match header resolves from the actual bracket",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
