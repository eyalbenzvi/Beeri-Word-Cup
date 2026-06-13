// Polling hook for the public live-scores endpoint.
//
// Network discipline (this is the layer that keeps the upstream API alive
// when the whole kibbutz opens the app at kickoff):
//   - polls ONLY while at least one match is in its live window — the
//     caller passes that list; empty list = zero requests (rest days);
//   - one request per ~POLL_MS with random jitter so clients don't
//     synchronize; the server adds its own 55s cache + CDN max-age=60,
//     so upstream sees ~1 req/min no matter how many users are online;
//   - pauses entirely while the tab is hidden, refetches immediately on
//     return to foreground (visibilitychange);
//   - backs off to SLOW_POLL_MS after consecutive failures;
//   - admin kill switch: settings.liveScoresEnabled === false stops the
//     client side; LIVE_SCORES_DISABLED env stops the server side.
//
// Failure stance: never throws into render. After failures the hook keeps
// returning the last good data (with its honest fetchedAt) so the UI can
// label staleness instead of blanking out.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "./useStore";
import { mapLiveEntriesToMatches, stabilizeScores } from "../utils/liveScores";

const POLL_MS = 75 * 1000;
const JITTER_MS = 15 * 1000;
const SLOW_POLL_MS = 150 * 1000;
const FAILURES_BEFORE_SLOWDOWN = 3;
const FETCH_TIMEOUT_MS = 8 * 1000;
const ENDPOINT = "/.netlify/functions/get-live-scores";

async function fetchLiveScores() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { signal: controller.signal });
    if (!res.ok) throw new Error(`live-scores HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.available === false) return null;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param liveMatches  matches currently inside the live window (isLive)
 * @param actualBracket bracket derived from official results (knockout
 *                      participant resolution for pairing)
 * @returns { scores, fetchedAt, failures, enabled }
 *   scores    — { [matchId]: { status, minute, homeScore, awayScore } },
 *               oriented to OUR home/away (mapLiveEntriesToMatches)
 *   fetchedAt — ms timestamp of the data we're showing (server-reported)
 *   failures  — consecutive failed polls (UI shows a quiet note at >= 2)
 */
export function useLiveScores(liveMatches, actualBracket) {
  const settings = useSettings();
  const enabled =
    settings?.liveScoresEnabled !== false &&
    Array.isArray(liveMatches) &&
    liveMatches.length > 0;

  const [state, setState] = useState({
    entries: null,
    fetchedAt: null,
    failures: 0,
  });

  // Poll bookkeeping, none of it render state:
  //   failuresRef        — consecutive-failure count. NOT read back from a
  //                        setState updater (updaters aren't guaranteed to
  //                        run synchronously, which would silently skip the
  //                        backoff exactly during a sustained outage).
  //   pendingDecreaseRef — VAR-debounce memory (see stabilizeScores)
  //   prevScoresRef      — last STABILIZED per-match snapshot
  //   lastEntriesRef     — identity of the poll payload the debounce last
  //                        consumed, so the protocol advances once per POLL,
  //                        not once per render (liveMatches gets a fresh
  //                        identity every 60s clock tick).
  const failuresRef = useRef(0);
  const pendingDecreaseRef = useRef({});
  const prevScoresRef = useRef({});
  const lastEntriesRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let timer = null;
    let inFlight = false;

    // Self-cleaning: always cancels the previously armed timeout, so a
    // hidden->visible refetch can never leave two poll chains running.
    const schedule = (failures) => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (disposed || document.visibilityState === "hidden") return;
      const base = failures >= FAILURES_BEFORE_SLOWDOWN ? SLOW_POLL_MS : POLL_MS;
      timer = setTimeout(tick, base + Math.random() * JITTER_MS);
    };

    const tick = async () => {
      // Re-entry guard: a visibility flip during an in-flight fetch must
      // not start a concurrent tick (each would re-arm its own chain).
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await fetchLiveScores();
        if (disposed) return;
        if (data) {
          failuresRef.current = 0;
          const at = Date.parse(data.fetchedAt || "") || Date.now();
          setState({ entries: data.matches || [], fetchedAt: at, failures: 0 });
        } else {
          // Endpoint reachable but feature off/upstream down — count as a
          // soft failure so the UI can show its quiet note, keep old data.
          failuresRef.current += 1;
          setState((s) => ({ ...s, failures: failuresRef.current }));
        }
      } catch {
        if (disposed) return;
        failuresRef.current += 1;
        setState((s) => ({ ...s, failures: failuresRef.current }));
      } finally {
        inFlight = false;
      }
      schedule(failuresRef.current);
    };

    const onVisibility = () => {
      if (disposed) return;
      if (document.visibilityState === "hidden") {
        if (timer) clearTimeout(timer);
        timer = null;
      } else {
        // Back to foreground: refetch immediately so a stale "live" score
        // is never asserted as current. tick() no-ops if one is in flight;
        // schedule() inside it clears any timer the old chain armed.
        tick();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    tick();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  const scores = useMemo(() => {
    if (!enabled || !state.entries) return {};
    const mapped = mapLiveEntriesToMatches(
      state.entries,
      liveMatches,
      actualBracket,
    );
    // The decrease-debounce must advance once per POLL. This memo also
    // re-runs between polls (liveMatches/actualBracket get new identities
    // on the 60s clock tick), and feeding those re-runs into the protocol
    // would accept a held decrease after ~60s with no confirming poll.
    // So: run the protocol only when a new payload arrived; otherwise
    // reuse the stabilized snapshot, falling back to the fresh mapping for
    // matches that just entered the live window mid-poll.
    if (lastEntriesRef.current !== state.entries) {
      lastEntriesRef.current = state.entries;
      const stable = stabilizeScores(
        prevScoresRef.current,
        mapped,
        pendingDecreaseRef.current,
      );
      prevScoresRef.current = stable;
      return stable;
    }
    const out = {};
    for (const [id, cur] of Object.entries(mapped)) {
      out[id] = prevScoresRef.current[id] ?? cur;
    }
    return out;
  }, [enabled, state.entries, liveMatches, actualBracket]);

  return {
    scores,
    fetchedAt: state.fetchedAt,
    failures: state.failures,
    enabled,
  };
}
