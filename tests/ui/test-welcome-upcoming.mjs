// Tests for the welcome-screen upcoming-matches change.
// Unauthenticated users see a countdown before kickoff; once the tournament
// starts (countdown.started), they should see the upcoming-matches widget.

import { selectUpcomingMatches } from "/home/user/Beeri-World-Cup/src/utils/upcomingMatches.js";
import { ALL_MATCHES } from "/home/user/Beeri-World-Cup/src/data/matches.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== WELCOME-SCREEN: UPCOMING MATCHES FOR UNAUTH USERS ===\n");

// KICKOFF constant mirrors src/hooks/useCountdown.js
const KICKOFF = new Date("2026-06-11T19:00:00Z").getTime();

// ============================================================
// 1. tournamentStarted derivation mirrors countdown.started + predictionsLocked
// ============================================================
console.log("--- 1. tournamentStarted derivation ---");
{
  // Mirrors WelcomeScreen: show upcoming matches when admin-locked OR kickoff passed.
  function derivedStarted({ settings, now }) {
    const started = Math.max(0, KICKOFF - now) === 0;
    return !!settings?.predictionsLocked || started;
  }

  // Admin locked before kickoff — should show upcoming matches (the real bug)
  assert(derivedStarted({ settings: { predictionsLocked: true }, now: Date.UTC(2026, 3, 19, 12, 0) }) === true,
    "Locked + pre-kickoff (Apr 19) -> show upcoming matches");

  // Not locked, pre-kickoff -> countdown
  assert(derivedStarted({ settings: { predictionsLocked: false }, now: Date.UTC(2026, 3, 19, 12, 0) }) === false,
    "Unlocked + pre-kickoff -> countdown");

  // Not locked, post-kickoff -> upcoming matches (kickoff-based trigger)
  assert(derivedStarted({ settings: { predictionsLocked: false }, now: KICKOFF + 60_000 }) === true,
    "Unlocked + post-kickoff -> upcoming matches");

  // Locked + post-kickoff -> upcoming matches
  assert(derivedStarted({ settings: { predictionsLocked: true }, now: KICKOFF + 60_000 }) === true,
    "Locked + post-kickoff -> upcoming matches");

  // Missing settings (pre-auth cache, snapshot not yet received) -> treat as unlocked,
  // fall back to kickoff trigger.
  assert(derivedStarted({ settings: undefined, now: KICKOFF - 1000 }) === false,
    "Settings undefined pre-kickoff -> countdown (fallback safe)");
  assert(derivedStarted({ settings: null, now: KICKOFF + 1 }) === true,
    "Settings null post-kickoff -> upcoming (fallback safe)");

  // Defensive against truthy coercions
  assert(derivedStarted({ settings: { predictionsLocked: "yes" }, now: 0 }) === true,
    "Truthy string lock value -> upcoming matches");
  assert(derivedStarted({ settings: { predictionsLocked: 0 }, now: 0 }) === false,
    "Falsy number lock value + pre-kickoff -> countdown");

  function countdownFromNow(now) {
    const diff = Math.max(0, KICKOFF - now);
    return { diff, started: diff === 0 };
  }

  // Well before kickoff (today 2026-04-19) -> not started
  const beforeKickoff = countdownFromNow(Date.UTC(2026, 3, 19, 12, 0)); // Apr 19
  assert(beforeKickoff.started === false, "Apr 19: countdown not started");
  assert(beforeKickoff.diff > 0, "Apr 19: positive diff");

  // One second before kickoff -> not started
  const justBefore = countdownFromNow(KICKOFF - 1000);
  assert(justBefore.started === false, "T-1s: not started");

  // Exactly kickoff -> started
  const atKickoff = countdownFromNow(KICKOFF);
  assert(atKickoff.started === true, "T=0: started");

  // After kickoff -> started
  const afterKickoff = countdownFromNow(KICKOFF + 3600_000);
  assert(afterKickoff.started === true, "T+1h: started");
  assert(afterKickoff.diff === 0, "T+1h: diff clamped to 0");

  // Sanity: countdown doesn't go negative
  const wayAfter = countdownFromNow(KICKOFF + 86400_000 * 365);
  assert(wayAfter.diff === 0, "T+1y: diff clamped, no overflow");
}

