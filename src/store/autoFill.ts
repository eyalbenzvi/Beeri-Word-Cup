// Client-side trigger for server-side auto-fill of real match results.
//
// The client never sends scores. It only notices — during normal
// computations (scoring, bracket, the matchResults listener) — that some
// match kicked off >= 2h ago and still has no result, and asks the server to
// go fetch + verify the real score from two independent public football APIs.
// The server is the sole authority for kickoff time, expected teams, and the
// score itself (see netlify/functions/auto-fill-match-result.js).
//
// Design (must stay cheap + non-blocking; returns immediately in the common
// case):
//   a. settings.autoFillEnabled === false  -> short-circuit (kill switch).
//   b. pick the EARLIEST match with !played && now >= kickoff + 2h.
//   c. none -> return.
//   d. sessionStorage lockout "autoFill:lockout:<matchId>" within 5 min -> return.
//   e. module-level in-flight set already has this matchId -> return.
//   f. POST { matchId } + Firebase ID token, fire-and-forget.
//   g. any non-success -> set 5-minute sessionStorage lockout (no escalation).
//   h. success -> clear the lockout; the Firestore listener propagates the row.

import { cache } from "./cache";
import { auth } from "./firestoreClient";
import { ALL_MATCHES } from "../data/matches";
import { getMatchKickoffUTC } from "../utils/matchTime";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;
// Coarse throttle so the scan doesn't run on every keystroke-driven recompute.
// The sessionStorage lockout + in-flight set already prevent duplicate network
// calls; this just keeps the (cheap) 104-match scan off the hot path.
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
// whose kickoff was at least 2h ago.
function findEarliestMissingPastMatch(now: number) {
  const results = cache.matchResults || {};
  let target: { id: string } | null = null;
  let targetKickoff = Infinity;
  for (const m of ALL_MATCHES) {
    const existing = (results as any)[m.id];
    if (existing?.played) continue;
    const kickoff = getMatchKickoffUTC(m);
    if (kickoff == null) continue; // placeholder knockout rows w/o date/time
    if (now < kickoff + TWO_HOURS_MS) continue;
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
    if (res.ok) {
      // Success (200): the new result lands via the matchResults listener.
      clearLockout(matchId);
    } else {
      // 202 (pending/ambiguous), 409 (locked), 425 (too early), 429 (rate
      // limit), 5xx — single 5-minute lockout, no escalation.
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
