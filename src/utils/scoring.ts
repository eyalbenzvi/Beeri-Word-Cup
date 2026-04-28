import { isSamePlayer } from "./playerSearch.js";

export const POINTS = {
  group: {
    outcome: 1,
    exactScore: 3,
    advancing: 2,
  },
  R32: {
    outcome: 3,
    exactScore: 3,
    advancing: 4,
  },
  R16: {
    outcome: 5,
    exactScore: 3,
    advancing: 6,
  },
  QF: {
    outcome: 7,
    exactScore: 3,
    advancing: 8,
  },
  SF: {
    outcome: 9,
    exactScore: 3,
    advancing: 10,
  },
  "3RD": {
    outcome: 9,
    exactScore: 3,
    advancing: 0,
  },
  F: {
    outcome: 11,
    exactScore: 3,
    advancing: 0,
  },
};

export const BONUSES = {
  champion: 9,
  topScorer: 8,
};

export function getOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

export function calculateMatchPoints(
  prediction: any,
  actual: any,
  stage: string,
  predTeams?: any,
  actualTeams?: any,
) {
  if (!prediction || !actual || actual.homeScore == null || actual.awayScore == null) {
    return {
      points: 0,
      outcomePoints: 0,
      exactPoints: 0,
      breakdown: "טרם שוחק",
      wrongMatchup: false,
    };
  }
  if (prediction.homeScore == null || prediction.awayScore == null) {
    return {
      points: 0,
      outcomePoints: 0,
      exactPoints: 0,
      breakdown: "אין ניחוש",
      wrongMatchup: false,
    };
  }

  if (stage !== "group" && predTeams && actualTeams) {
    const sameMatchup =
      predTeams.home &&
      predTeams.away &&
      actualTeams.home &&
      actualTeams.away &&
      predTeams.home === actualTeams.home &&
      predTeams.away === actualTeams.away;
    if (!sameMatchup) {
      return {
        points: 0,
        outcomePoints: 0,
        exactPoints: 0,
        breakdown: "משחק שונה",
        wrongMatchup: true,
      };
    }
  }

  const stagePoints = POINTS[stage] || POINTS.group;

  const predHome = Number(prediction.homeScore);
  const predAway = Number(prediction.awayScore);
  const actHome = Number(actual.homeScore);
  const actAway = Number(actual.awayScore);

  if (
    !Number.isFinite(predHome) ||
    !Number.isFinite(predAway) ||
    !Number.isFinite(actHome) ||
    !Number.isFinite(actAway)
  ) {
    return {
      points: 0,
      outcomePoints: 0,
      exactPoints: 0,
      breakdown: "נתון לא תקין",
      wrongMatchup: false,
    };
  }

  let points = 0;
  let outcomePoints = 0;
  let exactPoints = 0;
  const parts = [];

  if (getOutcome(predHome, predAway) === getOutcome(actHome, actAway)) {
    outcomePoints = stagePoints.outcome;
    points += outcomePoints;
    parts.push(`הכרעה: ${outcomePoints}`);

    // Check exact score (תוצאה) — ADDITIONAL points, only if outcome is correct
    if (predHome === actHome && predAway === actAway) {
      exactPoints = stagePoints.exactScore;
      points += exactPoints;
      parts.push(`מדויק: ${exactPoints}`);
    }
  }

  const breakdown = parts.length > 0 ? parts.join(", ") : "";
  return { points, outcomePoints, exactPoints, breakdown, wrongMatchup: false };
}