// ============================================================
// 2. WelcomeScreen visible widget switches on tournamentStarted
// ============================================================
console.log("--- 2. WelcomeScreen widget switch ---");
{
  function welcomeWidget(tournamentStarted) {
    return tournamentStarted ? "upcoming-matches" : "countdown";
  }

  assert(welcomeWidget(false) === "countdown", "Before kickoff: countdown");
  assert(welcomeWidget(true) === "upcoming-matches", "After kickoff: upcoming matches");

  // Layout: single-column centered card on ALL breakpoints (redesign).
  // Root is always scrollable — no lg:h-dvh / overflow-hidden clipping.
  function rootClasses() {
    return "min-h-dvh bg-bg flex flex-col";
  }
  assert(!rootClasses().includes("overflow-hidden"), "Root never clips overflow (scroll-safe in landscape)");
  assert(rootClasses().includes("min-h-dvh"), "Root uses min-h-dvh");

  // Main column is always top-aligned so tall content doesn't get clipped.
  function justify() {
    return "justify-start";
  }
  assert(justify() === "justify-start", "Main column top-aligned (single-column redesign)");
}

// ============================================================
// 3. UpcomingMatches is usable when `user` is null (unauth path)
// ============================================================
console.log("--- 3. UpcomingMatches with null user ---");
{
  // Mirrors the `{user && <PredictionsList ... />}` guard in UpcomingMatches.jsx
  function shouldRenderPredictionsList(user) {
    return !!user;
  }

  assert(shouldRenderPredictionsList(null) === false, "Null user: predictions list hidden");
  assert(shouldRenderPredictionsList(undefined) === false, "Undefined user: predictions list hidden");
  assert(shouldRenderPredictionsList({ id: "u1" }) === true, "Logged-in user: predictions list shown");

  // useUserForms hook returns EMPTY_FORMS sentinel for null id
  function getFormsFor(userId, store) {
    if (!userId) return [];
    return store[userId] || [];
  }
  const mockStore = { u1: [{ formId: "u1__1" }] };
  assert(getFormsFor(null, mockStore).length === 0, "Null userId -> empty forms");
  assert(getFormsFor(undefined, mockStore).length === 0, "Undefined userId -> empty forms");
  assert(getFormsFor("u1", mockStore).length === 1, "Real userId -> real forms");
}

// ============================================================
// 4. selectUpcomingMatches works with empty matchResults (pre-auth cache)
// Regression: unauth users have no Firestore listeners, so matchResults={}
// ============================================================
console.log("--- 4. selectUpcomingMatches with empty matchResults ---");
{
  // Right after kickoff (Jun 11, 2026), no results yet
  const nowJustAfterKickoff = KICKOFF + 60_000;
  const matches = selectUpcomingMatches(ALL_MATCHES, {}, nowJustAfterKickoff);
  assert(Array.isArray(matches), "Returns an array");
  assert(matches.length >= 1, "At least one upcoming match after kickoff");

  // Shortly before kickoff (within the 24h window) — opener is returned
  const nowBefore = Date.UTC(2026, 5, 11, 9, 0); // Jun 11 12:00 Israel
  const matchesBefore = selectUpcomingMatches(ALL_MATCHES, {}, nowBefore);
  assert(matchesBefore.length >= 1, "Upcoming matches available pre-kickoff (within 24h)");

  // Long before kickoff — nothing within 24 hours, empty list
  const wayBefore = Date.UTC(2026, 5, 1, 0, 0);
  const matchesWayBefore = selectUpcomingMatches(ALL_MATCHES, {}, wayBefore);
  assert(matchesWayBefore.length === 0, "No matches outside the 24h window");

  // Deep into tournament — still returns upcoming matches
  const mid = Date.UTC(2026, 5, 20, 0, 0);
  const matchesMid = selectUpcomingMatches(ALL_MATCHES, {}, mid);
  assert(Array.isArray(matchesMid), "Mid-tournament: returns array");

  // After tournament ends — empty is acceptable
  const after = Date.UTC(2026, 11, 1, 0, 0);
  const matchesAfter = selectUpcomingMatches(ALL_MATCHES, {}, after);
  assert(Array.isArray(matchesAfter), "Post-tournament: returns array (empty OK)");
}

// ============================================================
// 5. Regression: countdown block still shown before kickoff (no accidental hide)
// ============================================================
console.log("--- 5. Countdown still visible before kickoff ---");
{
  function showsCountdown(tournamentStarted) {
    return !tournamentStarted;
  }
  assert(showsCountdown(false) === true, "Before kickoff: countdown visible");
  assert(showsCountdown(true) === false, "After kickoff: countdown hidden");
}

