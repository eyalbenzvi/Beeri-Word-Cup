// Retroactive, fully-derived rank history for any form (#6, v2).
//
// The previous implementation accumulated rank points in localStorage on every
// leaderboard visit, so the series reflected "how often THIS browser opened the
// page" rather than real standings — different per viewer, and meaningless for
// forms the viewer hadn't been tracking. This rebuilds the series from scratch
// out of the official results: order every COMPLETED match chronologically (by
// fixed schedule kickoff, not data-entry time), and at each step rank every
// form as if only the matches up to that point had been played. The result is
// deterministic, identical for all viewers, and its final point always equals
// the live leaderboard position.
//
// Cost is O(forms × completedMatches) scoring sweeps per cutoff → O(N × M²)
// overall, which is why it is computed lazily (only when a form detail is
// opened) and memoised per results-object identity: a fresh `results` reference
// arrives from Firestore only when a match is actually entered (a few times a
// day), so the heavy sweep runs at most once per real data change and every
// subsequent form-open is an O(1) map lookup.

import { buildFormBracketMap, scoreFormsWithBracketMap, assignDenseRanks } from "./leaderboardCore";
import { getMatchById } from "../data/matches";
import { getMatchSortTime } from "./chronologicalSchedule";

export type RankPoint = { matchId: string; rank: number; total: number };

// Per-results-object cache. WeakMap keyed on the `results` object itself: when
// Firestore delivers a new results map (a match was entered), the reference
// changes → cache miss → one rebuild; the old entry is GC'd automatically.
// The histories also depend on predictions and bonuses, so the cached value
// records the exact references it was built from and is invalidated if either
// changes while `results` happens to keep the same reference (e.g. an admin
// edits the actual top-scorer between match entries).
type CacheEntry = {
  predsRef: object;
  bonusesRef: any;
  perForm: Map<string, RankPoint[]>;
};
const _cache = new WeakMap<object, CacheEntry>();

function buildAllHistories(
  allResults: Record<string, any>,
  allPredictions: Record<string, any>,
  actualBonuses: any,
): Map<string, RankPoint[]> {
  const out = new Map<string, RankPoint[]>();

  // 1. Completed matches (those with an entered result), chronological order.
  const ordered = Object.keys(allResults)
    .map((id) => ({ id, match: getMatchById(id) }))
    .filter((x) => x.match)
    .sort((a, b) => {
      const d = getMatchSortTime(a.match) - getMatchSortTime(b.match);
      if (d !== 0) return d;
      const fd = (a.match.fifaMatch || 0) - (b.match.fifaMatch || 0);
      if (fd !== 0) return fd;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  if (ordered.length === 0) return out;

  // Prediction brackets are cutoff-invariant — build once and reuse.
  const formBracketMap = buildFormBracketMap(allPredictions);

  // 2. Replay: grow a cumulative results map one match at a time and rank every
  //    form through the SAME core the live leaderboard uses. `cumulative` is the
  //    bracketSource too, so advancing/champion bonuses only count once the
  //    relevant rounds are decided in the results-so-far — a faithful snapshot.
  const cumulative: Record<string, any> = {};
  for (const { id } of ordered) {
    cumulative[id] = allResults[id];
    const { scoredForms } = scoreFormsWithBracketMap(
      cumulative,
      allPredictions,
      formBracketMap,
      actualBonuses,
      cumulative,
      false,
    );
    const ranked = assignDenseRanks(scoredForms);
    for (const f of ranked) {
      let arr = out.get(f.formId);
      if (!arr) {
        arr = [];
        out.set(f.formId, arr);
      }
      arr.push({ matchId: id, rank: f.rank, total: f.totalPoints });
    }
  }
  return out;
}

/**
 * Rank trajectory for a single form: one point per completed match, in
 * chronological order, where `rank` is the form's leaderboard position had only
 * the matches up to (and including) that one been played. Empty array until at
 * least one match has a result, or if the form has no submitted predictions.
 */
export function computeFormRankHistory(
  formId: string,
  allResults: Record<string, any> | null | undefined,
  allPredictions: Record<string, any> | null | undefined,
  actualBonuses: any,
): RankPoint[] {
  if (!formId || !allResults || !allPredictions) return [];
  if (Object.keys(allResults).length === 0) return [];

  let entry = _cache.get(allResults);
  if (!entry || entry.predsRef !== allPredictions || entry.bonusesRef !== actualBonuses) {
    entry = {
      predsRef: allPredictions,
      bonusesRef: actualBonuses,
      perForm: buildAllHistories(allResults, allPredictions, actualBonuses),
    };
    _cache.set(allResults, entry);
  }
  return entry.perForm.get(formId) || [];
}
