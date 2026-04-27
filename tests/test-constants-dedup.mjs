// Static + runtime audit that locks in the constants/magic-number cleanups:
//
//  1. STAGES (data/matches.js) is the single source of truth and STAGE_LABELS
//     (utils/constants.js) is identity-equal to it (re-export, not a copy).
//  2. SCORING_DATA (constants/scoring.js) is derived from POINTS (utils/scoring.js)
//     so a tweak to scoring rules can't drift from the public rules table.
//  3. MAX_AUDIT_LOG_SIZE is exported from a single module (storeAudit.js) and
//     the literal `200` is no longer present in store.js.
//  4. KNOCKOUT_STAGE_ORDER is not re-declared as a private array in any
//     production source file outside utils/constants.js.
//  5. retryDelay in store.js uses named RETRY_BASE_MS / RETRY_MAX_MS rather
//     than bare 2000 / 30000 literals.
//  6. THIRD_PLACE_QUALIFIERS, MAX_SCORE, PAGE_SIZE, MAX_RESULTS,
//     MISSING_MATCHES_PREVIEW_LIMIT each appear as a named constant in their
//     home file (no surviving bare literals on the same lines).
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== CONSTANTS DEDUP STATIC AUDIT ===\n");

// 1. STAGES === STAGE_LABELS at runtime
{
  const matches = await import("../src/data/matches.js");
  const constants = await import("../src/utils/constants.js");
  assert(constants.STAGE_LABELS === matches.STAGES,
    "STAGE_LABELS is the same object reference as STAGES (re-export, not a copy)");
  assert(constants.getStageLabel("R32") === matches.STAGES.R32,
    "getStageLabel reads through STAGES");
  assert(constants.getStageLabel("group") === matches.STAGES.group,
    "getStageLabel resolves the 'group' key (was missing from old STAGE_LABELS)");
  assert(Array.isArray(constants.KNOCKOUT_STAGE_ORDER) && constants.KNOCKOUT_STAGE_ORDER.length === 6,
    "KNOCKOUT_STAGE_ORDER still has 6 entries");
}

// 2. SCORING_DATA derived from POINTS
{
  const scoring = await import("../src/utils/scoring.js");
  const constants = await import("../src/constants/scoring.js");
  for (const [, outcome, exact, advancing] of constants.SCORING_DATA) {
    assert(typeof outcome === "number", "SCORING_DATA outcome is a number");
    assert(typeof exact === "number", "SCORING_DATA exact is a number");
    assert(advancing === null || typeof advancing === "number", "SCORING_DATA advancing is null or number");
  }
  // Mutating POINTS at runtime would be unusual, but we can at least confirm
  // the values that DO appear in SCORING_DATA all match a stage in POINTS.
  const labelToStage = {
    "בתים": "group",
    "שלב ה-32": "R32",
    "שמינית גמר": "R16",
    "רבע גמר": "QF",
    "חצי גמר": "SF",
    "מקום שלישי": "3RD",
    "גמר": "F",
  };
  for (const [label, outcome, exact, advancing] of constants.SCORING_DATA) {
    const stage = labelToStage[label];
    const p = scoring.POINTS[stage];
    assert(p.outcome === outcome, `SCORING_DATA[${label}].outcome derived from POINTS.${stage}.outcome`);
    assert(p.exactScore === exact, `SCORING_DATA[${label}].exact derived from POINTS.${stage}.exactScore`);
    if (advancing !== null) {
      assert(p.advancing === advancing, `SCORING_DATA[${label}].advancing derived from POINTS.${stage}.advancing`);
    }
  }
  assert(constants.BONUSES.champion === scoring.BONUSES.champion, "BONUSES.champion re-exported");
  assert(constants.BONUSES.topScorer === scoring.BONUSES.topScorer, "BONUSES.topScorer re-exported");
}

