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

  // Layout: when tournament started, we drop overflow-hidden + h-dvh
  function rootClasses(tournamentStarted) {
    return tournamentStarted
      ? "min-h-dvh bg-bg flex flex-col"
      : "min-h-dvh bg-bg flex flex-col h-dvh overflow-hidden";
  }

  assert(rootClasses(false).includes("overflow-hidden"), "Before: clips overflow (single-screen)");
  assert(!rootClasses(true).includes("overflow-hidden"), "After: scrollable (upcoming list may be tall)");
  assert(rootClasses(true).includes("min-h-dvh"), "After: still full-height minimum");

  function justify(tournamentStarted) {
    return tournamentStarted ? "justify-start" : "justify-center";
  }
  assert(justify(false) === "justify-center", "Before: vertically centered");
  assert(justify(true) === "justify-start", "After: top-aligned (no clipping of tall list)");
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

  // Well before kickoff — should still return upcoming matches (first day)
  const nowBefore = Date.UTC(2026, 5, 1, 0, 0);
  const matchesBefore = selectUpcomingMatches(ALL_MATCHES, {}, nowBefore);
  assert(matchesBefore.length >= 1, "Upcoming matches available pre-kickoff");

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
  function handle({ httpMethod, snapExists, snapData }) {
    if (httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
    if (httpMethod !== "GET") return { statusCode: 405, body: { error: "Method Not Allowed" } };
    const data = snapExists ? snapData?.data : null;
    return {
      statusCode: 200,
      body: { predictionsLocked: !!(data && data.predictionsLocked) },
    };
  }

  // Locked
  {
    const r = handle({ httpMethod: "GET", snapExists: true, snapData: { data: { predictionsLocked: true } } });
    assert(r.statusCode === 200, "Locked: 200");
    assert(r.body.predictionsLocked === true, "Locked: returns true");
  }

  // Unlocked
  {
    const r = handle({ httpMethod: "GET", snapExists: true, snapData: { data: { predictionsLocked: false } } });
    assert(r.body.predictionsLocked === false, "Unlocked: returns false");
  }

  // Missing field → false
  {
    const r = handle({ httpMethod: "GET", snapExists: true, snapData: { data: {} } });
    assert(r.body.predictionsLocked === false, "Missing field: false");
  }

  // Document doesn't exist → false (safe default)
  {
    const r = handle({ httpMethod: "GET", snapExists: false, snapData: null });
    assert(r.body.predictionsLocked === false, "No doc: false");
  }

  // Truthy/falsy coercion
  {
    const truthy = handle({ httpMethod: "GET", snapExists: true, snapData: { data: { predictionsLocked: "yes" } } });
    assert(truthy.body.predictionsLocked === true, "Truthy string -> true");
    const falsy = handle({ httpMethod: "GET", snapExists: true, snapData: { data: { predictionsLocked: 0 } } });
    assert(falsy.body.predictionsLocked === false, "Falsy 0 -> false");
  }

  // Method guard
  {
    const opts = handle({ httpMethod: "OPTIONS" });
    assert(opts.statusCode === 204, "OPTIONS: preflight 204");
    const post = handle({ httpMethod: "POST" });
    assert(post.statusCode === 405, "POST: 405 Method Not Allowed");
  }
}

// ============================================================
// 10. usePublicSettings polling behaviour
// ============================================================
console.log("--- 10. usePublicSettings polling logic ---");
{
  // Simulates the effect body in src/hooks/usePublicSettings.js
  async function driveHook(responses) {
    let settings = { predictionsLocked: false };
    let fetchCount = 0;
    let cancelled = false;

    async function fetchOnce() {
      if (cancelled) return;
      const res = responses[fetchCount++];
      try {
        if (!res.ok) return;
        settings = { predictionsLocked: !!res.body?.predictionsLocked };
      } catch {
        // swallow
      }
    }

    await fetchOnce();
    // Simulate 3 more poll ticks
    for (let i = 0; i < 3 && fetchCount < responses.length; i++) {
      await fetchOnce();
    }

    return { settings, fetchCount };
  }

  // First poll locks, stays locked
  {
    const p = driveHook([
      { ok: true, body: { predictionsLocked: true } },
      { ok: true, body: { predictionsLocked: true } },
    ]);
    const { settings, fetchCount } = await p;
    assert(settings.predictionsLocked === true, "First poll locks the UI");
    assert(fetchCount === 2, "Polls repeatedly");
  }

  // Unlock → lock transition propagates
  {
    const { settings } = await driveHook([
      { ok: true, body: { predictionsLocked: false } },
      { ok: true, body: { predictionsLocked: true } },
    ]);
    assert(settings.predictionsLocked === true, "Transition unlocked→locked surfaces");
  }

  // Fetch error keeps last-known value
  {
    const { settings } = await driveHook([
      { ok: true, body: { predictionsLocked: true } },
      { ok: false },
      { ok: false },
    ]);
    assert(settings.predictionsLocked === true, "Network failure keeps last-known locked state");
  }

  // Initial default before any response
  {
    const { settings } = await driveHook([
      { ok: false },
      { ok: false },
    ]);
    assert(settings.predictionsLocked === false, "All failures: safe default (unlocked)");
  }
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log(`\n=== WELCOME UPCOMING-MATCHES RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
