// Static source audit: verifies match-score rendering uses <bdi> wrappers with
// AWAY-before-HOME source order so that, in the RTL Hebrew document, the home
// digit visually lands next to the home team name on the right and is read
// first by Hebrew readers.
//
// Background: the digit sub-run inside <bdi> always renders LTR. With source
// "{home}-{away}" the home digit ends up on the LEFT, but the home team name
// (first flex child) is rendered on the RIGHT. Hebrew readers read RTL and
// therefore interpret the right number ("away") as the home team's score —
// scores look reversed. Putting away first in source flips the visual layout
// so the right edge of the score block carries the home digit. See user
// feedback "ALL the scores in the website are presented reversed".
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== BIDI SCORES STATIC AUDIT ===\n");

const SCORE_FILES = [
  "src/components/MatchCard.jsx",
  "src/pages/AllForms.jsx",
  "src/components/UpcomingMatches.jsx",
  "src/pages/Leaderboard.jsx",
];

for (const f of SCORE_FILES) {
  const src = fs.readFileSync(f, "utf8");
  // No dir="ltr" wrapping two numeric expressions separated by dash
  const legacyPair = /dir="ltr"[^>]*>\s*\{[^}]*[Ss]core[^}]*\}\s*[–-]\s*\{[^}]*[Ss]core[^}]*\}/.test(src);
  assert(!legacyPair, `${f}: no legacy dir=ltr wrapping {X.Score} – {Y.Score}`);
}

// --- MatchCard: verify correct source order in bdi wrappers (away-before-home) ---
{
  const src = fs.readFileSync("src/components/MatchCard.jsx", "utf8");
  // actualResult: awayScore must come before homeScore in source so Hebrew
  // RTL reading lands the home digit next to the home team name on the right.
  assert(
    /<bdi>\{actualResult\.awayScore\}[–-]\{actualResult\.homeScore\}<\/bdi>/.test(src),
    "MatchCard actualResult: <bdi>{away}–{home}</bdi>"
  );
  // prediction display (non-editable): predAway before predHome
  assert(
    /<bdi>\{predAway\}[–-]\{predHome\}<\/bdi>/.test(src),
    "MatchCard prediction display: <bdi>{predAway}–{predHome}</bdi>"
  );
  // Old reversed (home-before-away) pattern eliminated
  assert(
    !/<bdi>\{actualResult\.homeScore\}\s*[–-]\s*\{actualResult\.awayScore\}<\/bdi>/.test(src),
    "MatchCard: no legacy {home}–{away} for actualResult"
  );
  assert(
    !/<bdi>\{predHome\}\s*[–-]\s*\{predAway\}<\/bdi>/.test(src),
    "MatchCard: no legacy {predHome}–{predAway}"
  );
}

// --- AllForms ---
{
  const src = fs.readFileSync("src/pages/AllForms.jsx", "utf8");
  assert(
    /<bdi>\{prediction\.awayScore\}[–-]\{prediction\.homeScore\}<\/bdi>/.test(src),
    "AllForms: <bdi>{away}–{home}</bdi>"
  );
  assert(
    !/<bdi>\{prediction\.homeScore\}\s*[–-]\s*\{prediction\.awayScore\}<\/bdi>/.test(src),
    "AllForms: no legacy home-away"
  );
}

// --- UpcomingMatches ---
{
  const src = fs.readFileSync("src/components/UpcomingMatches.jsx", "utf8");
  // Look for awayScore appearing before homeScore inside the bdi block
  assert(
    /<bdi[^>]*>[\s\S]{0,80}aligned\.awayScore[\s\S]{0,40}aligned\.homeScore[\s\S]{0,40}<\/bdi>/.test(src),
    "UpcomingMatches: <bdi>{aligned.away}–{aligned.home}</bdi>"
  );
  assert(
    !/<bdi[^>]*>[\s\S]{0,80}aligned\.homeScore[\s\S]{0,40}aligned\.awayScore[\s\S]{0,40}<\/bdi>/.test(src),
    "UpcomingMatches: no legacy home-away"
  );
}

// --- Leaderboard: single-number bdi (no order issue) ---
{
  const src = fs.readFileSync("src/pages/Leaderboard.jsx", "utf8");
  assert(
    !/<span dir="ltr">\{score\./.test(src),
    "Leaderboard: score spans converted to <bdi>"
  );
  assert(
    /<bdi>\{score\.totalPoints\}<\/bdi>/.test(src),
    "Leaderboard: totalPoints uses <bdi>"
  );
  assert(
    /<bdi>\{score\.exactScoreCount\}<\/bdi>/.test(src),
    "Leaderboard: exactScoreCount uses <bdi>"
  );
  // Predicted matchup score line should also be away-before-home
  assert(
    /<bdi>\(\{prediction\.awayScore\}-\{prediction\.homeScore\}\)<\/bdi>/.test(src),
    "Leaderboard predicted matchup: <bdi>({away}-{home})</bdi>"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
