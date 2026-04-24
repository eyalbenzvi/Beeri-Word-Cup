// Aggregators for the daily-summary blog: given a match and all forms,
// compute how many predicted home/draw/away, the exact-score distribution,
// the most-common predicted scoreline, and who got the exact score right.

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
 *   topScores: [{ score: "2-1", count, pct }],  // top-3 predicted scorelines
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

  for (const [formId, form] of Object.entries(allPredictions || {})) {
    if (!isScorableForm(form)) continue;
    totalForms++;
    const pred = getFormPrediction(form, matchId);
    if (!pred) continue;
    const predOutcome = outcomeOf(pred.homeScore, pred.awayScore);
    if (predOutcome) outcomeCounts[predOutcome] = (outcomeCounts[predOutcome] || 0) + 1;
    const key = `${pred.homeScore}-${pred.awayScore}`;
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

  const actualKey = result ? `${Number(result.homeScore)}-${Number(result.awayScore)}` : null;
  const actualScoreCount = actualKey ? (scoreCounts.get(actualKey) || 0) : 0;

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
  };
}
