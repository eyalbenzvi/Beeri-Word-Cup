// Static source audit — RTL-correct score rendering.
//
// Background: digit sub-runs always render LTR within their bidi context.
// With JSX written as `{home}-{away}` the home digit ends up visually on
// the LEFT, while the home team name (the first flex child) renders on the
// RIGHT in an RTL document. Hebrew readers reading right-to-left then
// interpret the right number ("away") as the home team's score — scores
// look reversed. The fix is to put `away` FIRST in source so the right-
// hand digit is the home score.
//
// As of PR2 (#97), the inline `<bdi>{X.away}–{X.home}</bdi>` pattern lives
// behind a single `<Score home={...} away={...} />` component. This audit
// now locks down:
//   1. Score is imported wherever a two-number scoreline is rendered.
//   2. The `home={...}` / `away={...}` props are explicit (no positional
//      mistakes) and the home prop comes from a `*.homeScore` field.
//   3. Score itself (in Score.jsx) puts `away` BEFORE `home` in source.
//   4. String-template scorelines in admin / stats utils still use
//      `${away}-${home}` order.
//   5. Per-row score components (split into 2 spans) keep their existing
//      RTL-flex-reverse-friendly home-first source order.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== BIDI SCORES STATIC AUDIT ===\n");

// === 0. Score component is the single source of truth for inline pairs ===
{
  const score = fs.readFileSync("src/components/Score.jsx", "utf8");
  // Inside the bdi, `away` must appear BEFORE `home` in source order.
  // The regex tolerates the separator + whitespace + JSX expression braces.
  assert(
    /<bdi[^>]*>\s*\{away\}[\s\S]{0,100}\{home\}\s*<\/bdi>/.test(score),
    "Score.jsx: bdi puts {away} before {home} in source",
  );
  // Reverse pattern must NOT appear — that would be the legacy bug.
  assert(
    !/<bdi[^>]*>\s*\{home\}[\s\S]{0,100}\{away\}\s*<\/bdi>/.test(score),
    "Score.jsx: no reversed {home} before {away}",
  );
}

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

// === 2. Inline pair callers all import + use <Score /> ===
//
// Each consumer must:
//   (a) import Score from the right relative path.
//   (b) pass home={...homeScore} + away={...awayScore} to Score.
//   (c) NOT contain a leftover inline `<bdi>{...away...}–{...home...}</bdi>`
//       pattern — the static guard against re-introducing the duplication.
const SCORE_CONSUMERS = [
  {
    file: "src/components/MatchCard.jsx",
    importRe: /import\s+Score\s+from\s+["']\.\/Score["']/,
    requiredProps: [
      // actual result + two prediction renders
      /home=\{actualResult\.homeScore\}\s+away=\{actualResult\.awayScore\}/,
      /home=\{predHome\}\s+away=\{predAway\}/,
    ],
    // `predHome`/`predAway` are normal local vars — match either both
    // explicit or shorthand if a future refactor switches.
  },
  {
    file: "src/pages/AllForms.jsx",
    importRe: /import\s+Score\s+from\s+["']\.\.\/components\/Score["']/,
    requiredProps: [
      /home=\{prediction\.homeScore\}\s+away=\{prediction\.awayScore\}/,
    ],
  },
  {
    file: "src/components/UpcomingMatches.jsx",
    importRe: /import\s+Score\s+from\s+["']\.\/Score["']/,
    requiredProps: [
      /home=\{aligned\.homeScore\}/,
      /away=\{aligned\.awayScore\}/,
    ],
  },
  {
    file: "src/pages/Leaderboard.jsx",
    importRe: /import\s+Score\s+from\s+["']\.\.\/components\/Score["']/,
    requiredProps: [
      // Leaderboard's predicted-matchup tail uses separator="-" + parens
      /home=\{prediction\.homeScore\}\s+away=\{prediction\.awayScore\}\s+separator="-"\s+wrap="parens"/,
    ],
  },
];
for (const { file, importRe, requiredProps } of SCORE_CONSUMERS) {
  const src = fs.readFileSync(file, "utf8");
  assert(importRe.test(src), `${file}: imports Score from the right path`);
  for (const rp of requiredProps) {
    assert(rp.test(src), `${file}: passes ${rp} to Score`);
  }
  // No leftover legacy inline pattern.
  const legacyAwayBdi = /<bdi[^>]*>\s*\{[^}]*\.awayScore\}[\s\S]{0,40}\{[^}]*\.homeScore\}\s*<\/bdi>/.test(src);
  assert(!legacyAwayBdi, `${file}: no leftover inline <bdi>{X.away}–{X.home}</bdi>`);
  // No legacy reversed pattern either (would be a regression to the
  // pre-fix bug — we want the Score component, not raw flipped JSX).
  const legacyHomeBdi = /<bdi[^>]*>\s*\{[^}]*\.homeScore\}[\s\S]{0,40}\{[^}]*\.awayScore\}\s*<\/bdi>/.test(src);
  assert(!legacyHomeBdi, `${file}: no reversed <bdi>{X.home}–{X.away}</bdi>`);
}

// === 3. Leaderboard: single-number bdi wrappers (totalPoints, exactScoreCount)
//        still use `<bdi>` (these aren't pairs — they only need bidi
//        isolation, not source-order flipping). ===
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
}

// === 4. MatchAnalysis: AI suggestion keeps explicit dir="ltr" + away first ===
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

// === 5. AdminResultsTab (admin-entered result display) ===
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

// === 6. SummaryEditor template strings (admin blog match panel) ===
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

// === 7. Stats page: most-common score key uses {away}-{home} ===
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

// === 8. summaryStats util (key + actualKey both flipped) ===
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

// === 9. statStarters (every "X:Y בול" template) ===
{
  const src = fs.readFileSync("src/utils/statStarters.js", "utf8");
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
  assert(
    /const actualKey = `\$\{Number\(result\.awayScore\)\}-\$\{Number\(result\.homeScore\)\}`/.test(src),
    "statStarters actualKey: ${away}-${home}",
  );
}

// === 10. Per-row score components (Results.jsx, SimulatorPanel, AdminFormsTab,
//         MatchDigest) display each team's score in a separate flex child.
//         They don't hit the LTR-digit-sub-run trap, but verify they
//         still split the scores into separate spans rather than one
//         inline text. ===
{
  const results = fs.readFileSync("src/pages/Results.jsx", "utf8");
  const justifyBetweenRows = (results.match(/flex items-center justify-between py-1\.5/g) || []).length;
  assert(
    justifyBetweenRows >= 2,
    `Results.jsx: at least 2 per-team justify-between rows (found ${justifyBetweenRows})`,
  );
  assert(
    /\{result\.homeScore\}/.test(results) && /\{result\.awayScore\}/.test(results),
    "Results.jsx: home and away each rendered separately",
  );
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
  assert(
    /defaultValue=\{pred\?\.homeScore[\s\S]{0,600}defaultValue=\{pred\?\.awayScore/.test(adminForms),
    "AdminFormsTab: home input precedes away input in source (RTL flex puts home input next to home name on the right)",
  );

  const digest = fs.readFileSync("src/components/MatchDigest.jsx", "utf8");
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
