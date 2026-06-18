// Tests for the retroactive rank-trend graph (#6 v2).
//
// The series is now DERIVED from official results — one point per completed
// match in chronological order, where each point is the form's leaderboard rank
// had only the matches up to that point been played. These tests pin the
// invariants that make it trustworthy: chronological ordering (independent of
// data-entry order), correct ranking at each cutoff, the "last point == live
// rank" guarantee, status gating, and cache correctness.

import { computeFormRankHistory } from "../../src/utils/computeFormRankHistory.ts";
import {
  computeScoredForms,
  assignDenseRanks,
} from "../../src/utils/leaderboardCore.ts";
import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== RANK TREND TESTS ===\n");

// Real match ids with known chronological order:
//   group-A-1  Jun 11 22:00  (earliest)
//   group-A-2  Jun 12 05:00
//   group-B-1  Jun 12 22:00  (latest)
const M1 = "group-A-1", M2 = "group-A-2", M3 = "group-B-1";

function res(id, h, a) {
  return { [id]: { homeTeam: "T1", awayTeam: "T2", homeScore: h, awayScore: a, stage: "group", group: id.split("-")[1], played: true } };
}
function form(userId, preds, extra = {}) {
  return { userId, formName: `f-${userId}`, status: "submitted", matches: preds, ...extra };
}
const bonuses = { champion: null, topScorers: [] };

// ---------------------------------------------------------------------------
// 1. Empty results → empty series
// ---------------------------------------------------------------------------
{
  const preds = { a: form("ua", {}) };
  assert(computeFormRankHistory("a", {}, preds, bonuses).length === 0, "no results → empty series");
  assert(computeFormRankHistory("a", null, preds, bonuses).length === 0, "null results → empty series");
}

// ---------------------------------------------------------------------------
// 2. One completed match → one point (sparkline itself hides <2, tested below)
// ---------------------------------------------------------------------------
{
  const results = res(M1, 2, 1);
  const preds = { a: form("ua", { [M1]: { homeScore: 2, awayScore: 1 } }) };
  const h = computeFormRankHistory("a", results, preds, bonuses);
  assert(h.length === 1, "one completed match → one point");
  assert(h[0].matchId === M1, "the point is keyed to the played match");
  assert(h[0].rank === 1, "sole form is rank 1");
}

// ---------------------------------------------------------------------------
// 3. CHRONOLOGICAL ORDER — independent of insertion order into results
// ---------------------------------------------------------------------------
{
  // Insert in REVERSE chronological order: M3 (latest) first, M1 (earliest) last.
  const results = { ...res(M3, 3, 0), ...res(M2, 0, 0), ...res(M1, 2, 1) };
  const preds = { a: form("ua", {}) };
  const h = computeFormRankHistory("a", results, preds, bonuses);
  assert(h.length === 3, "three completed matches → three points");
  assert(
    h[0].matchId === M1 && h[1].matchId === M2 && h[2].matchId === M3,
    "series is ordered by kickoff, not by results-object insertion order",
  );
}

// ---------------------------------------------------------------------------
// 4. RANK CORRECTNESS — a perfect form leads, a wrong form trails, throughout
// ---------------------------------------------------------------------------
{
  const results = { ...res(M1, 2, 1), ...res(M2, 0, 0), ...res(M3, 3, 0) };
  const perfect = form("up", { [M1]: { homeScore: 2, awayScore: 1 }, [M2]: { homeScore: 0, awayScore: 0 }, [M3]: { homeScore: 3, awayScore: 0 } });
  const wrong = form("uw", { [M1]: { homeScore: 0, awayScore: 3 }, [M2]: { homeScore: 1, awayScore: 0 }, [M3]: { homeScore: 0, awayScore: 2 } });
  const preds = { p: perfect, w: wrong };
  const hp = computeFormRankHistory("p", results, preds, bonuses);
  const hw = computeFormRankHistory("w", results, preds, bonuses);
  assert(hp.every((pt) => pt.rank === 1), "perfect form is rank 1 at every cutoff");
  assert(hw.every((pt) => pt.rank === 2), "wrong form is rank 2 at every cutoff");
  assert(hp[hp.length - 1].total > hw[hw.length - 1].total, "perfect form ends with more points");
}

