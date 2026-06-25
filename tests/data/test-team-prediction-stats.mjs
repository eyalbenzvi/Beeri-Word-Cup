// Unit tests for src/utils/teamPredictionStats.ts — the pure per-team
// aggregator behind the admin "מידע ונתונים" → נבחרות panel. Verifies counts,
// voter lists, the cumulative "advanced to round" semantics, and edge cases.
//
// Run with the .ts-aware loader (registered "yes" in run-all.sh).

import {
  aggregateTeamStats,
  TEAM_STAT_KEYS,
  TEAM_STAT_LABELS,
} from "../../src/utils/teamPredictionStats.ts";

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

console.log("=== TEAM PREDICTION STATS UNIT TESTS ===\n");

const names = (voters) => voters.map((v) => v.name).join();

// A resolver factory keyed by formId so each stubbed form yields specific data.
function resolvers(byForm) {
  return {
    standings: (f) => byForm[f.formId]?.standings ?? null,
    advancing: (f) =>
      byForm[f.formId]?.advancing ?? { R32: [], R16: [], QF: [], SF: [], F: [] },
    champion: (f) => byForm[f.formId]?.champion ?? null,
  };
}

// ---- 1. Group positions map to pos1..pos4 with the right voters ----
{
  const forms = [
    { formId: "a", formName: "Alice" },
    { formId: "b", formName: "Bob" },
  ];
  const data = {
    a: {
      standings: {
        A: [{ code: "BRA" }, { code: "ARG" }, { code: "GER" }, { code: "ESP" }],
      },
    },
    b: {
      standings: {
        A: [{ code: "ARG" }, { code: "BRA" }, { code: "ESP" }, { code: "GER" }],
      },
    },
  };
  const out = aggregateTeamStats(forms, resolvers(data));
  assert(out.BRA.pos1.length === 1 && names(out.BRA.pos1) === "Alice", "BRA 1st place voter is Alice");
  assert(out.ARG.pos1.length === 1 && names(out.ARG.pos1) === "Bob", "ARG 1st place voter is Bob");
  assert(out.BRA.pos2.length === 1 && names(out.BRA.pos2) === "Bob", "BRA 2nd place voter is Bob");
  assert(out.GER.pos3.length === 1 && out.ESP.pos4.length === 1, "GER 3rd & ESP 4th counted once (form a)");
  assert(out.BRA.pos1[0].formId === "a", "voter carries formId for deep-linking");
}

// ---- 2. Advancing rounds accumulate the right voters ----
{
  const forms = [{ formId: "a", formName: "Alice" }, { formId: "b", formName: "Bob" }];
  const data = {
    a: { advancing: { R32: ["BRA", "ARG"], R16: ["BRA"], QF: ["BRA"], SF: ["BRA"], F: ["BRA"] } },
    b: { advancing: { R32: ["BRA", "GER"], R16: ["GER"], QF: [], SF: [], F: [] } },
  };
  const out = aggregateTeamStats(forms, resolvers(data));
  assert(out.BRA.R32.length === 2, "BRA reached R32 in both forms");
  assert(out.BRA.F.length === 1 && names(out.BRA.F) === "Alice", "BRA reached final only in Alice's form");
  assert(out.GER.R16.length === 1 && out.GER.QF.length === 0, "GER reached R16 (Bob) but not QF");
  assert(out.ARG.R32.length === 1 && out.ARG.R16.length === 0, "ARG only reached R32 (Alice)");
}

// ---- 3. Champion bucket ----
{
  const forms = [{ formId: "a", formName: "Alice" }, { formId: "b", formName: "Bob" }, { formId: "c", formName: "Carol" }];
  const data = { a: { champion: "BRA" }, b: { champion: "BRA" }, c: { champion: "ARG" } };
  const out = aggregateTeamStats(forms, resolvers(data));
  assert(out.BRA.champion.length === 2 && names(out.BRA.champion) === "Alice,Bob", "BRA champion: Alice,Bob");
  assert(out.ARG.champion.length === 1 && names(out.ARG.champion) === "Carol", "ARG champion: Carol");
}

// ---- 4. Null/empty resolvers don't throw and produce no phantom entries ----
{
  const forms = [{ formId: "a", formName: "Alice" }];
  const out = aggregateTeamStats(forms, {
    standings: () => null,
    advancing: () => ({ R32: [], R16: [], QF: [], SF: [], F: [] }),
    champion: () => null,
  });
  assert(Object.keys(out).length === 0, "no teams recorded when all resolvers empty");
}

// ---- 5. Missing form name falls back; positions beyond 4 ignored ----
{
  const forms = [{ formId: "a" }];
  const data = {
    a: {
      standings: {
        A: [{ code: "T1" }, { code: "T2" }, { code: "T3" }, { code: "T4" }, { code: "T5" }],
      },
    },
  };
  const out = aggregateTeamStats(forms, resolvers(data));
  assert(out.T1.pos1[0].name === "טופס ללא שם", "missing form name falls back to placeholder");
  assert(out.T4.pos4.length === 1, "4th place counted");
  assert(out.T5 === undefined, "5th standings entry ignored (only pos1-4 exist)");
}

// ---- 6. Keys & labels are complete and aligned ----
{
  assert(TEAM_STAT_KEYS.length === 10, "exactly 10 parameters");
  assert(
    TEAM_STAT_KEYS.every((k) => typeof TEAM_STAT_LABELS[k] === "string" && TEAM_STAT_LABELS[k].length > 0),
    "every stat key has a non-empty Hebrew label",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