// Calculate full score for a user including all bonuses
// predBracket = user's bracket derived from their predictions
// actualBracket = bracket derived from actual results
export function calculateFullScore(
  userPredictions: any,
  actualResults: Record<string, any>,
  actualAdvancing: any,
  actualBonuses: any,
  predBracket?: Record<string, any>,
  actualBracket?: Record<string, any>,
) {
  let totalPoints = 0;
  let exactScoreCount = 0;
  let outcomeCount = 0;
  let correctChampion = false;
  let correctTopScorer = false;
  const matchScores: Record<string, any> = {};

  // 1. Match predictions (outcome + exact score)
  for (const [matchId, actual] of Object.entries(actualResults)) {
    const prediction = userPredictions.matches?.[matchId];
    const stage = actual.stage || "group";

    // For knockout, pass team info to check matchup
    const predTeams = predBracket?.[matchId] || null;
    const actualTeams = actualBracket?.[matchId] || null;

    const result = calculateMatchPoints(
      prediction,
      actual,
      stage,
      predTeams,
      actualTeams,
    );
    matchScores[matchId] = result;
    totalPoints += result.points;
    if (result.exactPoints > 0) exactScoreCount++;
    if (result.outcomePoints > 0) outcomeCount++;
  }

  // 2. Advancing predictions (group stage + knockout)
  // Derive actual advancing from actual bracket if not provided separately
  const effectiveActualAdvancing =
    actualAdvancing && Object.keys(actualAdvancing).length > 0
      ? actualAdvancing
      : null;

  const advancingPoints = { R32: 0, R16: 0, QF: 0, SF: 0, F: 0 };

  if (userPredictions.advancing) {
    const advancingSource = effectiveActualAdvancing || {};
    for (const [round, p] of Object.entries(
      userPredictions.advancing,
    )) {
      const predictedTeams = p as string[];
      const actualTeams = advancingSource[round] || [];
      if (actualTeams.length === 0) continue;
      const stage =
        round === "R32"
          ? "group"
          : round === "R16"
            ? "R32"
            : round === "QF"
              ? "R16"
              : round === "SF"
                ? "QF"
                : round === "F"
                  ? "SF"
                  : "group";
      const stagePoints = POINTS[stage] || POINTS.group;

      for (const team of predictedTeams) {
        if (actualTeams.includes(team)) {
          advancingPoints[round] =
            (advancingPoints[round] || 0) + stagePoints.advancing;
          totalPoints += stagePoints.advancing;
        }
      }
    }
  }

  // 3. Champion bonus (אלופה)
  if (
    actualBonuses?.champion &&
    userPredictions.champion === actualBonuses.champion
  ) {
    totalPoints += BONUSES.champion;
    correctChampion = true;
  }

  // 4. Top scorer bonus (מלך השערים)
  // If multiple top scorers, any correct guess gets points.
  // Uses isSamePlayer so stored values in either language (legacy English
  // vs. new Hebrew) still match against actual top scorers regardless of
  // which language the admin entered them in.
  if (Array.isArray(actualBonuses?.topScorers) && userPredictions.topScorer) {
    const userGuess = userPredictions.topScorer;
    if (actualBonuses.topScorers.some((s) => isSamePlayer(userGuess, s))) {
      totalPoints += BONUSES.topScorer;
      correctTopScorer = true;
    }
  }

  return {
    totalPoints,
    exactScoreCount,
    outcomeCount,
    correctChampion,
    correctTopScorer,
    advancingPoints,
    matchScores,
  };
}

// Tiebreaker comparison: returns negative if a wins, positive if b wins, 0 if tied
// שובר שוויון
export function compareTiebreaker(a, b) {
  // 1. More exact scores (פגיעות מדויקות בתוצאה)
  if (a.exactScoreCount !== b.exactScoreCount)
    return b.exactScoreCount - a.exactScoreCount;
  // 2. More correct outcomes (פגיעות בהכרעה)
  if (a.outcomeCount !== b.outcomeCount) return b.outcomeCount - a.outcomeCount;
  // 3. Correct champion (פגיעה באלופה)
  if (a.correctChampion !== b.correctChampion)
    return a.correctChampion ? -1 : 1;
  // 4. Correct top scorer (פגיעה במלך השערים)
  if (a.correctTopScorer !== b.correctTopScorer)
    return a.correctTopScorer ? -1 : 1;
  // 5. More correct teams in final (העלה יותר קבוצות לגמר)
  const aFinal = a.advancingPoints?.F || 0;
  const bFinal = b.advancingPoints?.F || 0;
  if (aFinal !== bFinal) return bFinal - aFinal;
  // 6. More correct teams in semi (חצי)
  const aSF = a.advancingPoints?.SF || 0;
  const bSF = b.advancingPoints?.SF || 0;
  if (aSF !== bSF) return bSF - aSF;
  // 7. More correct teams in QF (רבע)
  const aQF = a.advancingPoints?.QF || 0;
  const bQF = b.advancingPoints?.QF || 0;
  if (aQF !== bQF) return bQF - aQF;
  // 8. More correct teams in R16 (שמינית-16)
  const aR16 = a.advancingPoints?.R16 || 0;
  const bR16 = b.advancingPoints?.R16 || 0;
  if (aR16 !== bR16) return bR16 - aR16;
  // 9. More correct teams in R32 (שמינית)
  const aR32 = a.advancingPoints?.R32 || 0;
  const bR32 = b.advancingPoints?.R32 || 0;
  if (aR32 !== bR32) return bR32 - aR32;
  return 0;
}