// 3. MAX_AUDIT_LOG_SIZE deduped
// Originally store.js owned its own copy of `auditLog` + a duplicate cap
// check. The cap check now lives entirely inside storeAudit.js (single
// source of truth); store.js delegates via the imported logAdminAction.
{
  const storeAudit = await import("../src/storeAudit.js");
  assert(typeof storeAudit.MAX_AUDIT_LOG_SIZE === "number",
    "storeAudit exports MAX_AUDIT_LOG_SIZE");
  const storeAuditSrc = fs.readFileSync("src/storeAudit.js", "utf8");
  assert(/auditLog\.length\s*>\s*MAX_AUDIT_LOG_SIZE/.test(storeAuditSrc),
    "storeAudit.js owns the cap check");
  const storeSrc = fs.readFileSync("src/store.js", "utf8");
  assert(!/auditLog\.length\s*>\s*200/.test(storeSrc),
    "store.js no longer hardcodes `auditLog.length > 200`");
  assert(!/auditLog\.length\s*>\s*MAX_AUDIT_LOG_SIZE/.test(storeSrc),
    "store.js no longer duplicates the cap check (delegates to storeAudit)");
  assert(/from\s+["']\.\/storeAudit["']/.test(storeSrc),
    "store.js imports from storeAudit");
  assert(/logAdminAction\s+as\s+logAdminActionToBuffer/.test(storeSrc),
    "store.js imports logAdminAction (renamed to avoid shadowing)");
}

// 4. KNOCKOUT_STAGE_ORDER not re-declared as a private array
{
  const adminResults = fs.readFileSync("src/components/AdminResultsTab.jsx", "utf8");
  assert(!/const\s+knockoutStageOrder\s*=\s*\[/.test(adminResults),
    "AdminResultsTab no longer declares its own knockoutStageOrder");
  assert(/import\s*\{[^}]*KNOCKOUT_STAGE_ORDER[^}]*\}\s*from\s*["']\.\.\/utils\/constants["']/.test(adminResults),
    "AdminResultsTab imports KNOCKOUT_STAGE_ORDER from utils/constants");
}

// 5. retryDelay constants
{
  const storeSrc = fs.readFileSync("src/store.js", "utf8");
  assert(/RETRY_BASE_MS\s*=\s*2000/.test(storeSrc), "store.js defines RETRY_BASE_MS");
  assert(/RETRY_MAX_MS\s*=\s*30000/.test(storeSrc), "store.js defines RETRY_MAX_MS");
  assert(!/Math\.min\(2000\s*\*\s*Math\.pow/.test(storeSrc),
    "retryDelay no longer uses bare 2000 literal");
  assert(!/Math\.pow\(2,\s*attempt\)\s*,\s*30000/.test(storeSrc),
    "retryDelay no longer uses bare 30000 literal");
}

// 6. THIRD_PLACE_QUALIFIERS in bracket.js
{
  const src = fs.readFileSync("src/utils/bracket.js", "utf8");
  assert(/THIRD_PLACE_QUALIFIERS\s*=\s*8/.test(src),
    "bracket.js defines THIRD_PLACE_QUALIFIERS = 8");
  assert(!/thirdPlace\.slice\(0,\s*8\)/.test(src),
    "bracket.js no longer slices with a bare 8");
}

// 7. MatchCard MAX_SCORE
{
  const src = fs.readFileSync("src/components/MatchCard.jsx", "utf8");
  assert(/const\s+MAX_SCORE\s*=\s*20/.test(src), "MatchCard defines MAX_SCORE");
  assert(!/Math\.min\(20,/.test(src),
    "MatchCard no longer has bare Math.min(20, …)");
  assert(!/max="20"/.test(src), "MatchCard input max attr uses MAX_SCORE");
  assert(!/\(0-20\)/.test(src), "MatchCard aria-label uses MAX_SCORE template");
}

// 8. Leaderboard PAGE_SIZE + ADVANCING_POINTS_LABELS
{
  const src = fs.readFileSync("src/pages/Leaderboard.jsx", "utf8");
  assert(/const\s+PAGE_SIZE\s*=\s*20/.test(src), "Leaderboard defines PAGE_SIZE");
  assert(!/useState\(20\)/.test(src), "Leaderboard useState uses PAGE_SIZE");
  assert(!/s\s*\+\s*20\)/.test(src), "Leaderboard show-more uses PAGE_SIZE");
  assert(/ADVANCING_POINTS_LABELS/.test(src),
    "Leaderboard chip labels lifted to ADVANCING_POINTS_LABELS");
  assert(/\["R32",\s*"שלב ה-32"\]/.test(src), "ADVANCING_POINTS_LABELS R32 → 'שלב ה-32'");
  assert(/\["R16",\s*"שמינית"\]/.test(src), "ADVANCING_POINTS_LABELS R16 → 'שמינית'");
}

// 9. MatchSearch MAX_RESULTS, AdminDashboardTab MISSING_MATCHES_PREVIEW_LIMIT
{
  const ms = fs.readFileSync("src/components/MatchSearch.jsx", "utf8");
  assert(/const\s+MAX_RESULTS\s*=\s*20/.test(ms),
    "MatchSearch defines MAX_RESULTS");
  assert(!/results\.slice\(0,\s*20\)/.test(ms),
    "MatchSearch no longer slices with a bare 20");

  const adt = fs.readFileSync("src/components/AdminDashboardTab.jsx", "utf8");
  assert(/MISSING_MATCHES_PREVIEW_LIMIT\s*=\s*8/.test(adt),
    "AdminDashboardTab defines MISSING_MATCHES_PREVIEW_LIMIT");
  assert(!/\.slice\(0,\s*8\)/.test(adt),
    "AdminDashboardTab no longer slices with a bare 8");
}

// 10. ScoringTable BONUSES wiring
{
  const src = fs.readFileSync("src/components/ScoringTable.jsx", "utf8");
  assert(/BONUSES\.champion/.test(src), "ScoringTable uses BONUSES.champion");
  assert(/BONUSES\.topScorer/.test(src), "ScoringTable uses BONUSES.topScorer");
  // The bonus values themselves shouldn't appear as bare literals next to LABELS.pointsShort.
  assert(!/>9 \{LABELS\.pointsShort\}/.test(src),
    "ScoringTable no longer renders bare 9 next to LABELS.pointsShort");
  assert(!/>8 \{LABELS\.pointsShort\}/.test(src),
    "ScoringTable no longer renders bare 8 next to LABELS.pointsShort");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
