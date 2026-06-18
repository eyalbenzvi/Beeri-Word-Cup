import { useMemo } from "react";
import { computeCore, assignDenseRanks } from "../utils/leaderboardCore";

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

  // Dense-ranking shared with Profile and any future consumer so positions
  // match everywhere (and the rank-history graph's last point equals this).
  const rankedLeaderboard = useMemo(() => assignDenseRanks(leaderboard), [leaderboard]);

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
