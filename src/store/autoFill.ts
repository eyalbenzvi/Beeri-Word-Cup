// Client-side trigger for server-side auto-fill of real match results.
//
// The client never sends scores. It only notices — during normal
// computations (scoring, bracket, the matchResults listener) — that some
// match kicked off >= 1h55m ago and still has no result, and asks the server
// to go fetch + verify the real score (ESPN real-time, football-data fallback).
// The server is the sole authority for kickoff time, expected teams, and the
// score itself (see netlify/functions/auto-fill-match-result.js).
//
// Design (must stay cheap + non-blocking; returns immediately in the common
// case):
//   a. settings.autoFillEnabled === false  -> short-circuit (kill switch).
//   b. pick the EARLIEST match with !played && now >= kickoff + 1h55m.
//   c. none -> return.
//   d. sessionStorage lockout "autoFill:lockout:<matchId>" within 60s -> return.
//   e. module-level in-flight set already has this matchId -> return.
//   f. POST { matchId } + Firebase ID token, fire-and-forget.
//   g. any non-success -> set 60-second sessionStorage lockout (no escalation).
//   h. success -> clear the lockout; the Firestore listener propagates the row.

import { cache } from "./cache";
import { auth } from "./firestoreClient";
import { ALL_MATCHES } from "../data/matches";
import { getMatchKickoffUTC } from "../utils/matchTime";

// Minimum age since kickoff before we ask the server to record a result.
// 1h55m: opens right as a regular-time match ends (90' + HT + stoppage ≈
// 1h50m). MUST match the server gate (MIN_MATCH_AGE_MS in
// netlify/functions/auto-fill-match-result.js) — a looser client value just
// gets 425 back.
const MIN_MATCH_AGE_MS = 115 * 60 * 1000;
// Per-match retry cooldown after a non-200 (pending/ambiguous/not-finished).
// 60s: with the real-time ESPN source the final score exists within seconds of
// the whistle, so retrying each minute caps "whistle -> result written" at
// ~1 min. This is the knob that governs result freshness.
const LOCKOUT_MS = 60 * 1000;
// Coarse throttle so the scan doesn't run on every keystroke-driven recompute.
// NOT a freshness knob (the scan does no network/Firestore I/O); it only keeps
// the cheap 104-match scan off the hot path. The lockout above is what bounds
// latency, so this stays at 5s (lowering it costs CPU for no freshness gain).
const SCAN_THROTTLE_MS = 5000;

const inFlight = new Set<string>();
let lastScanAt = 0;

function lockoutKey(matchId: string) {
  return `autoFill:lockout:${matchId}`;
}

function isLockedOut(matchId: string, now: number): boolean {
  try {
    const raw = sessionStorage.getItem(lockoutKey(matchId));
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && now - ts < LOCKOUT_MS;
  } catch {
    return false;
  }
}

function setLockout(matchId: string) {
  try {
    sessionStorage.setItem(lockoutKey(matchId), String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode / SSR) — the in-flight set and
    // the server-side per-match lock still prevent runaway calls.
  }
}

function clearLockout(matchId: string) {
  try {
    sessionStorage.removeItem(lockoutKey(matchId));
  } catch {
    /* ignore */
  }
}

// Find the earliest (by kickoff) match that has no recorded result yet and
// whose kickoff was at least MIN_MATCH_AGE_MS (1h55m) ago.
function findEarliestMissingPastMatch(now: number) {
  const results = cache.matchResults || {};
  let target: { id: string } | null = null;
  let targetKickoff = Infinity;
  for (const m of ALL_MATCHES) {
    const existing = (results as any)[m.id];
    if (existing?.played) continue;
    const kickoff = getMatchKickoffUTC(m);
    if (kickoff == null) continue; // placeholder knockout rows w/o date/time
    if (now < kickoff + MIN_MATCH_AGE_MS) continue;
    if (kickoff < targetKickoff) {
      targetKickoff = kickoff;
      target = m;
    }
  }
  return target;
}

async function fireAutoFill(matchId: string) {
  inFlight.add(matchId);
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      // Anonymous / not yet authenticated — the function rejects anyway.
      setLockout(matchId);
      return;
    }
    const res = await fetch("/.netlify/functions/auto-fill-match-result", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ matchId }),
    });
    // NOTE: only 200 is "success". 202 is a 2xx (so res.ok would be true!) but
    // signals pending/ambiguous/disagree and MUST back off per spec. Keying on
    // res.ok here would clear the lockout on 202 and re-fire every throttle
    // tick. So check the exact status.
    if (res.status === 200) {
      // Success (or already-filled): the new result lands via the matchResults
      // listener. Clear the lockout.
      clearLockout(matchId);
    } else {
      // 202 (pending/ambiguous/disagree), 409 (locked), 425 (too early),
      // 429 (rate limit), 5xx — single 60-second lockout, no escalation.
      setLockout(matchId);
    }
  } catch {
    setLockout(matchId);
  } finally {
    inFlight.delete(matchId);
  }
}

// Cheap, synchronous, never-throwing entry point. Safe to call from the top of
// any computation. Fires the network request fire-and-forget; never awaited by
// the caller.
export function maybeTriggerAutoFill(): void {
  try {
    // a. kill switch (default ON when undefined).
    if (cache.settings?.autoFillEnabled === false) return;

    const now = Date.now();
    if (now - lastScanAt < SCAN_THROTTLE_MS) return;
    lastScanAt = now;

    const target = findEarliestMissingPastMatch(now);
    if (!target) return;

    const matchId = target.id;
    // e. already in flight for this match.
    if (inFlight.has(matchId)) return;
    // d. session lockout window.
    if (isLockedOut(matchId, now)) return;

    // f. fire and forget.
    void fireAutoFill(matchId);
  } catch {
    // Never let an opportunistic trigger break the computation that called it.
  }
}
