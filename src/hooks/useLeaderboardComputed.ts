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

export function useLeaderboardComputed(
  results: Record<string, any>,
  allPredictions: Record<string, any>,
  users: Record<string, any>,
  actualBonuses: any,
  options?: {
    // Derive the knockout bracket / advancing teams / champion backbone from
    // these results instead of `results`. The simulator's "score check" mode
    // scores only a handful of entered matches (`results`) while still
    // resolving real knockout matchups from the actual results, so a form that
    // predicted the wrong teams in a slot still scores 0 (wrong matchup).
    bracketResults?: Record<string, any>;
    // Count only per-match points (outcome + exact). Advancing-team points and
    // champion / top-scorer bonuses are excluded from the total. Used by the
    // simulator's "score check" mode where the question is strictly "who got
    // points on the entered matches".
    matchPointsOnly?: boolean;
  },
) {
  // Default to `results` so existing callers (Leaderboard, Profile, ScoreStrip,
  // AdminToolsTab, normal simulator mode) behave exactly as before.
  const bracketSource = options?.bracketResults ?? results;
  const matchPointsOnly = options?.matchPointsOnly ?? false;

  const actualBracket = useMemo(
    () => getCachedBracket(bracketSource),
    [bracketSource],
  );

  const actualDerivedAdvancing = useMemo(
    () => deriveActualAdvancing(actualBracket, bracketSource),
    [actualBracket, bracketSource],
  );
  const actualDerivedChampion = useMemo(
    () => deriveChampion(bracketSource, actualBracket),
    [bracketSource, actualBracket],
  );

  const formBracketMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const [formId, p] of Object.entries(allPredictions)) {
      const predData = p as any;
      const s = predData.status;
      if (s !== "submitted" && s !== "approved") continue;
      const matchPreds = predData.matches || {};
      const predBracket = getCachedBracket(matchPreds);
      map[formId] = {
        predBracket,
        advancing: deriveAdvancingTeams(predBracket),
        champion: deriveChampion(matchPreds, predBracket),
      };
    }
    return map;
  }, [allPredictions]);

  const scoredForms = useMemo(() => {
    return Object.entries(allPredictions)
      .filter(([formId]) => formBracketMap[formId])
      .map(([formId, p]) => {
        const predData = p as any;
        const { predBracket, advancing, champion } = formBracketMap[formId];
        const enrichedPredData = {
          ...predData,
          advancing,
          champion,
        };
        const score = calculateFullScore(
          enrichedPredData,
          results,
          matchPointsOnly ? EMPTY_ADVANCING : actualDerivedAdvancing,
          matchPointsOnly
            ? EMPTY_BONUSES
            : { ...actualBonuses, champion: actualDerivedChampion },
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
        if (a.totalPoints !== b.totalPoints)
          return b.totalPoints - a.totalPoints;
        const tb = compareTiebreaker(a, b);
        if (tb !== 0) return tb;
        return a.formId.localeCompare(b.formId);
      });
  }, [
    allPredictions,
    formBracketMap,
    results,
    actualBonuses,
    actualDerivedAdvancing,
    actualDerivedChampion,
    actualBracket,
    matchPointsOnly,
  ]);

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
