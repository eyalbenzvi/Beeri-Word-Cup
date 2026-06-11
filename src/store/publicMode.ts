// Public (logged-out) read-only mode. Powers the blog page for visitors
// who land on a shared link without an account.
//
// Strategy: minimal listener set + Netlify Function endpoints. The
// browser-side unauth onSnapshot collection-query path was observed to
// hang indefinitely in incognito (no success, no error fired), trapping
// guest viewers on the loading state — so we use plain HTTPS GETs for
// summaries / matchResults and a direct Firestore listener for the
// `settings` doc (which has an explicit `if isAuth() || docId == 'settings'`
// rule and resolves reliably even unauth).
//
// A 6-second watchdog force-resolves readiness if anything hangs, so a
// guest never stares at an indefinite spinner. Listeners that arrive
// after the watchdog still upgrade the data normally.
//
// Owns:
//   - Module-level lifecycle flags (publicModeInitialized + timers + unsubs).
//   - markPublicReadinessForced — watchdog body.
//   - fetchPublicSettingsOnce / fetchPublicSummariesOnce — periodic fetchers.
//   - initPublicReadonlyMode / teardownPublicReadonlyMode — entry / exit.

import { getDocs, onSnapshot, query, where } from "firebase/firestore";
import { captureClientError, captureClientMessage } from "../sentry";
import { gameDocRef, summariesCollectionRef, withTimeout } from "./firestoreClient";
import { cache, notifyAndEmit } from "./cache";

let publicModeInitialized = false;
let publicSummariesTimer: ReturnType<typeof setInterval> | null = null;
let publicSettingsUnsub: (() => void) | null = null;
let publicSettingsTimer: ReturnType<typeof setInterval> | null = null;
let publicTournamentTimer: ReturnType<typeof setInterval> | null = null;
let publicReadinessWatchdog: ReturnType<typeof setTimeout> | null = null;

// Hard upper bound on how long a guest viewer can stay on the blog's
// "טוען..." spinner before we force-resolve the readiness flags.
const PUBLIC_READINESS_WATCHDOG_MS = 6000;

export function isPublicModeInitialized() {
  return publicModeInitialized;
}

function markPublicReadinessForced() {
  if (!publicModeInitialized) return;
  let changed = false;
  if (!cache._ready.summaries) {
    cache._ready.summaries = true;
    changed = true;
  }
  if (!cache._ready.settings) {
    cache._ready.settings = true;
    changed = true;
  }
  if (!cache._ready.matchResults) {
    cache._ready.matchResults = true;
    changed = true;
  }
  if (!cache._ready.predictions) {
    cache._ready.predictions = true;
    changed = true;
  }
  if (!cache._ready.userDirectory) {
    cache._ready.userDirectory = true;
    changed = true;
  }
  if (!cache._ready.actualBonuses) {
    cache._ready.actualBonuses = true;
    changed = true;
  }
  if (!cache._ready.actualAdvancing) {
    cache._ready.actualAdvancing = true;
    changed = true;
  }
  if (changed) {
    captureClientMessage("public-readiness-watchdog", {
      thresholdMs: PUBLIC_READINESS_WATCHDOG_MS,
      hadSummaries: Object.keys(cache.summaries || {}).length > 0,
      hadSettings: cache.settings && "predictionsLocked" in cache.settings,
    });
    notifyAndEmit("summaries");
    notifyAndEmit("settings");
    notifyAndEmit("matchResults");
    notifyAndEmit("predictions");
    notifyAndEmit("userDirectory");
    notifyAndEmit("actualBonuses");
    notifyAndEmit("actualAdvancing");
  }
}

