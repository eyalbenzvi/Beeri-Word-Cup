// Early certainty of third-place R32 advancement.
//
// In the 48-team / 12-group format, R32 is fed by 12 group winners, 12
// runners-up, and the 8 BEST of the 12 third-placed teams. The 8 best-thirds —
// and, separately, WHICH R32 slot each goes to — depend on results across ALL
// groups (the slot is read from the FIFA Annex-C table keyed by the SET of 8
// qualifying group letters; see src/data/thirdPlaceTable.ts).
//
// But certainty can arrive BEFORE every group finishes. This module detects, from
// partial actual results, the two separable certainties the rest of the app
// surfaces:
//
//   • qualifiedThirds — third-placed teams MATHEMATICALLY guaranteed to be among
//     the best 8 (i.e. to reach R32 at all), regardless of how the unplayed
//     matches end. Slot-agnostic; drives advancing-points scoring + "qualified"
//     display.
//   • certainSlots — third-place R32 slots whose occupant is fixed: the group
//     letter the Annex-C table assigns to that slot is invariant across every
//     still-possible set of 8 qualifiers, AND that group is already complete.
//
// SOUNDNESS IS THE CONTRACT: this module must NEVER declare a false certainty.
// Where information is missing it stays conservative (declares nothing), which at
// worst delays a true clinch by a few matches — never asserts a wrong one. Two
// deliberate conservative choices make the guarantee hold:
//
//   1. Goal difference / goals-for are treated as UNBOUNDED for unplayed matches.
//      So if an incomplete group's third CAN merely reach a rival's point total it
//      is counted as a possible threat (it could win the GD/GF tiebreak via a
//      large-margin win). Threat comparison on points therefore uses ≥, not >.
//   2. A tie on (points, GD, GF) between two COMPLETED thirds is treated as
//      "could rank either way". FIFA's real tiebreaker inserts a fair-play /
//      disciplinary step BEFORE the FIFA-ranking step, and this prediction game
//      records only scores — no card data — so we cannot resolve such a tie and
//      must not pretend to. (The only place a tie IS resolved is the all-groups-
//      complete fast path below, which mirrors the bracket's own final ordering
//      for display/scoring parity — at that point nothing is uncertain anyway.)

import { GROUPS } from "../data/teams";
import { groupMatches } from "../data/matches";
import { isScoreValid } from "./helpers";
import { FIFA_RANK_OFFICIAL as FIFA_RANKING } from "../data/fifaRanking";
import { lookupThirdPlaceAssignment, THIRD_PLACE_SLOTS } from "../data/thirdPlaceTable";

// 8 of the 12 third-placed teams qualify (FIFA 2026 format). Mirrors the
// constant in bracket.ts; kept local so this module has no bracket.ts dependency
// (avoids an import cycle — bracket.ts imports THIS module).
const THIRD_PLACE_QUALIFIERS = 8;

const GROUP_NAMES = Object.keys(GROUPS);

// Group letter for each team code, e.g. { BRA: "A", ... }.
const TEAM_GROUP: Record<string, string> = {};
for (const [g, teams] of Object.entries(GROUPS)) {
  for (const t of teams) TEAM_GROUP[t.code] = g;
}

// Pre-grouped match lists so the hot paths don't re-filter the 72-match array.
const GROUP_MATCH_IDS: Record<string, string[]> = {};
for (const g of GROUP_NAMES) GROUP_MATCH_IDS[g] = [];
for (const m of groupMatches) {
  if (GROUP_MATCH_IDS[m.group]) GROUP_MATCH_IDS[m.group].push(m.id);
}

export function isGroupComplete(group: string, results: Record<string, any>): boolean {
  const ids = GROUP_MATCH_IDS[group];
  if (!ids || ids.length === 0) return false;
  return ids.every((id) => isScoreValid(results[id]));
}

type ThirdRecord = { code: string; pts: number; gd: number; gf: number };