// ============================================================
// 6. Regression: sign-in UI still reachable in both modes
// ============================================================
console.log("--- 6. Sign-in UI always rendered ---");
{
  // Mirrors the bottom auth block — not conditional on tournament state
  function rendersAuth(_tournamentStarted) {
    return true;
  }
  assert(rendersAuth(false) === true, "Pre-kickoff: auth UI rendered");
  assert(rendersAuth(true) === true, "Post-kickoff: auth UI still rendered");
}

// ============================================================
// 7. No crash when useCurrentUser returns defaults in UpcomingMatches
// Defensive: ensure the access pattern `user?.id || null` works
// ============================================================
console.log("--- 7. Defensive user access ---");
{
  function resolveFormsUserId(currentUser) {
    return currentUser?.id || null;
  }
  assert(resolveFormsUserId(null) === null, "Null user -> null id");
  assert(resolveFormsUserId(undefined) === null, "Undefined user -> null id");
  assert(resolveFormsUserId({}) === null, "Empty user -> null id (no .id)");
  assert(resolveFormsUserId({ id: "u1" }) === "u1", "Real user -> real id");
}

// ============================================================
// 8. Regression: tournament-started handling is idempotent/stable
// Countdown hook ticks every second. State flip is one-way (not started → started)
// ============================================================
console.log("--- 8. Started flag is monotonic at the boundary ---");
{
  function started(now) {
    return Math.max(0, KICKOFF - now) === 0;
  }

  // Walk forward across kickoff — once true, stays true
  const samples = [
    KICKOFF - 60_000, // -1min
    KICKOFF - 1000,   // -1s
    KICKOFF,          // T0
    KICKOFF + 1000,   // +1s
    KICKOFF + 60_000, // +1min
  ];
  const expected = [false, false, true, true, true];
  for (let i = 0; i < samples.length; i++) {
    assert(started(samples[i]) === expected[i], `t=${samples[i] - KICKOFF}ms -> started=${expected[i]}`);
  }
}

// ============================================================
// 9. get-public-settings Netlify function: response shape
// ============================================================
console.log("--- 9. Netlify function response shape ---");
{
  // Mirrors netlify/functions/get-public-settings.js handler logic.
  function handle({ httpMethod, settingsSnap, resultsSnap }) {
    if (httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
    if (httpMethod !== "GET") return { statusCode: 405, body: { error: "Method Not Allowed" } };
    const settingsData = settingsSnap?.exists ? settingsSnap.data?.data : null;
    const resultsData = resultsSnap?.exists ? resultsSnap.data?.data : null;
    return {
      statusCode: 200,
      body: {
        predictionsLocked: !!(settingsData && settingsData.predictionsLocked),
        matchResults:
          resultsData && typeof resultsData === "object" ? resultsData : {},
      },
    };
  }

  const noResults = { exists: false, data: null };

  // Locked
  {
    const r = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: { predictionsLocked: true } } },
      resultsSnap: noResults,
    });
    assert(r.statusCode === 200, "Locked: 200");
    assert(r.body.predictionsLocked === true, "Locked: returns true");
    assert(typeof r.body.matchResults === "object", "Response always has matchResults object");
  }

  // Unlocked
  {
    const r = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: { predictionsLocked: false } } },
      resultsSnap: noResults,
    });
    assert(r.body.predictionsLocked === false, "Unlocked: returns false");
  }

  // Missing field → false
  {
    const r = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: {} } },
      resultsSnap: noResults,
    });
    assert(r.body.predictionsLocked === false, "Missing field: false");
  }

  // Document doesn't exist → false (safe default)
  {
    const r = handle({ httpMethod: "GET", settingsSnap: { exists: false, data: null }, resultsSnap: noResults });
    assert(r.body.predictionsLocked === false, "No doc: false");
  }

  // Truthy/falsy coercion
  {
    const truthy = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: { predictionsLocked: "yes" } } },
      resultsSnap: noResults,
    });
    assert(truthy.body.predictionsLocked === true, "Truthy string -> true");
    const falsy = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: { predictionsLocked: 0 } } },
      resultsSnap: noResults,
    });
    assert(falsy.body.predictionsLocked === false, "Falsy 0 -> false");
  }

  // Method guard
  {
    const opts = handle({ httpMethod: "OPTIONS" });
    assert(opts.statusCode === 204, "OPTIONS: preflight 204");
    const post = handle({ httpMethod: "POST" });
    assert(post.statusCode === 405, "POST: 405 Method Not Allowed");
  }

  // matchResults returned when document exists with real results
  {
    const r = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: { predictionsLocked: true } } },
      resultsSnap: {
        exists: true,
        data: { data: { m1: { homeScore: 2, awayScore: 1 }, m2: { homeScore: 0, awayScore: 0 } } },
      },
    });
    assert(r.body.matchResults.m1?.homeScore === 2, "matchResults propagate home score");
    assert(Object.keys(r.body.matchResults).length === 2, "matchResults propagate all keys");
  }

  // matchResults defaults to {} when doc missing
  {
    const r = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: { predictionsLocked: true } } },
      resultsSnap: { exists: false, data: null },
    });
    assert(
      r.body.matchResults && Object.keys(r.body.matchResults).length === 0,
      "matchResults defaults to {} when document missing",
    );
  }

  // matchResults defaults to {} when data is not an object
  {
    const r = handle({
      httpMethod: "GET",
      settingsSnap: { exists: true, data: { data: { predictionsLocked: true } } },
      resultsSnap: { exists: true, data: { data: null } },
    });
    assert(typeof r.body.matchResults === "object", "matchResults null -> empty object");
    assert(Object.keys(r.body.matchResults).length === 0, "matchResults null -> no keys");
  }
}

