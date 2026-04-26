// Aggregators for the daily-summary blog: given a match and all forms,
// compute how many predicted home/draw/away, the exact-score distribution,
// the most-common predicted scoreline, and who got the exact score right.

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

  for (const [formId, form] of Object.entries(allPredictions || {})) {
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
    for (const [formId, form] of Object.entries(allPredictions || {})) {
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
