// Single, shared home/away orientation fix for source results.
//
// Every feed (ESPN, football-data) may list a neutral-venue / knockout fixture
// in the opposite order to OUR schedule ("home" is arbitrary). Each adapter
// used to hand-swap its score + codes inline; once we also carry the
// extra-time and penalty scores, that inline swap had to remember THREE score
// pairs plus the winner flags — exactly the kind of "forgot one" bug that
// silently records a reversed score. Centralising it here means the swap is
// written and tested once, and both adapters call it.
//
// advancingTeam is intentionally NOT swapped: it is a team CODE, not a
// home/away role (same contract as src/utils/predictionAlign — a code is
// orientation-independent). Adapters pass the winner as BOOLEAN flags
// (homeWinner/awayWinner), which DO swap.

function norm(s) {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
}

/**
 * @param {object} r raw, home/away-oriented source fields:
 *   { home90, away90, homeCode, awayCode,
 *     etHome, etAway, penHome, penAway, homeWinner, awayWinner }
 * @param {string} expHome our schedule's home code
 * @param {string} expAway our schedule's away code
 * @returns {object} the same shape, swapped iff the feed listed it reversed.
 */
export function orientToExpected(r, expHome, expAway) {
  const reversed = norm(r.homeCode) === norm(expAway) && norm(r.awayCode) === norm(expHome);
  if (!reversed) return { ...r };
  return {
    ...r,
    home90: r.away90 ?? null,
    away90: r.home90 ?? null,
    homeCode: r.awayCode ?? null,
    awayCode: r.homeCode ?? null,
    etHome: r.etAway ?? null,
    etAway: r.etHome ?? null,
    penHome: r.penAway ?? null,
    penAway: r.penHome ?? null,
    homeWinner: r.awayWinner ?? false,
    awayWinner: r.homeWinner ?? false,
  };
}