async function fetchPublicSettingsOnce() {
  // Capture the mode flag at call time. If the user signs in while the
  // request is in flight, teardownPublicReadonlyMode flips this to false
  // and we must NOT overwrite the authenticated listener's cache with stale
  // public-mode data.
  if (!publicModeInitialized) return;
  let succeeded = false;
  try {
    const res = await fetch(`/.netlify/functions/get-public-settings?t=${Date.now()}`, {
      credentials: "omit",
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      // Re-check after the await: teardown may have happened during the fetch.
      if (!publicModeInitialized) return;
      cache.settings = {
        ...(cache.settings || {}),
        predictionsLocked: !!data?.predictionsLocked,
      };
      if (data?.matchResults && typeof data.matchResults === "object") {
        cache.matchResults = data.matchResults;
      }
      cache._ready.settings = true;
      cache._ready.matchResults = true;
      notifyAndEmit("settings");
      notifyAndEmit("matchResults");
      succeeded = true;
    } else {
      // Surface non-ok responses (deploy misconfig, host_not_allowed at
      // edge, function 5xx) so we don't keep guessing why the blog hangs.
      // Deduped by status so an outage produces one event per session.
      captureClientMessage(`public-settings-fetch-${res.status}`, {
        status: res.status,
        statusText: res.statusText,
      }, "warning");
    }
  } catch (err: any) {
    // Network error / CORS / abort. Same rationale: surface it, but don't
    // throw — the failsafe below still flips readiness so the UI moves.
    captureClientMessage("public-settings-fetch-threw", {
      message: err?.message || "unknown",
    }, "warning");
  }
  // Failure path: still mark the keys as "ready" (with whatever the cache
  // already holds) and notify subscribers. Otherwise an outage of the
  // public settings function would trap a guest viewer on the blog page's
  // "טוען..." spinner. The 30-second retry will upgrade the data when the
  // network recovers; this just stops the indefinite loading state in the
  // meantime.
  if (!succeeded && publicModeInitialized) {
    cache._ready.settings = true;
    cache._ready.matchResults = true;
    notifyAndEmit("settings");
    notifyAndEmit("matchResults");
  }
}

// Direct-Firestore fallback for summaries, used only when the Netlify
// function fails (non-ok response, network error, or a deploy where the
// function doesn't exist). firestore.rules allows unauthenticated reads of
// published summaries — the `status == 'published'` filter makes the query
// provably safe — and a one-shot getDocs wrapped in withTimeout cannot trap
// the viewer the way the unauth onSnapshot listener was observed to: a hang
// resolves into a rejection and we keep whatever the cache already holds.
async function fetchSummariesDirectFallback() {
  try {
    const snap = await withTimeout(
      getDocs(query(summariesCollectionRef, where("status", "==", "published"))),
      8000,
    );
    if (!publicModeInitialized) return false;
    const map: Record<string, any> = {};
    snap.forEach((d: any) => {
      map[d.id] = { id: d.id, ...d.data() };
    });
    cache.summaries = map;
    cache._ready.summaries = true;
    notifyAndEmit("summaries");
    captureClientMessage("public-summaries-direct-fallback-ok", {
      count: Object.keys(map).length,
    }, "info");
    return true;
  } catch (err: any) {
    captureClientMessage("public-summaries-direct-fallback-threw", {
      message: err?.message || "unknown",
    }, "warning");
    return false;
  }
}

// Mirrors fetchPublicSettingsOnce. We use a Netlify function (Admin SDK
// server-side) instead of a browser-side Firestore collection-query
// listener because the unauth onSnapshot path was observed to hang
// indefinitely in incognito (no success, no error fired), trapping guest
// viewers on the empty state. A plain HTTPS GET has no such failure mode.
// If the function itself fails, fetchSummariesDirectFallback above reads
// the published set straight from Firestore so the blog still renders.
async function fetchPublicSummariesOnce() {
  if (!publicModeInitialized) return;
  let succeeded = false;
  try {
    const res = await fetch(`/.netlify/functions/get-public-summaries?t=${Date.now()}`, {
      credentials: "omit",
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (!publicModeInitialized) return;
      const map: Record<string, any> = {};
      if (Array.isArray(data?.summaries)) {
        for (const s of data.summaries) {
          if (s && s.id) map[s.id] = s;
        }
      }
      cache.summaries = map;
      cache._ready.summaries = true;
      notifyAndEmit("summaries");
      succeeded = true;
    } else {
      captureClientMessage(`public-summaries-fetch-${res.status}`, {
        status: res.status,
        statusText: res.statusText,
      }, "warning");
    }
  } catch (err: any) {
    captureClientMessage("public-summaries-fetch-threw", {
      message: err?.message || "unknown",
    }, "warning");
  }
  if (!succeeded && publicModeInitialized) {
    // Second transport: read published summaries straight from Firestore.
    // Only if that ALSO fails do we flip readiness over the existing cache
    // so the UI exits the loading state (30s retry may still recover).
    const recovered = await fetchSummariesDirectFallback();
    if (!recovered && publicModeInitialized) {
      cache._ready.summaries = true;
      notifyAndEmit("summaries");
    }
  }
}

// Tournament data (predictions + userDirectory + actualBonuses +
// actualAdvancing) for guest visitors. Mirrors fetchPublicSettingsOnce —
// same Admin-SDK-via-function pattern, same teardown re-check, same failsafe
// readiness flip. Pre-lock the function returns an empty payload (keys
// flipped to ready so leaderboard/stats render their existing pre-lock
// "locked until tournament starts" panel without spinning).
async function fetchPublicTournamentDataOnce() {
  if (!publicModeInitialized) return;
  let succeeded = false;
  try {
    const res = await fetch(
      `/.netlify/functions/get-public-tournament-data?t=${Date.now()}`,
      { credentials: "omit", cache: "no-store" },
    );
    if (res.ok) {
      const data = await res.json();
      // Re-check after the await: teardown may have happened during the fetch.
      if (!publicModeInitialized) return;
      if (data?.predictions && typeof data.predictions === "object") {
        cache.predictions = data.predictions;
      }
      if (data?.userDirectory && typeof data.userDirectory === "object") {
        cache.userDirectory = data.userDirectory;
      }
      if (data?.actualBonuses && typeof data.actualBonuses === "object") {
        cache.actualBonuses = data.actualBonuses;
      }
      if (data?.actualAdvancing && typeof data.actualAdvancing === "object") {
        cache.actualAdvancing = data.actualAdvancing;
      }
      cache._ready.predictions = true;
      cache._ready.userDirectory = true;
      cache._ready.actualBonuses = true;
      cache._ready.actualAdvancing = true;
      notifyAndEmit("predictions");
      notifyAndEmit("userDirectory");
      notifyAndEmit("actualBonuses");
      notifyAndEmit("actualAdvancing");
      succeeded = true;
    } else {
      captureClientMessage(
        `public-tournament-fetch-${res.status}`,
        { status: res.status, statusText: res.statusText },
        "warning",
      );
    }
  } catch (err: any) {
    captureClientMessage(
      "public-tournament-fetch-threw",
      { message: err?.message || "unknown" },
      "warning",
    );
  }
  // Failsafe — same rationale as fetchPublicSettingsOnce: never trap a
  // guest viewer on an indefinite spinner because of an outage. Default
  // empty cache values are safe for every consumer.
  if (!succeeded && publicModeInitialized) {
    cache._ready.predictions = true;
    cache._ready.userDirectory = true;
    cache._ready.actualBonuses = true;
    cache._ready.actualAdvancing = true;
    notifyAndEmit("predictions");
    notifyAndEmit("userDirectory");
    notifyAndEmit("actualBonuses");
    notifyAndEmit("actualAdvancing");
  }
}

export function initPublicReadonlyMode() {
  if (publicModeInitialized) return;
  publicModeInitialized = true;

  // Published summaries via the Netlify function (Admin SDK server-side).
  fetchPublicSummariesOnce();
  publicSummariesTimer = setInterval(fetchPublicSummariesOnce, 30_000);

  // `gameData/settings` is the source of truth for `predictionsLocked`, and
  // the Firestore rule explicitly allows unauthenticated reads of that doc
  // (see firestore.rules: `allow read: if isAuth() || docId == 'settings'`).
  // We listen directly so the blog's pre-tournament gate works even when
  // the Netlify get-public-settings endpoint is unreachable. matchResults
  // still rides on the function because the rules don't expose it publicly.
  publicSettingsUnsub = onSnapshot(
    gameDocRef("settings"),
    (snap) => {
      if (!publicModeInitialized) return;
      // Diagnostic — same pattern as summaries above.
      captureClientMessage("public-settings-success", {
        exists: snap.exists(),
        fromCache: snap.metadata?.fromCache,
        hasPendingWrites: snap.metadata?.hasPendingWrites,
      }, "info");
      try {
        const data = snap.exists() ? (snap.data() as any)?.data : null;
        cache.settings = {
          ...(cache.settings || {}),
          predictionsLocked: !!(data && data.predictionsLocked),
        };
      } catch (err) {
        console.error("Public settings snapshot parse error:", err);
        captureClientError(err, { source: "publicSettingsParse" });
      }
      cache._ready.settings = true;
      notifyAndEmit("settings");
    },
    (err: any) => {
      console.error("Public settings listener error:", err);
      // permission-denied is expected for unauth reads on docs other than
      // settings; surface as a warning so an outage produces one event
      // per session.
      if (err?.code === "permission-denied") {
        captureClientMessage("publicSettingsListener-permission-denied", { code: err?.code }, "warning");
      } else {
        captureClientError(err, { source: "publicSettingsListener", code: err?.code });
      }
      cache._ready.settings = true;
      notifyAndEmit("settings");
    },
  );

  // matchResults (and a redundant settings refresh) via the public endpoint.
  fetchPublicSettingsOnce();
  publicSettingsTimer = setInterval(fetchPublicSettingsOnce, 30_000);

  // Tournament data (predictions + userDirectory + actualBonuses +
  // actualAdvancing). Pre-lock the response is empty; post-lock guests can
  // read the same data authed users have always read.
  fetchPublicTournamentDataOnce();
  publicTournamentTimer = setInterval(fetchPublicTournamentDataOnce, 30_000);

  // Hard watchdog: if any of the readiness flags haven't flipped after
  // PUBLIC_READINESS_WATCHDOG_MS, force them so the blog page exits the
  // "טוען..." gate. Must come AFTER the listeners are set up so the
  // happy path always wins the race when network/permissions are fine.
  publicReadinessWatchdog = setTimeout(
    markPublicReadinessForced,
    PUBLIC_READINESS_WATCHDOG_MS,
  );

  // Mark other keys ready so the UI doesn't block on unused streams.
  // userDirectory / actualBonuses / actualAdvancing / predictions get their
  // real values from fetchPublicTournamentDataOnce post-lock; we still flip
  // the readiness flag here so isStoreReady() resolves on the first render
  // before the fetch has landed (same rationale as the watchdog).
  for (const key of [
    "users",
    "userDirectory",
    "userPrivate",
    "actualAdvancing",
    "actualBonuses",
    "predictions",
  ]) {
    cache._ready[key] = true;
  }
  notifyAndEmit("users");
  notifyAndEmit("predictions");
}

export function teardownPublicReadonlyMode() {
  if (!publicModeInitialized) return;
  publicModeInitialized = false;
  if (publicSummariesTimer) {
    clearInterval(publicSummariesTimer);
    publicSummariesTimer = null;
  }
  if (publicSettingsUnsub) {
    publicSettingsUnsub();
    publicSettingsUnsub = null;
  }
  if (publicSettingsTimer) {
    clearInterval(publicSettingsTimer);
    publicSettingsTimer = null;
  }
  if (publicTournamentTimer) {
    clearInterval(publicTournamentTimer);
    publicTournamentTimer = null;
  }
  if (publicReadinessWatchdog) {
    clearTimeout(publicReadinessWatchdog);
    publicReadinessWatchdog = null;
  }
  // Symmetry with logoutUser() in the barrel: drop any data the public
  // fetchers populated so the next authenticated session starts from a
  // clean slate. The authed listeners overwrite these cache slices a
  // moment later anyway, but zeroing here prevents a brief window where
  // a re-rendered consumer could read stale public-mode data after the
  // listener teardown but before the first authed snapshot lands.
  cache.predictions = {};
  cache.userDirectory = {};
  cache.actualBonuses = { champion: null, topScorers: [] };
  cache.actualAdvancing = {};
}