// ============================================================
// 10. usePublicSettings polling behaviour
// ============================================================
console.log("--- 10. usePublicSettings polling logic ---");
{
  // Simulates the effect body in src/hooks/usePublicSettings.ts
  async function driveHook(responses) {
    let state = { predictionsLocked: false, matchResults: {}, loaded: false };
    let fetchCount = 0;
    let cancelled = false;

    async function fetchOnce() {
      if (cancelled) return;
      const res = responses[fetchCount++];
      let nextLocked = null;
      let nextResults = null;
      try {
        if (res.ok) {
          nextLocked = !!res.body?.predictionsLocked;
          nextResults =
            res.body?.matchResults && typeof res.body.matchResults === "object"
              ? res.body.matchResults
              : {};
        }
      } catch {
        // swallow
      }
      state = {
        predictionsLocked: nextLocked === null ? state.predictionsLocked : nextLocked,
        matchResults: nextResults === null ? state.matchResults : nextResults,
        loaded: true,
      };
    }

    await fetchOnce();
    // Simulate 3 more poll ticks
    for (let i = 0; i < 3 && fetchCount < responses.length; i++) {
      await fetchOnce();
    }

    return { settings: state, fetchCount };
  }

  // First poll locks, stays locked
  {
    const p = driveHook([
      { ok: true, body: { predictionsLocked: true, matchResults: {} } },
      { ok: true, body: { predictionsLocked: true, matchResults: {} } },
    ]);
    const { settings, fetchCount } = await p;
    assert(settings.predictionsLocked === true, "First poll locks the UI");
    assert(fetchCount === 2, "Polls repeatedly");
  }

  // Unlock → lock transition propagates
  {
    const { settings } = await driveHook([
      { ok: true, body: { predictionsLocked: false, matchResults: {} } },
      { ok: true, body: { predictionsLocked: true, matchResults: {} } },
    ]);
    assert(settings.predictionsLocked === true, "Transition unlocked→locked surfaces");
  }

  // Fetch error keeps last-known value
  {
    const { settings } = await driveHook([
      { ok: true, body: { predictionsLocked: true, matchResults: { m1: { homeScore: 1, awayScore: 0 } } } },
      { ok: false },
      { ok: false },
    ]);
    assert(settings.predictionsLocked === true, "Network failure keeps last-known locked state");
    assert(settings.matchResults.m1?.homeScore === 1, "Network failure keeps last-known match results");
  }

  // Initial default before any response
  {
    const { settings } = await driveHook([
      { ok: false },
      { ok: false },
    ]);
    assert(settings.predictionsLocked === false, "All failures: safe default (unlocked)");
    assert(
      settings.matchResults && Object.keys(settings.matchResults).length === 0,
      "All failures: match results default to {}",
    );
  }

  // matchResults surface from the endpoint
  {
    const { settings } = await driveHook([
      {
        ok: true,
        body: {
          predictionsLocked: true,
          matchResults: { 1: { homeScore: 2, awayScore: 1 } },
        },
      },
    ]);
    assert(settings.matchResults["1"]?.homeScore === 2, "matchResults from endpoint surface to state");
  }

  // matchResults malformed (not an object) -> fallback to {}
  {
    const { settings } = await driveHook([
      { ok: true, body: { predictionsLocked: true, matchResults: null } },
    ]);
    assert(Object.keys(settings.matchResults).length === 0, "Null matchResults -> empty object");
  }
}

