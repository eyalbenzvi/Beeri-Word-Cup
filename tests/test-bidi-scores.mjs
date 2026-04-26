// Static source audit: verifies match-score rendering uses AWAY-before-HOME
// source order so that, in the RTL Hebrew document, the home digit visually
// lands next to the home team name on the right and is read first by Hebrew
// readers.
//
// Background: digit sub-runs always render LTR. With source "{home}-{away}"
// the home digit ends up on the LEFT, but the home team name (first flex
// child) is rendered on the RIGHT. Hebrew readers reading RTL therefore
// interpret the right number ("away") as the home team's score — scores look
// reversed. Putting away first in source flips the visual layout so the right
// edge of the score block carries the home digit.
//
// Coverage: every file in the project that renders a two-number score string
// is asserted here so a future "fix" doesn't silently re-introduce the bug.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== BIDI SCORES STATIC AUDIT ===\n");

// === 1. No legacy `dir="ltr"` score wrappers anywhere ===
const SCORE_FILES = [
  "src/components/MatchCard.jsx",
  "src/pages/AllForms.jsx",
  "src/components/UpcomingMatches.jsx",
  "src/pages/Leaderboard.jsx",
  "src/components/SummaryEditor.jsx",
  "src/components/AdminResultsTab.jsx",
  // MatchAnalysis intentionally keeps `dir="ltr"` on the AI suggestion line
  // — verified separately below — so it isn't listed here.
];
for (const f of SCORE_FILES) {
  const src = fs.readFileSync(f, "utf8");
  const legacyPair = /dir="ltr"[^>]*>\s*\{[^}]*[Ss]core[^}]*\}\s*[–-]\s*\{[^}]*[Ss]core[^}]*\}/.test(src);
  assert(!legacyPair, `${f}: no legacy dir=ltr wrapping {X.Score} – {Y.Score}`);
}

// === 2. MatchCard: actual result, prediction-display, and "your guess" ===
{
  const src = fs.readFileSync("src/components/MatchCard.jsx", "utf8");
  assert(
    /<bdi>\{actualResult\.awayScore\}[–-]\{actualResult\.homeScore\}<\/bdi>/.test(src),
    "MatchCard actualResult: <bdi>{away}–{home}</bdi>",
  );
  assert(
    (src.match(/<bdi>\{predAway\}[–-]\{predHome\}<\/bdi>/g) || []).length >= 2,
    "MatchCard prediction display + 'ניחוש' line: both use <bdi>{predAway}–{predHome}</bdi>",
  );
  assert(
    !/<bdi>\{actualResult\.homeScore\}\s*[–-]\s*\{actualResult\.awayScore\}<\/bdi>/.test(src),
    "MatchCard: no legacy {home}–{away} for actualResult",
  );
  assert(
    !/<bdi>\{predHome\}\s*[–-]\s*\{predAway\}<\/bdi>/.test(src),
    "MatchCard: no legacy {predHome}–{predAway}",
  );
}

// === 3. AllForms (per-row score) ===
{
  const src = fs.readFileSync("src/pages/AllForms.jsx", "utf8");
  assert(
    /<bdi>\{prediction\.awayScore\}[–-]\{prediction\.homeScore\}<\/bdi>/.test(src),
    "AllForms: <bdi>{away}–{home}</bdi>",
  );
  assert(
    !/<bdi>\{prediction\.homeScore\}\s*[–-]\s*\{prediction\.awayScore\}<\/bdi>/.test(src),
    "AllForms: no legacy home-away",
  );
}

// === 4. UpcomingMatches (per-form prediction line) ===
{
  const src = fs.readFileSync("src/components/UpcomingMatches.jsx", "utf8");
  assert(
    /<bdi[^>]*>[\s\S]{0,80}aligned\.awayScore[\s\S]{0,40}aligned\.homeScore[\s\S]{0,40}<\/bdi>/.test(src),
    "UpcomingMatches: <bdi>{aligned.away}–{aligned.home}</bdi>",
  );
  assert(
    !/<bdi[^>]*>[\s\S]{0,80}aligned\.homeScore[\s\S]{0,40}aligned\.awayScore[\s\S]{0,40}<\/bdi>/.test(src),
    "UpcomingMatches: no legacy home-away",
  );
}

