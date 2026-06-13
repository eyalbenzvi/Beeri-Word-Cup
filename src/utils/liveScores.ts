// Pure logic for the LiveNow card: pairing live-score entries from the
// public endpoint with our matches, and judging a form's prediction
// against an in-progress score.
//
// Hard rules (see docs/brand-book.md + the homepage redesign review):
//   - Points are NEVER hardcoded in copy. Every number a verdict shows
//     comes out of calculateMatchPoints / POINTS, so a knockout exact hit
//     reads "+8" and a final "+14" without anyone remembering to update
//     a string.
//   - A live verdict is provisional. During knockout extra time /
//     penalties the recorded score will be the 90-minute score, which we
//     cannot isolate from a live feed — so the verdict is suppressed.
//   - An official Firestore result always outranks live data; callers only
//     feed matches that have no recorded result yet (isLive selector).

import { calculateMatchPoints } from "./scoring";
import { resolveMatchTeams } from "./predictionAlign";

// FD statuses we treat as "the clock may still run".
export const FD_LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);
export const FD_FINISHED_STATUS = "FINISHED";

/**
 * Pair normalized endpoint entries with our match objects.
 *
 * entries:       [{ homeCode, awayCode, status, minute, homeScore, awayScore }]
 * matches:       our match objects (typically the isLive subset)
 * actualBracket: bracket derived from official results — resolves knockout
 *                participants (group matches use the fixed schedule teams)
 *
 * Returns { [matchId]: { status, minute, homeScore, awayScore } } with the
 * scores ORIENTED to our home/away assignment: football-data may list the
 * fixture flipped (nominal "home" is arbitrary at a neutral venue), and a
 * reversed score in an RTL UI is exactly the class of bug this codebase
 * stamps out — so the swap happens here, once, before any rendering.
 *
 * Matches we can't pair (unresolved bracket slot, fixture missing from the
 * feed) are simply absent — the caller renders its schedule-based fallback.
 */
export function mapLiveEntriesToMatches(entries, matches, actualBracket) {
  const out: Record<string, any> = {};
  if (!Array.isArray(entries) || !Array.isArray(matches)) return out;
  for (const match of matches) {
    const teams = resolveMatchTeams(match, actualBracket);
    if (!teams.home || !teams.away) continue;
    const entry = entries.find(
      (e) =>
        e &&
        ((e.homeCode === teams.home && e.awayCode === teams.away) ||
          (e.homeCode === teams.away && e.awayCode === teams.home)),
    );
    if (!entry) continue;
    const flipped = entry.homeCode === teams.away;
    out[match.id] = {
      status: entry.status || null,
      minute: Number.isInteger(entry.minute) ? entry.minute : null,
      homeScore: flipped ? entry.awayScore : entry.homeScore,
      awayScore: flipped ? entry.homeScore : entry.awayScore,
    };
  }
  return out;
}

/**
 * Judge one form's prediction against a live score.
 *
 * Returns { kind, points } where kind is one of:
 *   "no-data"         — no usable live score (render schedule fallback)
 *   "no-prediction"   — the form has no valid score for this match
 *   "different-teams" — knockout slot seats other teams in this form
 *   "suppressed"      — knockout beyond 90' (ET/pens): scoring uses the
 *                       90' score which a live feed can't isolate
 *   "exact"           — outcome + exact score both correct right now
 *   "outcome"         — outcome correct right now
 *   "none"            — earning nothing right now
 *
 * points = what the form earns IF the current score stands, straight from
 * calculateMatchPoints (group exact = 1+3 = 4; QF exact = 7+3 = 10; ...).
 */
export function computeLiveVerdict({
  prediction,
  live,
  stage,
  predTeams,
  actualTeams,
}: {
  prediction: any;
  live: any;
  stage: string;
  predTeams?: any;
  actualTeams?: any;
}) {
  if (!live || live.homeScore == null || live.awayScore == null) {
    return { kind: "no-data", points: 0 };
  }
  if (
    stage !== "group" &&
    Number.isInteger(live.minute) &&
    live.minute > 90
  ) {
    return { kind: "suppressed", points: 0 };
  }
  const result = calculateMatchPoints(
    prediction,
    { homeScore: live.homeScore, awayScore: live.awayScore },
    stage,
    predTeams,
    actualTeams,
  );
  if (result.wrongMatchup) return { kind: "different-teams", points: 0 };
  if (prediction?.homeScore == null || prediction?.awayScore == null) {
    return { kind: "no-prediction", points: 0 };
  }
  if (result.exactPoints > 0) return { kind: "exact", points: result.points };
  if (result.outcomePoints > 0)
    return { kind: "outcome", points: result.points };
  return { kind: "none", points: 0 };
}

/**
 * Exhaustive rollup for the multi-form summary line. Every form lands in
 * exactly one bucket so the counts always add up to the number of forms —
 * "3 מתוך 8" must never leave a reader hunting for missing forms.
 */
export function summarizeVerdicts(verdicts) {
  let scoring = 0;
  for (const v of verdicts || []) {
    if (v && (v.kind === "exact" || v.kind === "outcome")) scoring++;
  }
  return { scoring, total: (verdicts || []).length };
}

/**
 * Stabilize live scores across polls: a score DECREASE (VAR overturn or a
 * feed glitch) is only accepted after two consecutive polls agree on it.
 * Increases and status/minute changes pass through immediately.
 *
 * prev / next: { [matchId]: { status, minute, homeScore, awayScore } }
 * pendingRef:  mutable object the caller owns across polls
 *              ({ [matchId]: { homeScore, awayScore } })
 */
export function stabilizeScores(prev, next, pendingRef) {
  const out: Record<string, any> = {};
  for (const [id, cur] of Object.entries(next || {})) {
    const entry: any = cur;
    const old = prev?.[id];
    const decreased =
      old &&
      old.homeScore != null &&
      old.awayScore != null &&
      entry.homeScore != null &&
      entry.awayScore != null &&
      (entry.homeScore < old.homeScore || entry.awayScore < old.awayScore);
    if (!decreased) {
      delete pendingRef[id];
      out[id] = entry;
      continue;
    }
    const pending = pendingRef[id];
    if (
      pending &&
      pending.homeScore === entry.homeScore &&
      pending.awayScore === entry.awayScore
    ) {
      // Second consecutive poll agrees — accept the decrease.
      delete pendingRef[id];
      out[id] = entry;
    } else {
      // First sighting of a decrease: hold the previous score, keep the
      // fresh status/minute, and remember the candidate.
      pendingRef[id] = { homeScore: entry.homeScore, awayScore: entry.awayScore };
      out[id] = { ...entry, homeScore: old.homeScore, awayScore: old.awayScore };
    }
  }
  return out;
}