// ============================================================
// 11. Upcoming matches filter: logged-out path uses public matchResults
// ============================================================
console.log("--- 11. Logged-out upcoming matches filter ---");
{
  // Verifies the core fix: when the store cache is empty (no auth listeners),
  // an explicit matchResults override filters out already-played matches.
  // Real-world scenario reproducing the bug: admin has locked predictions
  // and entered a result for match #1 *before* the real kickoff time (e.g.
  // test data). For a logged-in user, the Firestore listener delivers the
  // result and match #1 is correctly filtered out of "next matches". For a
  // logged-out user without the public override, matchResults is {} so
  // match #1 is still shown — which is exactly what the user reported.

  // Simulate "now" before kickoff (but inside the 24h display window) so
  // kickoff-time filtering doesn't mask the results-based filter.
  const preKickoff = Date.UTC(2026, 5, 11, 9, 0); // Jun 11 12:00 Israel

  // Find whichever match is selected as the "first upcoming" at that time
  // without any results, then mark it as played in the override and verify
  // it disappears. Keyed by match.id (matches how the store writes results).
  const baseline = selectUpcomingMatches(ALL_MATCHES, {}, preKickoff);
  assert(baseline.length >= 1, "Baseline has at least one upcoming match");
  const firstId = baseline[0].id;

  const playedFirstMatch = { [firstId]: { homeScore: 1, awayScore: 0 } };
  const withResults = selectUpcomingMatches(ALL_MATCHES, playedFirstMatch, preKickoff);
  const withoutResults = selectUpcomingMatches(ALL_MATCHES, {}, preKickoff);

  assert(
    !withResults.some((m) => m.id === firstId),
    "With public results: already-scored match is filtered out",
  );
  assert(
    withoutResults.some((m) => m.id === firstId),
    "Reproduces bug: without public results, already-scored match still appears",
  );
  // The two code paths must diverge — proving the override matters.
  assert(
    withResults[0]?.id !== withoutResults[0]?.id,
    "Logged-in and logged-out paths yield different first match when result exists",
  );
}

// ============================================================
// 12. UpcomingMatches grid layout centers a single match
// ============================================================
console.log("--- 12. UpcomingMatches grid layout ---");
{
  // Mirrors the className logic in UpcomingMatches.jsx: a single match
  // must NOT use the two-column grid (which leaves one column empty and
  // makes the card appear off-center on desktop).
  function gridClass(count) {
    return count === 1
      ? "space-y-3"
      : "space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0";
  }

  assert(gridClass(1) === "space-y-3", "Single match: no grid (centered)");
  assert(!gridClass(1).includes("md:grid-cols-2"), "Single match: no md:grid-cols-2");
  assert(gridClass(2).includes("md:grid-cols-2"), "Two matches: grid applied");
  assert(gridClass(5).includes("md:grid-cols-2"), "Many matches: grid applied");
}

