// Static contract audit — RecentlyFinishedMatches section + home/welcome
// wiring. Locks down the same truth rules the LiveNow hero follows so a
// future refactor can't silently regress them:
//   1. verdict points computed by the scoring engine, never hardcoded copy;
//   2. every score renders through <Score>/<bdi> (RTL reversal guard);
//   3. multi-form attribution (named rows); only submitted/approved score;
//   4. official result fed as a FINISHED snapshot (no ET suppression);
//   5. centralised copy (FINISHED.* in messages), quiet (muted) visual band;
//   6. page wiring: present on Home and WelcomeScreen, above UpcomingMatches.

import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== RECENTLY FINISHED MATCHES AUDIT ===\n");

const comp = readMigratedSrc("src/components/RecentlyFinishedMatches.jsx");
const home = readMigratedSrc("src/pages/Home.jsx");
const welcome = readMigratedSrc("src/pages/WelcomeScreen.jsx");
const messages = readMigratedSrc("src/constants/messages.js");
const hook = readMigratedSrc("src/hooks/useUpcomingMatches.js");
const selector = readMigratedSrc("src/utils/upcomingMatches.js");

// ---- 0. Files exist ----
console.log("--- 0. Files present ---");
assert(existsMigratedSrc("src/components/RecentlyFinishedMatches.jsx"),
  "RecentlyFinishedMatches component exists");

// ---- 1. Points from the engine, not from copy ----
console.log("--- 1. No hardcoded verdict points ---");
assert(/computeLiveVerdict/.test(comp), "delegates verdicts to computeLiveVerdict");
assert(!/\+\s*\d+\s*נק/.test(comp), "embeds no literal '+N נק' strings");
assert(/finishedExact\(verdict\.points\)/.test(comp), "exact verdict injects engine points");
assert(/finishedOutcome\(verdict\.points\)/.test(comp), "outcome verdict injects engine points");

// ---- 2. RTL score safety ----
console.log("--- 2. RTL/BiDi score rendering ---");
assert(/import Score from "\.\/Score"/.test(comp), "imports the Score component");
assert(/home=\{result\.homeScore\}/.test(comp) && /away=\{result\.awayScore\}/.test(comp),
  "final score rendered via <Score home/away>");
assert(/home=\{predDisplay\.homeScore\}/.test(comp),
  "predicted score rendered via <Score> too");
assert(!/\{result\.homeScore\}\s*[–-]\s*\{result\.awayScore\}/.test(comp),
  "no raw '{home}-{away}' concatenation");
assert(/<bdi>/.test(comp), "team names isolated in <bdi>");
// A real score must never render under unresolved ("טרם נקבע") teams: the
// component drops knockout fixtures whose bracket slot can't be seated yet.
assert(/actualTeams\.home\s*&&\s*actualTeams\.away/.test(comp),
  "filters out matches whose teams can't be resolved (no score under placeholders)");

// ---- 3. Form attribution + eligibility ----
console.log("--- 3. Multi-form rules ---");
assert(/form\.formName/.test(comp), "per-form rows show the form's name");
assert(/status === "submitted"/.test(comp) && /status === "approved"/.test(comp),
  "only submitted/approved forms score");

// ---- 4. Official result fed as a FINISHED snapshot (no ET suppression) ----
console.log("--- 4. Finished snapshot for verdict ---");
assert(/FD_FINISHED_STATUS/.test(comp), "uses FD_FINISHED_STATUS for the snapshot status");
assert(/duration:\s*"REGULAR"/.test(comp),
  "snapshot marks REGULAR duration so knockout ET suppression never fires");

// ---- 5. Centralised copy + quiet visual band ----
console.log("--- 5. Copy + visual register ---");
assert(/FINISHED\./.test(comp), "uses centralised FINISHED.* copy");
assert(/header:\s*"תוצאות אחרונות"/.test(messages),
  "FINISHED.header is results-framed (works for overnight catch-up)");
assert(/badge:\s*"הסתיים"/.test(messages), "FINISHED.badge present in messages");
assert(/badge-duo-muted/.test(comp), "finished badge uses the muted (not live-red) chip");
assert(!/animate-pulse/.test(comp), "no live pulse — finished band is calm");
assert(/bg-bg-soft/.test(comp), "uses the soft surface to read as 'settled'");

// ---- 6. Hook + selector wiring ----
console.log("--- 6. Hook + selector ---");
assert(/useRecentlyFinishedMatches/.test(comp), "consumes the recently-finished hook");
assert(/useRecentlyFinishedMatches/.test(hook), "hook is exported from useUpcomingMatches");
assert(/selectRecentlyFinishedMatches/.test(selector), "pure selector exported");
assert(/FINISHED_WINDOW_MS\s*=\s*4 \* 3600000/.test(selector), "finished window is 4 hours");
// Morning catch-up: overnight results must survive until late morning.
assert(/MORNING_CUTOFF_HOUR\s*=\s*12/.test(selector), "morning cutoff is noon Israel");
assert(/finishedExpiryUTC/.test(selector), "expiry helper applies the morning override");
assert(/israelHour\(base\)\s*<\s*MORNING_CUTOFF_HOUR/.test(selector),
  "expiry pushes pre-noon windows to the morning cutoff");

// ---- 7. Page wiring: above UpcomingMatches on both surfaces ----
console.log("--- 7. Page wiring ---");
assert(/RecentlyFinishedMatches/.test(home), "Home renders RecentlyFinishedMatches");
{
  const liveIdx = home.indexOf("<LiveNowCard");
  const finIdx = home.indexOf("<RecentlyFinishedMatches");
  const upIdx = home.indexOf("<UpcomingMatches");
  assert(liveIdx >= 0 && finIdx > liveIdx, "Home: finished section is below the live hero");
  assert(upIdx > finIdx, "Home: finished section is ABOVE the upcoming matches");
}
assert(/RecentlyFinishedMatches/.test(welcome), "WelcomeScreen renders RecentlyFinishedMatches");
assert(/RecentlyFinishedMatches matchResultsOverride=\{results\}/.test(welcome),
  "WelcomeScreen passes public results override (guest parity)");
{
  const finIdx = welcome.indexOf("<RecentlyFinishedMatches");
  const upIdx = welcome.indexOf("<UpcomingMatches");
  assert(finIdx >= 0 && upIdx > finIdx, "WelcomeScreen: finished section above upcoming");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  - " + f));
  process.exit(1);
}
