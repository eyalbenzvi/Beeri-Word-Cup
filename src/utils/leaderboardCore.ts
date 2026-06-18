// Shared scoring + ranking core, extracted from useLeaderboardComputed so the
// live leaderboard AND the retroactive rank-history graph (computeFormRankHistory)
// run through the EXACT same machinery. Keeping a single source of truth here
// guarantees the last point of a form's trend line always equals its current
// leaderboard position — no divergence between "live rank" and "historical rank".

import { calculateFullScore, compareTiebreaker } from "./scoring";
import {
  deriveAdvancingTeams,
  deriveActualAdvancing,
  deriveChampion,
} from "./bracket";
import { getCachedBracket } from "./bracketCache";

// Stable references so callers that don't opt into "match points only" mode
// don't thrash the scoring memo, and so the excluded-bonuses path is identical
// on every render.
export const EMPTY_ADVANCING = Object.freeze({});
export const EMPTY_BONUSES = Object.freeze({ champion: null, topScorers: [] });

export type ScoredForm = {
  formId: string;
  userId: string;
  formName: string;
  totalPoints: number;
  exactScoreCount: number;
  outcomeCount: number;
  correctChampion: boolean;
  correctTopScorer: boolean;
  advancingPoints: Record<string, number>;
  matchScores: Record<string, any>;
};
export type CoreResult = {
  actualBracket: Record<string, any>;
  actualDerivedAdvancing: any;
  actualDerivedChampion: string | null;
  formBracketMap: Record<string, any>;
  scoredForms: ScoredForm[];
};

// The per-form PREDICTION brackets. Depends only on `allPredictions`, never on
// results — so the rank-history replay builds it ONCE and reuses it across all
// chronological cutoffs instead of rebuilding it per cutoff (the dominant cost
// of the old single-function sweep).
export function buildFormBracketMap(
  allPredictions: Record<string, any>,
): Record<string, any> {
  const formBracketMap: Record<string, any> = {};
  for (const [formId, p] of Object.entries(allPredictions)) {
    const predData = p as any;
    const s = predData.status;
    if (s !== "submitted" && s !== "approved") continue;
    const matchPreds = predData.matches || {};
    const predBracket = getCachedBracket(matchPreds);
    formBracketMap[formId] = {
      predBracket,
      advancing: deriveAdvancingTeams(predBracket),
      champion: deriveChampion(matchPreds, predBracket),
    };
  }
  return formBracketMap;
}

// Score + sort every form against a given results/bracket snapshot, reusing a
// precomputed prediction-bracket map. Splitting this out of computeScoredForms
// lets the history replay hoist the (cutoff-invariant) bracket map.
export function scoreFormsWithBracketMap(
  results: Record<string, any>,
  allPredictions: Record<string, any>,
  formBracketMap: Record<string, any>,
  actualBonuses: any,
  bracketSource: Record<string, any>,
  matchPointsOnly: boolean,
): CoreResult {
  const actualBracket = getCachedBracket(bracketSource);
  const actualDerivedAdvancing = deriveActualAdvancing(actualBracket, bracketSource);
  const actualDerivedChampion = deriveChampion(bracketSource, actualBracket);

  const scoredForms = Object.entries(allPredictions)
    .filter(([formId]) => formBracketMap[formId])
    .map(([formId, p]) => {
      const predData = p as any;
      const { predBracket, advancing, champion } = formBracketMap[formId];
      const enrichedPredData = { ...predData, advancing, champion };
      const score = calculateFullScore(
        enrichedPredData,
        results,
        matchPointsOnly ? EMPTY_ADVANCING : actualDerivedAdvancing,
        matchPointsOnly ? EMPTY_BONUSES : { ...actualBonuses, champion: actualDerivedChampion },
        predBracket,
        actualBracket,
      );
      return {
        formId,
        userId: predData.userId,
        formName: predData.formName || "טופס ללא שם",
        ...score,
      };
    })
    .sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
      const tb = compareTiebreaker(a, b);
      if (tb !== 0) return tb;
      return a.formId.localeCompare(b.formId);
    });

  return {
    actualBracket,
    actualDerivedAdvancing,
    actualDerivedChampion,
    formBracketMap,
    scoredForms,
  };
}

// Pure, UN-cached scoring sweep (build the prediction-bracket map, then score).
// Used by computeCore and as the one-shot path for single snapshots.
export function computeScoredForms(
  results: Record<string, any>,
  allPredictions: Record<string, any>,
  actualBonuses: any,
  bracketSource: Record<string, any>,
  matchPointsOnly: boolean,
): CoreResult {
  const formBracketMap = buildFormBracketMap(allPredictions);
  return scoreFormsWithBracketMap(
    results,
    allPredictions,
    formBracketMap,
    actualBonuses,
    bracketSource,
    matchPointsOnly,
  );
}

// Cross-component memo. The Home page alone mounts three consumers of
// useLeaderboardComputed (ScoreStrip, WelcomeBackDigest, LiveRankImpact — the
// last calls it twice with a current + hypothetical results map), and React's
// per-instance useMemo can't share work between them. Since the store hooks
// hand out STABLE references between renders, a tiny reference-keyed LRU lets
// the 2nd..Nth caller with identical inputs reuse the first's O(forms×matches)
// scoring sweep. Size 4 covers "real results" + "live hypothetical" + headroom
// within a single render pass.
type CoreInputs = [any, any, any, any, boolean];
const CORE_CACHE: { key: CoreInputs; value: CoreResult }[] = [];
const CORE_CACHE_MAX = 4;

export function computeCore(
  results: Record<string, any>,
  allPredictions: Record<string, any>,
  actualBonuses: any,
  bracketSource: Record<string, any>,
  matchPointsOnly: boolean,
): CoreResult {
  const key: CoreInputs = [results, allPredictions, actualBonuses, bracketSource, matchPointsOnly];
  for (const entry of CORE_CACHE) {
    const k = entry.key;
    if (
      k[0] === key[0] && k[1] === key[1] && k[2] === key[2] &&
      k[3] === key[3] && k[4] === key[4]
    ) {
      return entry.value;
    }
  }

  const value = computeScoredForms(results, allPredictions, actualBonuses, bracketSource, matchPointsOnly);
  CORE_CACHE.push({ key, value });
  if (CORE_CACHE.length > CORE_CACHE_MAX) CORE_CACHE.shift();
  return value;
}

// Dense-ranking with ties: forms tied on totalPoints + tiebreaker share a rank,
// and the next distinct form's rank reflects the number of entries above it
// (standard "1,1,3" ranking). `sorted` MUST already be ordered by totalPoints
// desc + compareTiebreaker (as computeScoredForms / computeCore return it).
export function assignDenseRanks<T extends { totalPoints: number }>(
  sorted: T[],
): (T & { rank: number })[] {
  const result: (T & { rank: number })[] = [];
  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1];
      if (
        sorted[i].totalPoints !== prev.totalPoints ||
        compareTiebreaker(sorted[i], prev) !== 0
      ) {
        currentRank = i + 1;
      }
    }
    result.push({ ...sorted[i], rank: currentRank });
  }
  return result;
}
