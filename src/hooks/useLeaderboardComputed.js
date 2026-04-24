import { useMemo } from "react";
import { calculateFullScore, compareTiebreaker } from "../utils/scoring";
import {
  deriveAdvancingTeams,
  deriveActualAdvancing,
  deriveChampion,
} from "../utils/bracket";
import { getCachedBracket } from "../utils/bracketCache";

export function useLeaderboardComputed(
  results,
  allPredictions,
  users,
  actualBonuses,
) {
  const actualBracket = useMemo(() => getCachedBracket(results), [results]);

  const actualDerivedAdvancing = useMemo(
    () => deriveActualAdvancing(actualBracket, results),
    [actualBracket, results],
  );
  const actualDerivedChampion = useMemo(
    () => deriveChampion(results, actualBracket),
    [results, actualBracket],
  );

  const formBracketMap = useMemo(() => {
    const map = {};
    for (const [formId, predData] of Object.entries(allPredictions)) {
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
      .map(([formId, predData]) => {
        const { predBracket, advancing, champion } = formBracketMap[formId];
        const enrichedPredData = {
          ...predData,
          advancing,
          champion,
        };
        const score = calculateFullScore(
          enrichedPredData,
          results,
          actualDerivedAdvancing,
          { ...actualBonuses, champion: actualDerivedChampion },
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
