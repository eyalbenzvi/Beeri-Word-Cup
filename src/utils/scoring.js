// Scoring system for Beeri World Cup 2026
// Based on the official Hebrew rules

// Points per stage for match predictions
// outcome = correct winner/draw (הכרעה)
// exactScore = ADDITIONAL points for exact scoreline (תוצאה נכונה)
// advancing = correct team advancing to next round (עליה)
export const POINTS = {
  group: {
    outcome: 1,
    exactScore: 3,   // additional on top of outcome
    advancing: 2,    // per team correctly advancing to R32
  },
  R32: {
    outcome: 3,
    exactScore: 3,
    advancing: 4,    // correct team advancing to QF
  },
  R16: {             // Quarter-finals (רבע גמר)
    outcome: 5,
    exactScore: 3,
    advancing: 6,    // correct team advancing to SF
  },
  QF: {              // Actually this is labeled R16 in our bracket but QF in Hebrew
    outcome: 5,
    exactScore: 3,
    advancing: 6,
  },
  SF: {
    outcome: 7,
    exactScore: 3,
    advancing: 8,    // correct team advancing to final
  },
  '3RD': {
    outcome: 7,
    exactScore: 3,
    advancing: 0,    // no advancing from 3rd place match
  },
  F: {
    outcome: 9,
    exactScore: 3,
    advancing: 0,    // champion bonus is separate
  },
};

// Bonus points
export const BONUSES = {
  champion: 9,       // אלופה
  topScorer: 8,      // מלך השערים
};

function getOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
}

// Calculate points for a single match prediction
// Returns { points, outcomePoints, exactPoints, breakdown }
export function calculateMatchPoints(prediction, actual, stage) {
  if (!prediction || !actual || actual.homeScore === null || actual.awayScore === null) {
    return { points: 0, outcomePoints: 0, exactPoints: 0, breakdown: 'Not played yet' };
  }
  if (prediction.homeScore === null || prediction.homeScore === undefined ||
      prediction.awayScore === null || prediction.awayScore === undefined) {
    return { points: 0, outcomePoints: 0, exactPoints: 0, breakdown: 'No prediction' };
  }

  const stagePoints = POINTS[stage] || POINTS.group;

  const predHome = prediction.homeScore;
  const predAway = prediction.awayScore;
  const actHome = actual.homeScore;
  const actAway = actual.awayScore;

  let points = 0;
  let outcomePoints = 0;
  let exactPoints = 0;
  const parts = [];

  // Check outcome (הכרעה) — correct winner or draw
  if (getOutcome(predHome, predAway) === getOutcome(actHome, actAway)) {
    outcomePoints = stagePoints.outcome;
    points += outcomePoints;
    parts.push(`Outcome: +${outcomePoints}`);

    // Check exact score (תוצאה) — ADDITIONAL points, only if outcome is correct
    if (predHome === actHome && predAway === actAway) {
      exactPoints = stagePoints.exactScore;
      points += exactPoints;
      parts.push(`Exact: +${exactPoints}`);
    }
  }

  const breakdown = parts.length > 0 ? parts.join(', ') : 'No points';
  return { points, outcomePoints, exactPoints, breakdown };
}

// Calculate advancing points for knockout matches
export function calculateAdvancingPoints(predictedTeam, actualTeam, stage) {
  if (!predictedTeam || !actualTeam) return 0;
  const stagePoints = POINTS[stage] || POINTS.group;
  return predictedTeam === actualTeam ? stagePoints.advancing : 0;
}

// Calculate full score for a user including all bonuses
export function calculateFullScore(userPredictions, actualResults, actualAdvancing, actualBonuses) {
  let totalPoints = 0;
  let exactScoreCount = 0;
  let outcomeCount = 0;
  let correctChampion = false;
  let correctTopScorer = false;
  const matchScores = {};

  // 1. Match predictions (outcome + exact score)
  for (const [matchId, actual] of Object.entries(actualResults)) {
    const prediction = userPredictions.matches?.[matchId];
    const stage = actual.stage || 'group';
    const result = calculateMatchPoints(prediction, actual, stage);
    matchScores[matchId] = result;
    totalPoints += result.points;
    if (result.exactPoints > 0) exactScoreCount++;
    if (result.outcomePoints > 0) outcomeCount++;
  }

  // 2. Advancing predictions (group stage + knockout)
  const advancingPoints = { R32: 0, R16: 0, QF: 0, SF: 0, F: 0 };

  if (actualAdvancing && userPredictions.advancing) {
    for (const [round, actualTeams] of Object.entries(actualAdvancing)) {
      const predictedTeams = userPredictions.advancing[round] || [];
      const stage = round === 'R32' ? 'group' : // advancing TO R32 = group stage pts
                    round === 'R16' ? 'R32' :    // advancing TO R16 = R32 pts
                    round === 'QF' ? 'R16' :
                    round === 'SF' ? 'QF' :
                    round === 'F' ? 'SF' : 'group';
      const stagePoints = POINTS[stage] || POINTS.group;

      for (const team of predictedTeams) {
        if (actualTeams.includes(team)) {
          advancingPoints[round] = (advancingPoints[round] || 0) + stagePoints.advancing;
          totalPoints += stagePoints.advancing;
        }
      }
    }
  }

  // 3. Champion bonus (אלופה)
  if (actualBonuses?.champion && userPredictions.champion === actualBonuses.champion) {
    totalPoints += BONUSES.champion;
    correctChampion = true;
  }

  // 4. Top scorer bonus (מלך השערים)
  // If multiple top scorers, any correct guess gets points
  if (actualBonuses?.topScorers && userPredictions.topScorer) {
    const topScorers = actualBonuses.topScorers.map(s => s.toLowerCase().trim());
    if (topScorers.includes(userPredictions.topScorer.toLowerCase().trim())) {
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
  if (a.exactScoreCount !== b.exactScoreCount) return b.exactScoreCount - a.exactScoreCount;
  // 2. More correct outcomes (פגיעות בהכרעה)
  if (a.outcomeCount !== b.outcomeCount) return b.outcomeCount - a.outcomeCount;
  // 3. Correct champion (פגיעה באלופה)
  if (a.correctChampion !== b.correctChampion) return a.correctChampion ? -1 : 1;
  // 4. Correct top scorer (פגיעה במלך השערים)
  if (a.correctTopScorer !== b.correctTopScorer) return a.correctTopScorer ? -1 : 1;
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
  // 8. More correct teams in R32 (שמינית)
  const aR32 = a.advancingPoints?.R32 || 0;
  const bR32 = b.advancingPoints?.R32 || 0;
  if (aR32 !== bR32) return bR32 - aR32;
  return 0;
}
