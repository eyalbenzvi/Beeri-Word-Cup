// Unit + wiring tests for crowd consensus on the Results cards (#8).
//   - computeConsensusMap: pure one-pass aggregation across all forms.
//   - Results page only shows it once predictions are locked (no pre-kickoff leak).

import { computeConsensusMap } from "../../src/utils/matchPredictionStats.ts";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== CONSENSUS MAP + RESULTS WIRING TESTS ===\n");

const form = (id, preds) => ({ formId: id, formName: id, matches: preds });

// ---- Aggregation across forms ---------------------------------------------
{
  const forms = [
    form("a", { m1: { homeScore: 2, awayScore: 1 } }), // home win, 2-1
    form("b", { m1: { homeScore: 2, awayScore: 1 } }), // home win, 2-1
    form("c", { m1: { homeScore: 0, awayScore: 0 } }), // draw
    form("d", { m1: { homeScore: 1, awayScore: 3 } }), // away win
    form("e", { m2: { homeScore: 1, awayScore: 1 } }), // different match
  ];
  const map = computeConsensusMap(forms);
  assert(map.m1.preds === 4, "m1 counts only its 4 predictions");
  assert(map.m1.homeWin === 2 && map.m1.draw === 1 && map.m1.awayWin === 1, "m1 outcome buckets correct");
  assert(map.m1.topHome === 2 && map.m1.topAway === 1 && map.m1.topCount === 2, "m1 most-common score is 2-1 (x2)");
  assert(map.m2.preds === 1, "m2 tallied separately");
  assert(map.m1.homeWin + map.m1.draw + map.m1.awayWin === map.m1.preds, "buckets partition all predictions");
}

// ---- Ignores incomplete predictions ---------------------------------------
{
  const forms = [
    form("a", { m1: { homeScore: 1, awayScore: null } }),
    form("b", { m1: { homeScore: null, awayScore: null } }),
    form("c", { m1: { homeScore: 0, awayScore: 0 } }),
  ];
  const map = computeConsensusMap(forms);
  assert(map.m1.preds === 1, "predictions missing a score are skipped");
}

// ---- Empty input -----------------------------------------------------------
assert(Object.keys(computeConsensusMap([])).length === 0, "no forms → empty map");

// ---- Deterministic tie-break ----------------------------------------------
{
  // 1-0 and 0-1 each once → tie-break picks the lexicographically smaller key "0-1".
  const forms = [form("a", { m: { homeScore: 1, awayScore: 0 } }), form("b", { m: { homeScore: 0, awayScore: 1 } })];
  const map = computeConsensusMap(forms);
  assert(map.m.topHome === 0 && map.m.topAway === 1, "ties break deterministically by key");
}

// ---- Results page wiring ---------------------------------------------------
const results = readMigratedSrc("src/pages/Results.jsx");
assert(/computeConsensusMap/.test(results), "Results imports computeConsensusMap");
assert(/settings\.predictionsLocked/.test(results), "consensus gated on predictions being locked");
assert(/if \(!settings\.predictionsLocked\) return \{\};/.test(results), "no consensus computed before lock (no pre-kickoff leak)");
assert(/MatchConsensusLine/.test(results), "ResultMatchCard renders the consensus line");
assert(/consensus=\{consensusMap\[match\.id\]\}/.test(results), "consensus passed per match (both view modes)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
