import { useMemo } from "react";
import { calculateFullScore, compareTiebreaker } from "../utils/scoring";
import {
  deriveAdvancingTeams,
  deriveActualAdvancing,
  deriveChampion,
} from "../utils/bracket";
import { getCachedBracket } from "../utils/bracketCache";

// Stable references so callers that don't opt into "match points only" mode
// don't thrash the scoring memo, and so the excluded-bonuses path is identical
// on every render.
const EMPTY_ADVANCING = Object.freeze({});
const EMPTY_BONUSES = Object.freeze({ champion: null, topScorers: [] });

// Cross-component memo. The Home page alone mounts three consumers of this hook
// (ScoreStrip, WelcomeBackDigest, LiveRankImpact — the last calls it twice with
// a current + hypothetical results map), and React's per-instance useMemo can't
// share work between them. Since the store hooks (useMatchResults / etc.) hand
// out STABLE references between renders, a tiny reference-keyed LRU lets the
// 2nd..Nth caller with identical inputs reuse the first's O(forms×matches)
// scoring sweep. Size 4 covers "real results" + "live hypothetical" + headroom
// within a single render pass. Bracket derivation is already module-cached
// (getCachedBracket); this extends the sharing to the scoring layer.
type CoreInputs = [any, any, any, any, boolean];
type ScoredForm = {
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
type CoreResult = {
  actualBracket: Record<string, any>;
  actualDerivedAdvancing: any;
  actualDerivedChampion: string | null;
  formBracketMap: Record<string, any>;
  scoredForms: ScoredForm[];
};
const CORE_CACHE: { key: CoreInputs; value: CoreResult }[] = [];
const CORE_CACHE_MAX = 4;

function computeCore(
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

  const actualBracket = getCachedBracket(bracketSource);
  const actualDerivedAdvancing = deriveActualAdvancing(actualBracket, bracketSource);
  const actualDerivedChampion = deriveChampion(bracketSource, actualBracket);

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

  const value: CoreResult = {
    actualBracket,
    actualDerivedAdvancing,
    actualDerivedChampion,
    formBracketMap,
    scoredForms,
  };
  CORE_CACHE.push({ key, value });
  if (CORE_CACHE.length > CORE_CACHE_MAX) CORE_CACHE.shift();
  return value;
}

export function useLeaderboardComputed(
  results: Record<string, any>,
  allPredictions: Record<string, any>,
  users: Record<string, any>,
  actualBonuses: any,
  options?: {
    bracketResults?: Record<string, any>;
    matchPointsOnly?: boolean;
  },
) {
  // Default to `results` so existing callers (Leaderboard, Profile, ScoreStrip,
  // AdminToolsTab, normal simulator mode) behave exactly as before.
  const bracketSource = options?.bracketResults ?? results;
  const matchPointsOnly = options?.matchPointsOnly ?? false;

  const {
    actualBracket,
    actualDerivedAdvancing,
    actualDerivedChampion,
    formBracketMap,
    scoredForms,
  } = useMemo(
    () => computeCore(results, allPredictions, actualBonuses, bracketSource, matchPointsOnly),
    [results, allPredictions, actualBonuses, bracketSource, matchPointsOnly],
  );

  const leaderboard = useMemo(() => {
    return scoredForms.map((entry) => ({
      ...entry,
      userName: users[entry.userId]?.displayName || entry.userId,
    }));
  }, [scoredForms, users]);

  // Dense-ranking with ties: forms tied on totalPoints + tiebreaker share a rank,
  // and the next distinct form's rank reflects the number of entries above it
  // (standard "1,1,3" ranking). Shared here so Leaderboard, Profile, and any
  // future consumer report identical positions.
  const rankedLeaderboard = useMemo(() => {
    const result = [];
    let currentRank = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      if (i > 0) {
        const prev = leaderboard[i - 1];
        if (
          leaderboard[i].totalPoints !== prev.totalPoints ||
          compareTiebreaker(leaderboard[i], prev) !== 0
        ) {
          currentRank = i + 1;
        }
      }
      result.push({ ...leaderboard[i], rank: currentRank });
    }
    return result;
  }, [leaderboard]);

  return {
    actualBracket,
    actualDerivedAdvancing,
    actualDerivedChampion,
    formBracketMap,
    scoredForms,
    leaderboard,
    rankedLeaderboard,
  };
}