// === 5. Leaderboard (predicted matchup tail + per-row stats use single-number bdi) ===
{
  const src = fs.readFileSync("src/pages/Leaderboard.jsx", "utf8");
  assert(
    !/<span dir="ltr">\{score\./.test(src),
    "Leaderboard: score spans converted to <bdi>",
  );
  assert(
    /<bdi>\{score\.totalPoints\}<\/bdi>/.test(src),
    "Leaderboard: totalPoints uses <bdi>",
  );
  assert(
    /<bdi>\{score\.exactScoreCount\}<\/bdi>/.test(src),
    "Leaderboard: exactScoreCount uses <bdi>",
  );
  assert(
    /<bdi>\(\{prediction\.awayScore\}-\{prediction\.homeScore\}\)<\/bdi>/.test(src),
    "Leaderboard predicted matchup: <bdi>({away}-{home})</bdi>",
  );
  assert(
    !/<bdi>\(\{prediction\.homeScore\}-\{prediction\.awayScore\}\)<\/bdi>/.test(src),
    "Leaderboard predicted matchup: no legacy home-away in parens",
  );
}

// === 6. MatchAnalysis (AI suggested score chip) ===
{
  const src = fs.readFileSync("src/components/MatchAnalysis.jsx", "utf8");
  assert(
    /\{result\.awayScore\}\s*-\s*\{result\.homeScore\}/.test(src),
    "MatchAnalysis: {away} - {home}",
  );
  assert(
    !/>\s*\{result\.homeScore\}\s*-\s*\{result\.awayScore\}\s*</.test(src),
    "MatchAnalysis: no legacy {home} - {away}",
  );
}

// === 7. AdminResultsTab (admin-entered result display, not the inputs) ===
{
  const src = fs.readFileSync("src/components/AdminResultsTab.jsx", "utf8");
  assert(
    /\{result\.awayScore\}\s*-\s*\{result\.homeScore\}/.test(src),
    "AdminResultsTab: {away} - {home}",
  );
  assert(
    !/>\s*\{result\.homeScore\}\s*-\s*\{result\.awayScore\}\s*</.test(src),
    "AdminResultsTab: no legacy {home} - {away}",
  );
}

// === 8. SummaryEditor (admin blog match panel + match-row chip) ===
{
  const src = fs.readFileSync("src/components/SummaryEditor.jsx", "utf8");
  assert(
    /\$\{r\.awayScore\}[–-]\$\{r\.homeScore\}/.test(src),
    "SummaryEditor inline score: ${away}–${home}",
  );
  assert(
    /\$\{result\.awayScore\}[–-]\$\{result\.homeScore\}/.test(src),
    "SummaryEditor scoreText: ${away}–${home}",
  );
  assert(
    !/\$\{r\.homeScore\}[–-]\$\{r\.awayScore\}/.test(src),
    "SummaryEditor: no legacy ${home}–${away} for r",
  );
  assert(
    !/\$\{result\.homeScore\}[–-]\$\{result\.awayScore\}/.test(src),
    "SummaryEditor: no legacy ${home}–${away} for result",
  );
}

// === 9. Stats page: most-common score key uses {away}-{home} ===
{
  const src = fs.readFileSync("src/pages/Stats.jsx", "utf8");
  assert(
    /\$\{p\.awayScore\}-\$\{p\.homeScore\}/.test(src),
    "Stats topScores key: ${away}-${home}",
  );
  assert(
    !/\$\{p\.homeScore\}-\$\{p\.awayScore\}/.test(src),
    "Stats: no legacy ${home}-${away} key",
  );
}

// === 10. summaryStats util (key + actualKey both flipped) ===
{
  const src = fs.readFileSync("src/utils/summaryStats.js", "utf8");
  assert(
    /const key = `\$\{pred\.awayScore\}-\$\{pred\.homeScore\}`/.test(src),
    "summaryStats key: ${away}-${home}",
  );
  assert(
    /const actualKey = result \? `\$\{Number\(result\.awayScore\)\}-\$\{Number\(result\.homeScore\)\}`/.test(src),
    "summaryStats actualKey: ${away}-${home}",
  );
}

// === 11. statStarters (every "X:Y בול" template) ===
{
  const src = fs.readFileSync("src/utils/statStarters.js", "utf8");
  // Every templated score must use away:home order, never home:away.
  const homeFirst = src.match(/\$\{result\.homeScore\}:\$\{result\.awayScore\}/g);
  assert(
    !homeFirst,
    `statStarters: no legacy \${home}:\${away} templates (found ${homeFirst?.length || 0})`,
  );
  const awayFirst = src.match(/\$\{result\.awayScore\}:\$\{result\.homeScore\}/g);
  assert(
    awayFirst && awayFirst.length >= 4,
    `statStarters: at least 4 \${away}:\${home} templates (found ${awayFirst?.length || 0})`,
  );
  // actualKey for stat comparison
  assert(
    /const actualKey = `\$\{Number\(result\.awayScore\)\}-\$\{Number\(result\.homeScore\)\}`/.test(src),
    "statStarters actualKey: ${away}-${home}",
  );
}

// === 12. Per-row score components (Results.jsx, SimulatorPanel, AdminFormsTab,
//        MatchDigest) display each team's score on its own row/element. They
//        don't hit the LTR-digit-sub-run trap, but assert they still split the
//        scores into separate spans rather than one inline text. ===
{
  const results = fs.readFileSync("src/pages/Results.jsx", "utf8");
  // Each team gets its own `flex items-center justify-between py-1.5` row
  // containing the team name + that team's single score.
  const justifyBetweenRows = (results.match(/flex items-center justify-between py-1\.5/g) || []).length;
  assert(
    justifyBetweenRows >= 2,
    `Results.jsx: at least 2 per-team justify-between rows (found ${justifyBetweenRows})`,
  );
  assert(
    /\{result\.homeScore\}/.test(results) && /\{result\.awayScore\}/.test(results),
    "Results.jsx: home and away each rendered separately",
  );
  // Crucially the two scores are NOT inline in one bdi/span pair (no reversal
  // risk): no `homeScore}–{awayScore` (or " - ") pattern in source.
  assert(
    !/\{result\.homeScore\}\s*[–-]\s*\{result\.awayScore\}/.test(results),
    "Results.jsx: no inline {home}–{away} pair (each score is its own span)",
  );

  const sim = fs.readFileSync("src/components/SimulatorPanel.jsx", "utf8");
  assert(
    /result \? result\.homeScore : "—"/.test(sim) &&
      /result \? result\.awayScore : "—"/.test(sim),
    "SimulatorPanel: home/away each rendered in its own per-team row",
  );

  const adminForms = fs.readFileSync("src/components/AdminFormsTab.jsx", "utf8");
  // Admin forms tab keeps its inline order [homeName][homeInput]-[awayInput][awayName].
  // RTL flex reverses: home name + home input land on the right edge.
  assert(
    /defaultValue=\{pred\?\.homeScore[\s\S]{0,400}defaultValue=\{pred\?\.awayScore/.test(adminForms),
    "AdminFormsTab: home input precedes away input in source (RTL flex puts home input next to home name on the right)",
  );

  const digest = fs.readFileSync("src/components/MatchDigest.jsx", "utf8");
  // MatchDigest scoreline uses three flex children — RTL flex reverses, so
  // homeScore first in source ends up on the right. That's the correct visual
  // order; this assertion locks it in.
  assert(
    /\{Number\.isFinite\(result\?\.homeScore\)[\s\S]{0,300}\{Number\.isFinite\(result\?\.awayScore\)/.test(digest),
    "MatchDigest scoreline: homeScore first in source (RTL flex puts it on the right)",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
