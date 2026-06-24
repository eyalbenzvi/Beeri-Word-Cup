// Static contract audit — LiveNow hero + home redesign wiring.
//
// Locks down the review's must-fix items so a refactor can't silently
// regress them:
//   1. verdict points computed by the scoring engine, never hardcoded copy;
//   2. every score renders through <Score>/<bdi> (RTL reversal guard);
//   3. multi-form attribution (named rows / count chips, exhaustive rollup);
//   4. live-vs-official vocabulary seam ("כרגע" / "לפי משחקים שנגמרו");
//   5. polling lifecycle (live-window gate, visibility pause, backoff,
//      decrease debounce) and the no-spinner degradation stance;
//   6. page wiring: hero replaces MatchdayHero everywhere, live matches
//      excluded from UpcomingMatches but never lost.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LIVE NOW HERO + HOME REDESIGN AUDIT ===\n");

const hero = readMigratedSrc("src/components/LiveNowCard.jsx");
const hook = readMigratedSrc("src/hooks/useLiveScores.js");
const util = readMigratedSrc("src/utils/liveScores.js");
const strip = readMigratedSrc("src/components/ScoreStrip.jsx");
const teaser = readMigratedSrc("src/components/SummaryTeaser.jsx");
const home = readMigratedSrc("src/pages/Home.jsx");
const welcome = readMigratedSrc("src/pages/WelcomeScreen.jsx");
const upcoming = readMigratedSrc("src/components/UpcomingMatches.jsx");
const messages = readMigratedSrc("src/constants/messages.js");

// ---- 1. Points from the engine, not from copy ----
console.log("--- 1. No hardcoded verdict points ---");
assert(/calculateMatchPoints/.test(util), "verdict util delegates to calculateMatchPoints");
assert(!/\+\s*\d+\s*נק/.test(hero), "LiveNowCard embeds no literal '+N נק' strings");
assert(/exactWorth\(verdict\.points\)/.test(hero), "exact verdict injects engine points");
assert(/outcomeNow\(verdict\.points\)/.test(hero), "outcome verdict injects engine points");
assert(/\(pts\)\s*=>/.test(messages), "LIVE copy takes points as a parameter");

// ---- 2. RTL score safety ----
console.log("--- 2. RTL/BiDi score rendering ---");
assert(/import Score from "\.\/Score"/.test(hero), "hero imports the Score component");
assert(/home=\{live\.homeScore\}/.test(hero) && /away=\{live\.awayScore\}/.test(hero),
  "live score rendered via <Score home/away>");
assert(/home=\{predDisplay\.homeScore\}/.test(hero),
  "predicted score rendered via <Score> too");
assert(!/\{live\.homeScore\}\s*[–-]\s*\{live\.awayScore\}/.test(hero),
  "no raw '{home}-{away}' concatenation in hero");
