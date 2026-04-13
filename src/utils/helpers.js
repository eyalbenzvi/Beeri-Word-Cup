export function randomScore() {
  const weights = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5];
  return weights[Math.floor(Math.random() * weights.length)];
}

export function normalizeStatus(s) {
  return s === "approved" ? "submitted" : s || "draft";
}

/** Check if a prediction has valid (non-null, non-undefined, non-empty) scores */
export function isScoreValid(pred) {
  return pred != null &&
    pred.homeScore != null && pred.homeScore !== "" &&
    pred.awayScore != null && pred.awayScore !== "";
}
