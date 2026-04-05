// Scoring system for the World Cup prediction game
export const POINTS = {
  group: {
    exactScore: 5,       // Exact scoreline (e.g., predicted 2-1, actual 2-1)
    correctGoalDiff: 3,  // Correct goal difference (e.g., predicted 2-0, actual 3-1)
    correctOutcome: 2,   // Correct winner/draw
    noPoints: 0,
  },
  R32: {
    exactScore: 6,
    correctGoalDiff: 4,
    correctOutcome: 3,
    correctAdvancing: 2, // Picked the right team to advance
    noPoints: 0,
  },
  R16: {
    exactScore: 7,
    correctGoalDiff: 5,
    correctOutcome: 3,
    correctAdvancing: 2,
    noPoints: 0,
  },
  QF: {
    exactScore: 9,
    correctGoalDiff: 6,
    correctOutcome: 4,
    correctAdvancing: 3,
    noPoints: 0,
  },
  SF: {
    exactScore: 12,
    correctGoalDiff: 8,
    correctOutcome: 5,
    correctAdvancing: 3,
    noPoints: 0,
  },
  '3RD': {
    exactScore: 8,
    correctGoalDiff: 5,
    correctOutcome: 3,
    correctAdvancing: 2,
    noPoints: 0,
  },
  F: {
    exactScore: 15,
    correctGoalDiff: 10,
    correctOutcome: 6,
    correctAdvancing: 4,
    noPoints: 0,
  },
};

// Bonus points
export const BONUSES = {
  correctGroupWinner: 3,     // Guessed which team finishes 1st in group
  correctGroupRunner: 2,     // Guessed which team finishes 2nd in group
  correctChampion: 10,       // Guessed the World Cup winner
  correctTopScorer: 5,       // Guessed the tournament top scorer
};

function getOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
}

export function calculateMatchPoints(prediction, actual, stage) {
  if (!prediction || !actual || actual.homeScore === null || actual.awayScore === null) {
    return { points: 0, breakdown: 'Not played yet' };
  }
  if (prediction.homeScore === null || prediction.awayScore === null) {
    return { points: 0, breakdown: 'No prediction' };
  }

  const stagePoints = POINTS[stage] || POINTS.group;

  const predHome = prediction.homeScore;
  const predAway = prediction.awayScore;
  const actHome = actual.homeScore;
  const actAway = actual.awayScore;

  // Exact score
  if (predHome === actHome && predAway === actAway) {
    return { points: stagePoints.exactScore, breakdown: 'Exact score!' };
  }

  // Correct goal difference (same diff and same outcome)
  const predDiff = predHome - predAway;
  const actDiff = actHome - actAway;
  if (predDiff === actDiff && getOutcome(predHome, predAway) === getOutcome(actHome, actAway)) {
    return { points: stagePoints.correctGoalDiff, breakdown: 'Correct goal difference' };
  }

  // Correct outcome (winner or draw)
  if (getOutcome(predHome, predAway) === getOutcome(actHome, actAway)) {
    return { points: stagePoints.correctOutcome, breakdown: 'Correct outcome' };
  }

  // For knockout: check if they at least picked the advancing team
  if (stage !== 'group' && stagePoints.correctAdvancing) {
    const predWinner = prediction.advancingTeam || (predHome >= predAway ? 'home' : 'away');
    const actWinner = actual.advancingTeam || (actHome >= actAway ? 'home' : 'away');
    if (predWinner === actWinner) {
      return { points: stagePoints.correctAdvancing, breakdown: 'Correct advancing team' };
    }
  }

  return { points: stagePoints.noPoints, breakdown: 'No points' };
}

export function calculateTotalScore(predictions, actualResults) {
  let total = 0;
  const matchScores = {};

  for (const [matchId, actual] of Object.entries(actualResults)) {
    const prediction = predictions[matchId];
    const stage = actual.stage || 'group';
    const result = calculateMatchPoints(prediction, actual, stage);
    matchScores[matchId] = result;
    total += result.points;
  }

  return { total, matchScores };
}