// (points, GD, GF) comparison ONLY — no FIFA-ranking fallback. Returns <0 if a
// ranks above b, >0 if below, 0 if tied on all three (genuinely unresolved here;
// see soundness note 2). Used for completed-vs-completed third comparisons.
function compareThirdCore(a: ThirdRecord, b: ThirdRecord): number {
  if (a.pts !== b.pts) return b.pts - a.pts;
  if (a.gd !== b.gd) return b.gd - a.gd;
  if (a.gf !== b.gf) return b.gf - a.gf;
  return 0;
}

// Full FIFA best-thirds ordering (pts, GD, GF, then FIFA ranking) — identical to
// getBestThirdPlaceTeams in bracket.ts. ONLY used by the all-complete fast path,
// where the bracket itself resolves ties this way, so we must match it exactly.
function compareThirdFull(a: ThirdRecord, b: ThirdRecord): number {
  const core = compareThirdCore(a, b);
  if (core !== 0) return core;
  return (FIFA_RANKING[a.code] || 999) - (FIFA_RANKING[b.code] || 999);
}

function thirdRecordOf(group: string, standings: Record<string, any>): ThirdRecord | null {
  const sorted = standings[group];
  const t = sorted && sorted[2];
  if (!t) return null;
  return { code: t.code, pts: t.pts, gd: t.gf - t.ga, gf: t.gf };
}

