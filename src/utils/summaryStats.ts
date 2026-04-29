// Aggregators for the daily-summary blog: given a match and all forms,
// compute how many predicted home/draw/away, the exact-score distribution,
// the most-common predicted scoreline, and who got the exact score right.
import { POINTS } from "./scoring";

// Editorial thresholds for the "piquant" hooks that drive the suggestion
// panel in the admin editor. Tuned to surface roughly one or two hooks per
// match — too tight and nothing fires, too loose and every match looks
// the same. Documented here so changes are deliberate.
const HOOK_THRESHOLDS = {
  // What counts as a "lone pick" — only this many forms predicted the actual
  // scoreline. 0 means "no one"; 1–3 is the spicy band.
  lonePickMax: 3,
  // Consensus flop: at least this fraction of forms picked the WRONG outcome.
  consensusFlopPct: 70,
  // Underdog outcome: the actual outcome was picked by less than this %.
  underdogOutcomePct: 25,
  // Was-unpredictable: composite — outcome was underdog AND fewer than this
  // many forms got the exact scoreline.
  unpredictableExactMax: 2,
};

function outcomeOf(home, away) {
  const h = Number(home);
  const a = Number(away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

function isScorableForm(form) {
  // Only forms that were actually submitted count as "real" predictions.
  return form && (form.status === "submitted" || form.status === "approved");
}

function getFormPrediction(form, matchId) {
  const p = form?.matches?.[matchId];
  if (!p) return null;
  const h = Number(p.homeScore);
  const a = Number(p.awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { homeScore: h, awayScore: a };
}

/**
 * Compute prediction stats for a single match across all submitted forms.
 *
 * Returns:
 * {
 *   totalForms,                         // # of submitted forms
 *   outcomeCounts: { home, draw, away },
 *   outcomePct: { home, draw, away },   // rounded % of totalForms
 *   topScores: [{ score: "1-2", count, pct }],  // top-3 predicted scorelines, key is "${away}-${home}" for RTL display
 *   exactHitCount,                      // forms matching real result exactly
 *   exactHitForms,                      // array of {formId, formName, userId, userName}
 *   outcomeHitCount,                    // forms matching real outcome (any score)
 *   actual,                             // { homeScore, awayScore, outcome }
 *   actualScoreCount,                   // # of forms that predicted the exact actual scoreline
 *   actualScorePct,
 * }
 */
export function computeMatchStats({
  matchId,
  result,
  allPredictions,
  users,
}) {
  const actualOutcome = result
    ? outcomeOf(result.homeScore, result.awayScore)
    : null;

  const outcomeCounts = { home: 0, draw: 0, away: 0 };
  const scoreCounts = new Map(); // "h-a" -> count
  const exactHitForms = [];
  let outcomeHitCount = 0;
  let totalForms = 0;

  for (const [formId, fAny] of Object.entries(allPredictions || {})) {
    const form = fAny as any;
    if (!isScorableForm(form)) continue;
    totalForms++;
    const pred = getFormPrediction(form, matchId);
    if (!pred) continue;
    const predOutcome = outcomeOf(pred.homeScore, pred.awayScore);
    if (predOutcome) outcomeCounts[predOutcome] = (outcomeCounts[predOutcome] || 0) + 1;
    const key = `${pred.awayScore}-${pred.homeScore}`;
    scoreCounts.set(key, (scoreCounts.get(key) || 0) + 1);
    if (
      result &&
      pred.homeScore === Number(result.homeScore) &&
      pred.awayScore === Number(result.awayScore)
    ) {
      const userId = form.userId;
      const userName = users?.[userId]?.displayName || userId;
      exactHitForms.push({
        formId,
        formName: form.formName || "טופס",
        userId,
        userName,
      });
    }
    if (actualOutcome && predOutcome === actualOutcome) outcomeHitCount++;
  }

  const pct = (n) => (totalForms > 0 ? Math.round((n / totalForms) * 100) : 0);

  const topScores = Array.from(scoreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([score, count]) => ({ score, count, pct: pct(count) }));

  const actualKey = result ? `${Number(result.awayScore)}-${Number(result.homeScore)}` : null;
  const actualScoreCount = actualKey ? (scoreCounts.get(actualKey) || 0) : 0;

  // ---- Editorial / "piquancy" hooks ----
  // All gated on `result` — pre-match a hook makes no sense.
  const outcomeMissPct = result
    ? 100 - (totalForms > 0 ? Math.round((outcomeHitCount / totalForms) * 100) : 0)
    : 0;
  const actualOutcomePct = result && actualOutcome
    ? Math.round((outcomeCounts[actualOutcome] / Math.max(totalForms, 1)) * 100)
    : 0;

  // lonePicks: 1–3 forms got the EXACT actual scoreline. The names. The spice.
  const lonePicks = result && actualScoreCount > 0 && actualScoreCount <= HOOK_THRESHOLDS.lonePickMax
    ? exactHitForms.slice(0, HOOK_THRESHOLDS.lonePickMax).map((f) => ({
        formId: f.formId,
        formName: f.formName,
      }))
    : [];

  // consensusFlop: most picked the wrong outcome.
  const consensusFlop = result && outcomeMissPct >= HOOK_THRESHOLDS.consensusFlopPct
    ? { missPct: outcomeMissPct, actualOutcome }
    : null;

  // underdogHeroes: the actual outcome was picked by a small minority,
  // and they were RIGHT (in outcome — score may differ). Returns the names
  // of forms who picked the underdog outcome.
  let underdogHeroes = [];
  if (result && actualOutcome && actualOutcomePct > 0 && actualOutcomePct < HOOK_THRESHOLDS.underdogOutcomePct) {
    // We need to re-walk forms to grab names that picked the actual outcome.
    // Deliberately a second pass — keeps the main loop unchanged.
    for (const [formId, fAny] of Object.entries(allPredictions || {})) {
      const form = fAny as any;
      if (!isScorableForm(form)) continue;
      const pred = getFormPrediction(form, matchId);
      if (!pred) continue;
      if (outcomeOf(pred.homeScore, pred.awayScore) === actualOutcome) {
        underdogHeroes.push({
          formId,
          formName: form.formName || "טופס",
        });
        if (underdogHeroes.length >= 5) break;
      }
    }
  }

  // wasUnpredictable: composite signal — underdog outcome AND ≤2 exacts.
  // Useful as a single boolean for "this whole match was a surprise".
  const wasUnpredictable = !!(
    result
    && actualOutcomePct > 0
    && actualOutcomePct < HOOK_THRESHOLDS.underdogOutcomePct
    && exactHitForms.length <= HOOK_THRESHOLDS.unpredictableExactMax
  );

  return {
    totalForms,
    outcomeCounts,
    outcomePct: {
      home: pct(outcomeCounts.home),
      draw: pct(outcomeCounts.draw),
      away: pct(outcomeCounts.away),
    },
    topScores,
    exactHitCount: exactHitForms.length,
    exactHitForms,
    outcomeHitCount,
    outcomeHitPct: pct(outcomeHitCount),
    actual: result
      ? {
          homeScore: Number(result.homeScore),
          awayScore: Number(result.awayScore),
          outcome: actualOutcome,
        }
      : null,
    actualScoreCount,
    actualScorePct: pct(actualScoreCount),
    // Editorial hooks (added — never remove the fields above)
    lonePicks,
    consensusFlop,
    underdogHeroes,
    wasUnpredictable,
  };
}

/**
 * Per-form aggregates across a set of covered matches — used to surface
 * day-level "who shone today" suggestions in the blog editor (e.g. "טופס X
 * זכה בהכי הרבה נקודות היום"). Pure: same inputs → same output.
 *
 * `coveredMatches` is `[{ match, result }]` exactly the way `getGlobalSuggestions`
 * already consumes it. Matches without a result are silently skipped — a form
 * can't earn points from an unplayed match.
 *
 * `pointsPerMatch` for each match uses `POINTS[match.stage]` exactly the way
 * `calculateMatchPoints` does (outcome + exact additive). Knockout
 * matchup-alignment is intentionally NOT enforced here: the blog cares about
 * "did the score prediction match the score" as an observational stat, not
 * about whether the form ALSO predicted the right teams reaching that round.
 * Using the strict bracket-aware scoring would silently zero-out knockout
 * predictions whose bracket diverged, which would make the suggestions
 * useless for any form that bracket-mispredicted earlier.
 *
 * Returns: sorted array (best first) of
 *   { formId, formName, exactCount, outcomeCount, totalPoints,
 *     predictedCount, missedAllOutcome, perfectOutcome }
 *
 * Where:
 *   - predictedCount = matches the form actually filled in (out of covered).
 *   - missedAllOutcome = true iff the form filled in every covered match AND
 *                       got 0 outcome hits across all of them (and there are
 *                       at least 2 covered matches — single-match "all-zero"
 *                       isn't a story).
 *   - perfectOutcome  = true iff the form filled in every covered match AND
 *                       got the outcome right on every one.
 */
export function computeFormDayAggregates({
  coveredMatches = [],
  allPredictions,
}) {
  const matchesWithResults = (coveredMatches || []).filter((cm) => !!cm?.result);
  const aggregates = [];
  if (matchesWithResults.length === 0) return aggregates;

  const totalCovered = matchesWithResults.length;

  for (const [formId, fAny] of Object.entries(allPredictions || {})) {
    const form = fAny as any;
    if (!isScorableForm(form)) continue;

    let exactCount = 0;
    let outcomeCount = 0;
    let totalPoints = 0;
    let predictedCount = 0;

    for (const { match, result } of matchesWithResults) {
      const pred = getFormPrediction(form, match.id);
      if (!pred) continue;
      predictedCount++;
      const stagePoints = POINTS[match.stage] || POINTS.group;
      const predOutcome = outcomeOf(pred.homeScore, pred.awayScore);
      const actualOutcome = outcomeOf(result.homeScore, result.awayScore);
      if (predOutcome && predOutcome === actualOutcome) {
        outcomeCount++;
        totalPoints += stagePoints.outcome;
        if (
          pred.homeScore === Number(result.homeScore) &&
          pred.awayScore === Number(result.awayScore)
        ) {
          exactCount++;
          totalPoints += stagePoints.exactScore;
        }
      }
    }

    if (predictedCount === 0) continue;
    aggregates.push({
      formId,
      formName: form.formName || "טופס",
      exactCount,
      outcomeCount,
      totalPoints,
      predictedCount,
      // Only flag forms that engaged with the whole day.
      perfectOutcome: predictedCount === totalCovered && outcomeCount === totalCovered,
      missedAllOutcome:
        totalCovered >= 2 && predictedCount === totalCovered && outcomeCount === 0,
    });
  }

  aggregates.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
    if (b.outcomeCount !== a.outcomeCount) return b.outcomeCount - a.outcomeCount;
    return a.formId.localeCompare(b.formId);
  });
  return aggregates;
}
