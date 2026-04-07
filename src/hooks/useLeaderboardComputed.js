import { useMemo, useRef } from "react";
import { calculateFullScore, compareTiebreaker } from "../utils/scoring";
import {
  calcBracketTeams,
  deriveAdvancingTeams,
  deriveActualAdvancing,
  deriveChampion,
} from "../utils/bracket";

export function useLeaderboardComputed(
  results,
  allPredictions,
  users,
  actualBonuses,
) {
  // Cache previous results to avoid recomputation when object references change
  // but underlying data hasn't
  const prevResultsRef = useRef(null);
  const prevResultsKey = useRef('');
  const prevBracketRef = useRef(null);

  const resultsKey = Object.keys(results).length + '_' + Object.values(results).map(r => r.homeScore + '-' + r.awayScore).join(',');

  const actualBracket = useMemo(() => {
    if (resultsKey === prevResultsKey.current && prevBracketRef.current) {
      return prevBracketRef.current;
    }
    const bracket = calcBracketTeams(results);
    prevResultsKey.current = resultsKey;
    prevResultsRef.current = results;
    prevBracketRef.current = bracket;
    return bracket;
  }, [results, resultsKey]);

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
      const predBracket = calcBracketTeams(matchPreds);
      map[formId] = {
        predBracket,
        advancing: deriveAdvancingTeams(predBracket),
        champion: deriveChampion(matchPreds, predBracket),
      };
    }
    return map;
  }, [allPredictions]);

  const formScoreCacheRef = useRef({});

  const scoredForms = useMemo(() => {
    // Limit cache size to 500 entries
    if (Object.keys(formScoreCacheRef.current).length > 500) {
      formScoreCacheRef.current = {};
    }

    return Object.entries(allPredictions)
      .filter(([formId]) => formBracketMap[formId])
      .map(([formId, predData]) => {
        const cacheKey = `${formId}_${predData.updatedAt || ''}_${Object.keys(results).length}`;
        if (formScoreCacheRef.current[cacheKey]) {
          return { formId, userId: predData.userId, formName: predData.formName || "טופס ללא שם", ...formScoreCacheRef.current[cacheKey] };
        }

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
        formScoreCacheRef.current[cacheKey] = score;
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

  return {
    actualBracket,
    actualDerivedAdvancing,
    actualDerivedChampion,
    formBracketMap,
    scoredForms,
    leaderboard,
  };
}