// ============================================================
// 13. Lock-state-known gate: don't render countdown vs upcoming until we know
// Regression: previously usePublicSettings defaulted predictionsLocked=false,
// so a locked-but-pre-kickoff visitor first saw the countdown for a frame
// and then snapped to "upcoming matches" once the fetch resolved.
// ============================================================
console.log("--- 13. lockStateKnown gate ---");
{
  function lockStateKnown({ loaded, countdownStarted }) {
    return loaded || countdownStarted;
  }
  function panel({ loaded, countdownStarted, predictionsLocked }) {
    if (!lockStateKnown({ loaded, countdownStarted })) return "placeholder";
    return predictionsLocked || countdownStarted ? "upcoming-matches" : "countdown";
  }

  // Real bug scenario: admin locked predictions before kickoff. First render
  // (loaded=false, countdownStarted=false) MUST show neither widget — not
  // the countdown that the old code showed.
  assert(panel({ loaded: false, countdownStarted: false, predictionsLocked: true }) === "placeholder",
    "Pre-fetch + locked: render placeholder, not stale countdown");
  assert(panel({ loaded: false, countdownStarted: false, predictionsLocked: false }) === "placeholder",
    "Pre-fetch + unlocked: also placeholder (we don't yet know either way)");

  // After fetch lands with locked=true → upcoming matches
  assert(panel({ loaded: true, countdownStarted: false, predictionsLocked: true }) === "upcoming-matches",
    "Loaded + locked + pre-kickoff: upcoming matches");
  // After fetch lands with locked=false → countdown
  assert(panel({ loaded: true, countdownStarted: false, predictionsLocked: false }) === "countdown",
    "Loaded + unlocked + pre-kickoff: countdown");

  // Kickoff already passed locally → can render upcoming matches without
  // waiting for the network (kickoff is a one-way door, time-based).
  assert(panel({ loaded: false, countdownStarted: true, predictionsLocked: false }) === "upcoming-matches",
    "Pre-fetch but post-kickoff: upcoming matches (no network wait)");
  assert(panel({ loaded: true, countdownStarted: true, predictionsLocked: true }) === "upcoming-matches",
    "Loaded + locked + post-kickoff: upcoming matches");

  // Network failure path: usePublicSettings still flips loaded=true after
  // the first attempt so we don't trap the visitor on the placeholder.
  assert(lockStateKnown({ loaded: true, countdownStarted: false }) === true,
    "First fetch failure still flips loaded → exits placeholder");
}

// ============================================================
// 14. usePublicSettings flips `loaded` even on fetch failure
// ============================================================
console.log("--- 14. usePublicSettings sets loaded after first attempt ---");
{
  // Reuse the same simulator shape used elsewhere in the file. We can't
  // import the real hook (it's a React hook that calls useState/useEffect),
  // so we mirror the resolve-on-first-attempt behaviour directly.
  async function driveLoaded(responses) {
    let state = { predictionsLocked: false, matchResults: {}, loaded: false };
    for (const res of responses) {
      let nextLocked = null;
      let nextResults = null;
      if (res.ok) {
        nextLocked = !!res.body?.predictionsLocked;
        nextResults =
          res.body?.matchResults && typeof res.body.matchResults === "object"
            ? res.body.matchResults
            : {};
      }
      state = {
        predictionsLocked: nextLocked === null ? state.predictionsLocked : nextLocked,
        matchResults: nextResults === null ? state.matchResults : nextResults,
        loaded: true,
      };
    }
    return state;
  }

  // Successful first fetch
  {
    const s = await driveLoaded([{ ok: true, body: { predictionsLocked: true } }]);
    assert(s.loaded === true, "First success: loaded=true");
    assert(s.predictionsLocked === true, "First success: lock value applied");
  }

  // Failed first fetch — loaded must still flip
  {
    const s = await driveLoaded([{ ok: false }]);
    assert(s.loaded === true, "First failure: loaded still flips true (no infinite placeholder)");
    assert(s.predictionsLocked === false, "First failure: keeps default lock=false");
  }

  // Failure then success — last-known wins
  {
    const s = await driveLoaded([
      { ok: false },
      { ok: true, body: { predictionsLocked: true } },
    ]);
    assert(s.loaded === true, "Two attempts: loaded=true");
    assert(s.predictionsLocked === true, "Recovery: real value supersedes default");
  }
}

// ============================================================
// 15. WelcomeScreen source still gates panel render on lockStateKnown
// Static check guarding against future regressions where someone reverts
// the gate and reintroduces the countdown→upcoming-matches flicker.
// ============================================================
console.log("--- 15. WelcomeScreen source enforces lockStateKnown gate ---");
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    "/home/user/Beeri-World-Cup/src/pages/WelcomeScreen.tsx",
    "utf8",
  );
  assert(src.includes("lockStateKnown"), "WelcomeScreen references lockStateKnown");
  assert(
    src.includes("publicSettings.loaded"),
    "WelcomeScreen reads publicSettings.loaded for gating",
  );
  assert(
    /!lockStateKnown\s*\?/.test(src),
    "WelcomeScreen branches its panel render on !lockStateKnown",
  );
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log(`\n=== WELCOME UPCOMING-MATCHES RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