// ---------------------------------------------------------------------------
// 5. RANK MOVEMENT — a form can climb as later matches reward it
// ---------------------------------------------------------------------------
{
  const results = { ...res(M1, 2, 1), ...res(M2, 1, 0), ...res(M3, 1, 0) };
  // climber: wrong on M1, right on M2 & M3 → starts behind, catches up
  const climber = form("uc", { [M1]: { homeScore: 0, awayScore: 1 }, [M2]: { homeScore: 1, awayScore: 0 }, [M3]: { homeScore: 1, awayScore: 0 } });
  // fader: right on M1 only
  const fader = form("uf", { [M1]: { homeScore: 2, awayScore: 1 }, [M2]: { homeScore: 0, awayScore: 1 }, [M3]: { homeScore: 0, awayScore: 1 } });
  const preds = { c: climber, f: fader };
  const hc = computeFormRankHistory("c", results, preds, bonuses);
  assert(hc[0].rank === 2, "climber starts at rank 2 after match 1");
  assert(hc[hc.length - 1].rank === 1, "climber finishes at rank 1");
}

// ---------------------------------------------------------------------------
// 6. FAITHFULNESS — last history point == live leaderboard rank (same core)
// ---------------------------------------------------------------------------
{
  const results = { ...res(M1, 2, 1), ...res(M2, 0, 0), ...res(M3, 3, 0) };
  const preds = {
    a: form("ua", { [M1]: { homeScore: 2, awayScore: 1 }, [M3]: { homeScore: 3, awayScore: 0 } }),
    b: form("ub", { [M1]: { homeScore: 1, awayScore: 1 }, [M2]: { homeScore: 0, awayScore: 0 } }),
    c: form("uc", { [M2]: { homeScore: 0, awayScore: 0 } }),
  };
  const { scoredForms } = computeScoredForms(results, preds, bonuses, results, false);
  const liveRanked = assignDenseRanks(scoredForms);
  for (const lr of liveRanked) {
    const h = computeFormRankHistory(lr.formId, results, preds, bonuses);
    assert(
      h[h.length - 1].rank === lr.rank,
      `last point rank (${h[h.length - 1].rank}) equals live rank (${lr.rank}) for ${lr.formId}`,
    );
    assert(h[h.length - 1].total === lr.totalPoints, `last point total equals live total for ${lr.formId}`);
  }
}

// ---------------------------------------------------------------------------
// 7. STATUS GATING — draft forms are neither scored nor returned
// ---------------------------------------------------------------------------
{
  const results = res(M1, 1, 0);
  const preds = {
    sub: form("us", { [M1]: { homeScore: 1, awayScore: 0 } }),
    draft: form("ud", { [M1]: { homeScore: 1, awayScore: 0 } }, { status: "draft" }),
  };
  assert(computeFormRankHistory("draft", results, preds, bonuses).length === 0, "draft form has no series");
  const hs = computeFormRankHistory("sub", results, preds, bonuses);
  assert(hs.length === 1 && hs[0].rank === 1, "submitted form is ranked alone (draft excluded)");
}

// ---------------------------------------------------------------------------
// 8. UNKNOWN match id in results is ignored, never crashes
// ---------------------------------------------------------------------------
{
  const results = { ...res(M1, 1, 0), "not-a-real-match": { homeScore: 1, awayScore: 1, stage: "group", played: true } };
  const preds = { a: form("ua", { [M1]: { homeScore: 1, awayScore: 0 } }) };
  const h = computeFormRankHistory("a", results, preds, bonuses);
  assert(h.length === 1 && h[0].matchId === M1, "unknown match id is filtered out of the timeline");
}

