// Pure helpers extracted from LiveNowCard so they can be unit-tested in
// isolation and to shrink that component's surface. No React, no DOM — just
// the live-status descriptor, next-match lookup, and countdown formatting.

import { ALL_MATCHES } from "../data/matches";
import { getMatchKickoffUTC } from "./matchTime";
import { getMatchDateKey } from "./userTime";
import { FD_FINISHED_STATUS } from "./liveScores";
import { MINUTE_MS } from "./constants";

export interface LiveStatusInfo {
  kind: "live" | "half" | "et" | "pens" | "finished" | "fallback";
  minute?: number;
}

// Status chip descriptor for one match's live entry.
export function liveStatusInfo(live: any, stage: string): LiveStatusInfo {
  if (!live || !live.status) return { kind: "fallback" };
  if (live.status === FD_FINISHED_STATUS) return { kind: "finished" };
  if (live.status === "PAUSED") return { kind: "half" };
  if (live.status === "IN_PLAY") {
    // ET / penalties only exist in knockout; a group-stage minute > 90 is
    // stoppage time and must NOT be labelled "הארכה". Same dual signal as the
    // verdict suppression in computeLiveVerdict: duration when present,
    // minute > 90 as fallback.
    if (stage !== "group" && live.duration === "PENALTY_SHOOTOUT") {
      return { kind: "pens" };
    }
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

// Every not-yet-resolved match sharing the EARLIEST kickoff strictly after
// `now`. On matchday 3 a group's two matches kick off at the same minute (by
// design, for sporting fairness), so "the next match" is really a set — the
// caller decides how to render one vs. many. Two passes: find the earliest
// eligible kickoff, then collect all matches at exactly that timestamp.
// Returns `null` (never an empty set) when nothing is eligible.
export function findNextMatch(results: Record<string, any> | null | undefined, now: number) {
  let bestKickoff = Infinity;
  for (const match of ALL_MATCHES) {
    if (results?.[match.id]) continue;
    const kickoff = getMatchKickoffUTC(match);
    if (kickoff == null || kickoff <= now) continue;
    if (kickoff < bestKickoff) bestKickoff = kickoff;
  }
  if (bestKickoff === Infinity) return null;
  // Array order = group letter within a shared slot, a sensible reading order.
  const matches = ALL_MATCHES.filter((match) => {
    if (results?.[match.id]) return false;
    return getMatchKickoffUTC(match) === bestKickoff;
  });
  return { matches, kickoff: bestKickoff };
}

// Count not-yet-resolved matches that kick off STRICTLY LATER on `todayKey`
// (the viewer's local day), excluding a set of already-shown match ids. The
// "next match" strip shows the earliest-kickoff set above this count, so those
// ids must be excluded — otherwise a simultaneous twin is double-counted as
// "one more later today" while it's already on screen kicking off right now.
export function countLaterTodayMatches(
  results: Record<string, any> | null | undefined,
  now: number,
  todayKey: string,
  tz: string | undefined,
  excludeIds: Set<string>,
): number {
  return ALL_MATCHES.filter(
    (m) =>
      !results?.[m.id] &&
      getMatchDateKey(m, tz) === todayKey &&
      (getMatchKickoffUTC(m) ?? 0) > now &&
      !excludeIds.has(m.id),
  ).length;
}

// Hebrew countdown label, e.g. "45 דקות" / "2:05 שעות" / "3 שעות".
export function formatTimeLeft(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / MINUTE_MS));
  if (totalMinutes < 60) return `${totalMinutes} דקות`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}:${m < 10 ? `0${m}` : m} שעות` : `${h} שעות`;
}
