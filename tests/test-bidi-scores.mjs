// Static source audit: verifies match-score rendering uses <bdi> wrappers with
// home-before-away order, not the legacy <span dir="ltr">{away} – {home}</span>
// pattern that relied on browser quirk to flip visually.
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

// --- MatchCard: verify correct source order in bdi wrappers ---
{
  const src = fs.readFileSync("src/components/MatchCard.jsx", "utf8");
  // actualResult: homeScore must come before awayScore in source
  assert(
    /<bdi>\{actualResult\.homeScore\}[–-]\{actualResult\.awayScore\}<\/bdi>/.test(src),
    "MatchCard actualResult: <bdi>{home}–{away}</bdi>"
  );
  // prediction display (non-editable): predHome before predAway
  assert(
    /<bdi>\{predHome\}[–-]\{predAway\}<\/bdi>/.test(src),
    "MatchCard prediction display: <bdi>{predHome}–{predAway}</bdi>"
  );
  // Legacy reversed-order pattern eliminated
  assert(
    !/\{actualResult\.awayScore\}\s*[–-]\s*\{actualResult\.homeScore\}/.test(src),
    "MatchCard: no reversed {away}–{home} for actualResult"
  );
  assert(
    !/\{predAway\}\s*[–-]\s*\{predHome\}/.test(src),
    "MatchCard: no reversed {predAway}–{predHome}"
  );
}

// --- AllForms ---
{
  const src = fs.readFileSync("src/pages/AllForms.jsx", "utf8");
  assert(
    /<bdi>\{prediction\.homeScore\}[–-]\{prediction\.awayScore\}<\/bdi>/.test(src),
    "AllForms: <bdi>{home}–{away}</bdi>"
  );
  assert(
    !/\{prediction\.awayScore\}\s*[–-]\s*\{prediction\.homeScore\}/.test(src),
    "AllForms: no reversed away-home"
  );
}

// --- UpcomingMatches ---
{
  const src = fs.readFileSync("src/components/UpcomingMatches.jsx", "utf8");
  assert(
    /<bdi[^>]*>[\s\S]*?aligned\.homeScore[\s\S]*?aligned\.awayScore[\s\S]*?<\/bdi>/.test(src),
    "UpcomingMatches: <bdi>{aligned.home}–{aligned.away}</bdi>"
  );
  assert(
    !/aligned\.awayScore\s*\}\s*[–-]\s*\{[^}]*aligned\.homeScore/.test(src),
    "UpcomingMatches: no reversed away-home"
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
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