// Min/max possible POINTS of the eventual 3rd-placed team of an incomplete group,
// over every outcome (W/D/L) of its remaining matches.
//
// The 3rd-placed team's points = the 3rd-largest points value among the 4 teams.
// This is invariant to tiebreakers (they only reorder EQUAL-points teams) and to
// exact scores (points depend only on outcomes), so enumerating the 3^k remaining
// outcomes yields the exact range. k ≤ 6 ⇒ ≤ 729 iterations.
function thirdPointsRange(group: string, results: Record<string, any>): { min: number; max: number } {
  const codes = GROUPS[group as keyof typeof GROUPS].map((t) => t.code);
  const base: Record<string, number> = {};
  for (const c of codes) base[c] = 0;

  const remaining: Array<{ home: string; away: string }> = [];
  for (const m of groupMatches) {
    if (m.group !== group) continue;
    const pred = results[m.id];
    if (isScoreValid(pred)) {
      const h = Number(pred.homeScore);
      const a = Number(pred.awayScore);
      if (h > a) base[m.homeTeam] += 3;
      else if (a > h) base[m.awayTeam] += 3;
      else {
        base[m.homeTeam] += 1;
        base[m.awayTeam] += 1;
      }
    } else {
      remaining.push({ home: m.homeTeam, away: m.awayTeam });
    }
  }

  const thirdLargest = (pts: Record<string, number>): number => {
    const vals = codes.map((c) => pts[c]).sort((x, y) => y - x);
    return vals[2];
  };

  if (remaining.length === 0) {
    const v = thirdLargest(base);
    return { min: v, max: v };
  }

  let min = Infinity;
  let max = -Infinity;
  const k = remaining.length;
  const total = 3 ** k;
  for (let mask = 0; mask < total; mask++) {
    const pts = { ...base };
    let tmp = mask;
    for (const mt of remaining) {
      const outcome = tmp % 3;
      tmp = Math.floor(tmp / 3);
      if (outcome === 0) pts[mt.home] += 3; // home win
      else if (outcome === 1) pts[mt.away] += 3; // away win
      else {
        pts[mt.home] += 1; // draw
        pts[mt.away] += 1;
      }
    }
    const v = thirdLargest(pts);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export type ThirdPlaceCertainty = {
  // Codes of third-placed teams guaranteed to be among the best 8 (reach R32).
  qualifiedThirds: Set<string>;
  // R32 third-place slot id → team code, only where the occupant is certain.
  certainSlots: Record<string, string>;
  // Complete groups whose third is guaranteed in / guaranteed out (diagnostics +
  // candidate-set construction).
  guaranteedInGroups: string[];
  eliminatedGroups: string[];
};

const EMPTY: ThirdPlaceCertainty = {
  qualifiedThirds: new Set(),
  certainSlots: {},
  guaranteedInGroups: [],
  eliminatedGroups: [],
};

// Build the FIFA-table slot→group letter map for a candidate set of 8 groups.
function slotGroupLetters(qualSet: string[]): Record<string, string> | null {
  return lookupThirdPlaceAssignment(qualSet);
}

// All 8-group candidate sets T with mustInclude ⊆ T ⊆ canInclude. Bounded by
// C(12,8)=495 — trivially cheap.
function enumerateCandidateSets(mustInclude: string[], canInclude: string[]): string[][] {
  const must = new Set(mustInclude);
  const optional = canInclude.filter((g) => !must.has(g));
  const need = THIRD_PLACE_QUALIFIERS - must.size;
  if (need < 0 || need > optional.length) return [];

  const out: string[][] = [];
  const choose = (start: number, acc: string[]) => {
    if (acc.length === need) {
      out.push([...mustInclude, ...acc]);
      return;
    }
    for (let i = start; i < optional.length; i++) {
      acc.push(optional[i]);
      choose(i + 1, acc);
      acc.pop();
    }
  };
  choose(0, []);
  return out;
}

/**
 * Compute the early third-place certainty from partial actual results.
 *
 * @param results  match-id → { homeScore, awayScore, ... } (any subset played).
 * @param standings output of calcGroupStandings(results) — passed in so this
 *                  module needs no bracket.ts import (breaks the cycle) and the
 *                  caller's already-computed standings are reused.
 */
export function computeThirdPlaceCertainty(
  results: Record<string, any>,
  standings: Record<string, any>,
): ThirdPlaceCertainty {
  // No play yet → nothing certain (and standings would be all-zero noise).
  const anyPlayed = groupMatches.some((m) => isScoreValid(results[m.id]));
  if (!anyPlayed) return EMPTY;

  const complete: Record<string, boolean> = {};
  for (const g of GROUP_NAMES) complete[g] = isGroupComplete(g, results);

  // ── All-groups-complete fast path ──────────────────────────────────────────
  // Everything is decided; mirror the bracket's own final ordering EXACTLY
  // (pts, GD, GF, FIFA rank) so qualifiedThirds + certainSlots match
  // getBestThirdPlaceTeams / assignThirdPlaceTeams used by calcBracketTeams.
  if (GROUP_NAMES.every((g) => complete[g])) {
    const thirds = GROUP_NAMES
      .map((g) => thirdRecordOf(g, standings))
      .filter(Boolean) as ThirdRecord[];
    thirds.sort(compareThirdFull);
    const top = thirds.slice(0, THIRD_PLACE_QUALIFIERS);
    const qualifiedThirds = new Set(top.map((t) => t.code));
    const qualGroups = top.map((t) => TEAM_GROUP[t.code]);
    const assignment = lookupThirdPlaceAssignment(qualGroups) || {};
    const certainSlots: Record<string, string> = {};
    for (const [slotId, letter] of Object.entries(assignment)) {
      const rec = thirdRecordOf(letter as string, standings);
      if (rec) certainSlots[slotId] = rec.code;
    }
    return {
      qualifiedThirds,
      certainSlots,
      guaranteedInGroups: qualGroups,
      eliminatedGroups: GROUP_NAMES.filter((g) => !qualGroups.includes(g)),
    };
  }

  // ── Partial completion ──────────────────────────────────────────────────────
  const ptsRange: Record<string, { min: number; max: number }> = {};
  for (const g of GROUP_NAMES) ptsRange[g] = thirdPointsRange(g, results);

  const fixedThird: Record<string, ThirdRecord> = {};
  for (const g of GROUP_NAMES) {
    if (complete[g]) {
      const r = thirdRecordOf(g, standings);
      if (r) fixedThird[g] = r;
    }
  }

  // Can group H's third possibly finish at or above completed-group X's third?
  // (Possible threat — conservative: ties and equal-points both count.)
  const canBeAbove = (h: string, x: ThirdRecord): boolean => {
    if (complete[h]) {
      const hr = fixedThird[h];
      if (!hr) return false;
      return compareThirdCore(hr, x) <= 0; // ranks above OR ties (could go either way)
    }
    return ptsRange[h].max >= x.pts; // can reach X's points ⇒ can win GD/GF tiebreak
  };

  // Is group H's third GUARANTEED to finish strictly above X's third?
  const guaranteedAbove = (h: string, x: ThirdRecord): boolean => {
    if (complete[h]) {
      const hr = fixedThird[h];
      if (!hr) return false;
      return compareThirdCore(hr, x) < 0; // strictly above on (pts, GD, GF)
    }
    return ptsRange[h].min > x.pts; // even worst case outscores X ⇒ always above
  };

  const guaranteedInGroups: string[] = [];
  const eliminatedGroups: string[] = [];
  const qualifiedThirds = new Set<string>();

  for (const g of GROUP_NAMES) {
    if (!complete[g]) continue; // only completed groups have a fixed third team
    const x = fixedThird[g];
    if (!x) continue;

    let possibleThreats = 0;
    let definiteThreats = 0;
    for (const h of GROUP_NAMES) {
      if (h === g) continue;
      if (canBeAbove(h, x)) possibleThreats++;
      if (guaranteedAbove(h, x)) definiteThreats++;
    }

    // Guaranteed in: at most 7 rivals can possibly be above ⇒ worst-case rank ≤ 8.
    if (possibleThreats <= THIRD_PLACE_QUALIFIERS - 1) {
      guaranteedInGroups.push(g);
      qualifiedThirds.add(x.code);
    }
    // Guaranteed out: at least 8 rivals are surely above ⇒ best-case rank ≥ 9.
    if (definiteThreats >= THIRD_PLACE_QUALIFIERS) {
      eliminatedGroups.push(g);
    }
  }

  // ── Slot certainty ──────────────────────────────────────────────────────────
  // The real qualifying set T_true always satisfies mustInclude ⊆ T_true ⊆
  // canInclude, so enumerating every such 8-set is a superset of the reachable
  // ones. If the Annex-C table assigns the SAME group letter to a slot for every
  // candidate, it does so for T_true too — and if that group is complete, the
  // slot's team is fixed. Over-approximating candidates can only WITHHOLD a
  // certainty, never invent one.
  const mustInclude = guaranteedInGroups;
  const canInclude = GROUP_NAMES.filter((g) => !eliminatedGroups.includes(g));
  const certainSlots: Record<string, string> = {};

  const candidates = enumerateCandidateSets(mustInclude, canInclude);
  if (candidates.length > 0) {
    // slotId → the single agreed letter, or null once a disagreement is seen.
    const agreed: Record<string, string | null> = {};
    for (const slot of THIRD_PLACE_SLOTS) agreed[slot] = undefined as any;

    for (const cand of candidates) {
      const letters = slotGroupLetters(cand);
      if (!letters) continue; // defensive — every 8-set is a valid Annex-C key
      for (const slot of THIRD_PLACE_SLOTS) {
        const letter = letters[slot];
        if (agreed[slot] === null) continue; // already in disagreement
        if (agreed[slot] === undefined) agreed[slot] = letter;
        else if (agreed[slot] !== letter) agreed[slot] = null;
      }
    }

    for (const slot of THIRD_PLACE_SLOTS) {
      const letter = agreed[slot];
      if (!letter) continue; // undefined (no candidates touched it) or null (split)
      if (!complete[letter]) continue; // feeder group's third not yet fixed
      const rec = fixedThird[letter];
      if (rec) certainSlots[slot] = rec.code;
    }
  }

  return { qualifiedThirds, certainSlots, guaranteedInGroups, eliminatedGroups };
}
