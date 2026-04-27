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

/**
 * Returns "auto" when the user prefers reduced motion, otherwise "smooth".
 * Use as `behavior:` in scrollIntoView / scrollTo. The CSS reduced-motion
 * rule covers `scroll-behavior: smooth` declarations but does NOT affect the
 * imperative `scrollIntoView({ behavior: "smooth" })` API — so we have to
 * read the media query in JS too.
 */
export function preferredScrollBehavior() {
  if (typeof window === "undefined" || !window.matchMedia) return "smooth";
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  } catch {
    return "smooth";
  }
}
