// FIFA / Coca-Cola World Ranking — single source of truth.
//
// Two views are exported because two consumers use ranks differently:
//
// 1) FIFA_RANK_OFFICIAL: the actual numerical ranking on the FIFA Coca-Cola
//    World Ranking list (e.g. FRA = 1). Used by bracket.js as the
//    last-resort tiebreaker per the 2026 regulations — exact value matters
//    because gaps influence ordering when teams from different rank cohorts
//    meet (e.g. drawing-tier vs upset-tier).
//
// 2) FIFA_RANK_DENSE: the same 48 teams re-keyed 1..48 by descending
//    strength. Used by fifaPredictor.js with tier thresholds (maxDiff: 3
//    means "within ~3 spots of each other on the WC field"). A dense
//    ranking is what a "spots apart on the WC bracket" calculation needs.
//
// Both views must reference the SAME 48 finalists. If you update one,
// regenerate the other (FIFA_RANK_DENSE is derived: sort by OFFICIAL value,
// re-assign 1..N by sorted position).

export const FIFA_RANK_OFFICIAL = {
  FRA: 1, ESP: 2, ARG: 3, ENG: 4, POR: 5, BRA: 6, NED: 7, MAR: 8,
  BEL: 9, GER: 10, CRO: 11, COL: 13, SEN: 14, MEX: 15, USA: 16,
  URU: 17, JPN: 18, SUI: 19, IRN: 21, TUR: 22, ECU: 23, AUT: 24,
  KOR: 25, AUS: 27, ALG: 28, EGY: 29, CAN: 30, NOR: 31, PAN: 33,
  CIV: 34, SWE: 38, PAR: 40, CZE: 41, SCO: 43, TUN: 44, COD: 46,
  UZB: 50, QAT: 55, IRQ: 57, RSA: 60, KSA: 61, JOR: 63, BIH: 65,
  CPV: 69, GHA: 74, CUR: 82, HAI: 83, NZL: 85,
};

// Derived once at module load so the two views can never disagree.
export const FIFA_RANK_DENSE = (() => {
  const entries = Object.entries(FIFA_RANK_OFFICIAL).sort(
    (a, b) => a[1] - b[1],
  );
  const out = {};
  entries.forEach(([code], idx) => {
    out[code] = idx + 1;
  });
  return out;
})();
