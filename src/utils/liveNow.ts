// Pure helpers extracted from LiveNowCard so they can be unit-tested in
// isolation and to shrink that component's surface. No React, no DOM — just
// the live-status descriptor, next-match lookup, and countdown formatting.

import { ALL_MATCHES } from "../data/matches";
import { getMatchKickoffUTC } from "./matchTime";
import { FD_FINISHED_STATUS } from "./liveScores";
import { MINUTE_MS } from "./constants";

export interface LiveStatusInfo {
  kind: "live" | "half" | "et" | "finished" | "fallback";
  minute?: number;
}

// Status chip descriptor for one match's live entry.
export function liveStatusInfo(live: any, stage: string): LiveStatusInfo {
  if (!live || !live.status) return { kind: "fallback" };
  if (live.status === FD_FINISHED_STATUS) return { kind: "finished" };
  if (live.status === "PAUSED") return { kind: "half" };
  if (live.status === "IN_PLAY") {
    // ET only exists in knockout; a group-stage minute > 90 is stoppage
    // time and must NOT be labelled "הארכה". Same dual signal as the
    // verdict suppression in computeLiveVerdict: duration when present,
    // minute > 90 as fallback.
    if (
      stage !== "group" &&
      ((live.duration && live.duration !== "REGULAR") ||
        (Number.isInteger(live.minute) && live.minute > 90))
    ) {
      return { kind: "et" };
    }
    return { kind: "live", minute: live.minute };
  }
  // SCHEDULED/TIMED (kickoff delayed) or POSTPONED/SUSPENDED — schedule UI.
  return { kind: "fallback" };
}

// Earliest not-yet-resolved match kicking off strictly after `now`.
export function findNextMatch(results: Record<string, any> | null | undefined, now: number) {
  let best: any = null;
  let bestKickoff = Infinity;
  for (const match of ALL_MATCHES) {
    if (results?.[match.id]) continue;
    const kickoff = getMatchKickoffUTC(match);
    if (kickoff == null || kickoff <= now) continue;
    if (kickoff < bestKickoff) {
      best = match;
      bestKickoff = kickoff;
    }
  }
  return best ? { match: best, kickoff: bestKickoff } : null;
}

// Hebrew countdown label, e.g. "45 דקות" / "2:05 שעות" / "3 שעות".
export function formatTimeLeft(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / MINUTE_MS));
  if (totalMinutes < 60) return `${totalMinutes} דקות`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}:${m < 10 ? `0${m}` : m} שעות` : `${h} שעות`;
}