assert(/<bdi>\{LIVE\.minuteMark/.test(hero), "minute mark isolated in <bdi>");
// Orientation swap happens once, in the mapper — before any rendering.
assert(/flipped/.test(util) && /entry\.homeCode === teams\.away/.test(util),
  "mapper swaps flipped fixtures to OUR home/away");
// +N inside Hebrew copy carries an LRM so the plus stays left of digits.
assert(/‎\+\$\{pts\}/.test(messages), "copy embeds LRM before +N points");

// ---- 3. Multi-form attribution ----
console.log("--- 3. Multi-form rules ---");
assert(/form\.formName/.test(hero), "per-form rows show the form's name");
assert(/formsScoringNow\(scoring, total\)/.test(hero),
  "5+ forms use the exhaustive 'X מתוך Y' rollup");
assert(/forms\.length === 1 && verdicts\[0\]/.test(hero),
  "compact row shows a verdict word ONLY for single-form users");
assert(/forms\.length > 1 && total > 0/.test(hero),
  "compact row multi-form shows count chip, never unattributed verdict");
assert(/status === "submitted" \|\| f\.status === "approved"/.test(hero),
  "only submitted/approved forms get points-bearing verdicts");
// Exhaustive rollup proven in the unit suite; here just lock the import.
assert(/summarizeVerdicts/.test(hero), "hero uses summarizeVerdicts for counts");

// ---- 4. Live vs official seam ----
console.log("--- 4. Vocabulary seam ---");
assert(/כרגע/.test(messages), "live verdicts carry 'כרגע'");
assert(/לפי משחקים שנגמרו/.test(messages), "official strip labelled 'לפי משחקים שנגמרו'");
assert(/officialOnly/.test(strip), "ScoreStrip renders the official-only label");
assert(/useLeaderboardComputed/.test(strip),
  "ScoreStrip ranks via the same pipeline as Leaderboard (no drift)");
assert(!/localStorage\.setItem/.test(strip) && !/localStorage\.setItem/.test(hero),
  "home components never write localStorage (prevRanks stays Leaderboard-owned)");
assert(!/localStorage\.getItem\(["']beeri:prevRanks/.test(strip) &&
  !/TrendingUp|TrendingDown|ArrowUp|ArrowDown/.test(strip),
  "no rank-delta in v1 (snapshot semantics unfit)");

// ---- 5. Polling lifecycle + degradation ----
console.log("--- 5. Polling discipline ---");
assert(/liveMatches\.length > 0/.test(hook), "polls only while a live-window match exists");
assert(/visibilitychange/.test(hook), "pauses/resumes on tab visibility");
assert(/visibilityState === "hidden"/.test(hook), "hidden tab stops the timer");
assert(/POLL_MS = 20 \* 1000/.test(hook), "~20s cadence (CDN-collapsed, free vs upstream budget)");
assert(/Math\.random\(\) \* JITTER_MS/.test(hook), "jitter de-synchronizes clients");
assert(/SLOW_POLL_MS/.test(hook) && /FAILURES_BEFORE_SLOWDOWN/.test(hook),
  "backs off after consecutive failures");
assert(/liveScoresEnabled !== false/.test(hook), "settings kill switch gates the client");
assert(/stabilizeScores/.test(hook), "decrease debounce applied to mapped scores");
assert(/clearTimeout/.test(hook) && /removeEventListener/.test(hook),
  "effect cleans up timer + listener");
// Review fixes (expert findings 1-3) — lock them in:
assert(/if \(inFlight\) return;/.test(hook),
  "tick re-entry guard (visibility flip during in-flight fetch can't fork a second poll chain)");
assert(/const schedule = \(failures\) => \{\s*\n\s*if \(timer\) clearTimeout\(timer\);/.test(hook),
  "schedule() is self-cleaning (always cancels the previously armed timeout)");
assert(/failuresRef\.current \+= 1/.test(hook) && !/nextFailures/.test(hook),
  "failure count lives in a ref, never smuggled out of a setState updater");
assert(/lastEntriesRef\.current !== state\.entries/.test(hook),
  "decrease debounce advances once per POLL, not per render (60s clock tick can't confirm a VAR hold)");
// Degradation: no spinner, schedule fallback, quiet stale/down notes.
assert(!/Spinner/.test(hero), "hero never renders a spinner");
assert(/playingNow/.test(hero), "schedule fallback ('משוחק עכשיו') when no live data");
// Review fix (expert finding 6): during a feed outage the live match is
// gone from the UpcomingMatches list, so the single-form branch must still
// show the prediction itself — only the verdict claim is omitted.
assert(/verdict\.kind !== "no-data" && \(/.test(hero),
  "single-form no-data: prediction stays visible, only the verdict line is omitted");
// Review fix (expert finding 4): ET suppression keys on FD's score.duration
// (authoritative) with minute>90 as fallback — minute alone is plan-dependent.
assert(/duration && live\.duration !== "REGULAR"/.test(util),
  "verdict suppression uses score.duration as the primary ET/pens signal");
assert(/getMatchKickoffUTC/.test(util),
  "duplicate team-pair entries disambiguated by kickoff proximity (rematch guard)");
assert(/apiDownNote/.test(hero) && /staleNote/.test(hero) && /refreshNote/.test(hero),
  "freshness footer: refresh / stale / down states");
assert(/failures >= 2/.test(hero), "quiet down-note after 2 consecutive failures");

// ---- 6. Accessibility + motion ----
console.log("--- 6. A11y ---");
assert(/aria-live="polite"/.test(hero), "live region is polite");
assert(/aria-atomic="true"/.test(hero), "goal announces as one sentence (atomic)");
assert(/aria-expanded=\{expanded\}/.test(hero), "compact rows expose expanded state");
assert(/aria-hidden="true"/.test(hero), "decorative pulse dot hidden from SR");
assert(!/<button[^>]*>[\s\S]*?<details/.test(hero.split("function CompactRow")[1]?.split("function MatchLiveBlock")[0] || ""),
  "no <details> nested inside the compact-row <button>");

// ---- 7. Page wiring ----
console.log("--- 7. Wiring ---");
assert(!existsMigratedSrc("src/components/MatchdayHero.jsx"), "MatchdayHero deleted");
assert(!/MatchdayHero/.test(home) && !/from\s+["'].*MatchdayHero/.test(welcome),
  "no page imports MatchdayHero");
assert(/import LiveNowCard/.test(home), "Home imports LiveNowCard");
assert(/<LiveNowCard \/>/.test(home), "Home renders LiveNowCard in locked mode");
assert(/<ScoreStrip \/>/.test(home), "Home renders ScoreStrip");
assert(/<SummaryTeaser \/>/.test(home), "Home renders SummaryTeaser");
assert(/<UpcomingMatches excludeLive \/>/.test(home),
  "Home excludes live matches from the upcoming list (de-dup)");
assert(/<LiveNowCard matchResultsOverride=\{results\} \/>/.test(welcome),
  "WelcomeScreen renders LiveNowCard with public-endpoint results");
assert(/<UpcomingMatches matchResultsOverride=\{results\} excludeLive \/>/.test(welcome),
  "WelcomeScreen also de-dups the list");
// The never-lose-a-match invariant: exclusion only removes isLive matches,
// and the hero renders EVERY isLive match (fallback when unmapped).
assert(/excludeLive \? allUpcoming\.filter\(\(m\) => !m\.isLive\)/.test(upcoming),
  "UpcomingMatches exclusion removes exactly the isLive set");
assert(/liveMatches\.map\(\(match\)/.test(hero),
  "hero renders every live-window match (mapped or fallback)");
assert(/excludeLive && allUpcoming\.length > 0/.test(upcoming),
  "empty-after-exclusion renders nothing (no contradictory empty-state)");

// ---- 8. ScoreStrip + teaser specifics ----
console.log("--- 8. Strip + teaser ---");
assert(/myForms\.length === 0\) return null/.test(strip), "strip hidden for guests/no-forms");
assert(/last24hPoints/.test(strip), "strip shows the rolling last-24h haul");
assert(/computeWindowFormPoints/.test(strip), "rolling-window points via the parity-tested util");
assert(/now - DAY_MS/.test(strip), "window is anchored at now-24h (rolling, not calendar-day)");
assert(/status !== "published"/.test(teaser) || /status === "published"/.test(teaser),
  "teaser filters published summaries only");
assert(/navigate\("blog", \{ n: latest\.number \}\)/.test(teaser),
  "teaser deep-links to the latest summary");
assert(/!ready \|\| !latest\) return null/.test(teaser),
  "teaser renders nothing while loading (no flash)");

// ---- 9. Simultaneous next-match set (matchday-3 parallel pairs) ----
console.log("--- 9. Parallel next-match handling ---");
const liveNow = readMigratedSrc("src/utils/liveNow.js");
// findNextMatch returns the whole shared-kickoff SET, never a single match.
assert(/return \{ matches, kickoff/.test(liveNow),
  "findNextMatch returns a matches[] set (all games at the earliest kickoff)");
assert(/getMatchKickoffUTC\(match\) === bestKickoff/.test(liveNow),
  "findNextMatch collects every match at exactly the earliest kickoff");
assert(!/\{ match: best, kickoff/.test(liveNow),
  "findNextMatch no longer returns a lone {match} (the parallel twin was being dropped)");
// NextMatchStrip renders the set and labels simultaneity honestly.
assert(/const \{ matches, kickoff \} = next/.test(hero),
  "NextMatchStrip consumes the matches[] set");
assert(/matches\.map\(\(match\)/.test(hero),
  "NextMatchStrip renders one row per simultaneous match");
assert(/nextMatchesLabel/.test(hero) && /nextMatchesLabel:/.test(messages),
  "plural label used for a multi-match set");
assert(/inParallel/.test(hero) && /inParallel:/.test(messages),
  "'במקביל' tag marks the shared-kickoff time line");
// The 'more later today' counter excludes the whole set, not just one match —
// otherwise the parallel twin is double-counted as 'one more later today'.
assert(/const selectedIds = new Set\(matches\.map/.test(hero),
  "the shown set's ids are collected for exclusion");
assert(/countLaterTodayMatches\(results, now, todayKey, tz, selectedIds\)/.test(hero),
  "remainingToday delegates to the pure helper, passing the whole set to exclude");
assert(/!excludeIds\.has\(m\.id\)/.test(liveNow),
  "countLaterTodayMatches excludes the shown set (twin not double-counted)");

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