// ---------------------------------------------------------------------------
// 9. CACHE — same results ref reuses; new bonuses ref invalidates
// ---------------------------------------------------------------------------
{
  const results = res(M1, 1, 0);
  // topScorer lives at the form root (not inside matches).
  const preds = { a: form("ua", { [M1]: { homeScore: 1, awayScore: 0 } }, { topScorer: "Messi" }) };

  const noBonus = computeFormRankHistory("a", results, preds, { champion: null, topScorers: [] });
  const withBonus = computeFormRankHistory("a", results, preds, { champion: null, topScorers: ["Messi"] });
  assert(withBonus[0].total === noBonus[0].total + 8, "new bonuses reference invalidates cache and adds top-scorer points");

  const again = computeFormRankHistory("a", results, preds, { champion: null, topScorers: [] });
  assert(again[0].total === noBonus[0].total, "reverting bonuses recomputes the original total");
}

// ---------------------------------------------------------------------------
// 10. Unknown form id → empty series (no crash)
// ---------------------------------------------------------------------------
{
  const results = res(M1, 1, 0);
  const preds = { a: form("ua", { [M1]: { homeScore: 1, awayScore: 0 } }) };
  assert(computeFormRankHistory("ghost", results, preds, bonuses).length === 0, "unknown form id → empty series");
}

// ---------------------------------------------------------------------------
// Wiring — sparkline consumes a history prop; Leaderboard derives it lazily;
// the retired localStorage util is gone.
// ---------------------------------------------------------------------------
assert(existsMigratedSrc("src/components/RankTrendSparkline.jsx"), "RankTrendSparkline component exists");
const spark = readMigratedSrc("src/components/RankTrendSparkline.jsx");
assert(/history\.length < 2/.test(spark), "sparkline still hides until at least two points");
assert(/\{\s*history\s*\}\s*:/.test(spark) || /history\s*\}:/.test(spark), "sparkline takes a history prop (not formId)");

const lb = readMigratedSrc("src/pages/Leaderboard.jsx");
assert(/computeFormRankHistory\(/.test(lb), "Leaderboard computes the derived rank history");
assert(/RankTrendSparkline\s+history=\{selectedFormHistory\}/.test(lb), "form detail passes the derived history to the sparkline");
assert(!/recordRanks/.test(lb), "the per-visit recordRanks side-effect is removed");
assert(!existsMigratedSrc("src/utils/rankHistory.jsx") && !existsMigratedSrc("src/utils/rankHistory.js"), "retired localStorage rankHistory util is deleted");

// ---------------------------------------------------------------------------
// Readability (UX/infographic pass) — the chart must be self-explanatory.
// ---------------------------------------------------------------------------
// 1. RTL time direction: start drawn at the right edge, current at the left,
//    so the line agrees with Hebrew reading order and the start/current labels.
assert(/W\s*-\s*PAD\s*-\s*\(i\s*\/\s*\(n\s*-\s*1\)\)/.test(spark), "x axis runs right→left (RTL time direction)");
// 2. Trend-driven colour shared by the line and the badge: green up, red down,
//    blue flat — no more green-line/red-badge contradiction.
assert(/trend\s*===\s*"down"/.test(spark) && /var\(--color-danger\)/.test(spark), "a worsening trend colours the line danger-red");
assert(/var\(--color-primary\)/.test(spark) && /var\(--color-secondary\)/.test(spark), "trend colour resolves to primary (up) / secondary (flat) too");
// 3. Inverted-axis cue: an explicit direction key removes the ambiguity.
assert(/הדירוג טוב יותר/.test(spark), "a direction key explains that a higher line = better rank");
// 4. A dashed starting-place baseline anchors the inverted axis.
assert(/strokeDasharray/.test(spark), "a dashed starting-place baseline is drawn");
// 5. Endpoint labels name start vs current (not just bare 'place N' columns).
assert(/התחלה/.test(spark) && /נוכחי/.test(spark), "endpoints are labelled התחלה (start) and נוכחי (current)");
// 6. The accessible description states start, current and the change.
assert(/aria-label=\{ariaLabel\}/.test(spark) && /מגמת דירוג: התחלה במקום/.test(spark), "aria-label narrates start → current and the delta");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
