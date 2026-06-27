// World Football Elo ratings for the 48 WC-2026 finalists.
//
// Approximate values (World Football Elo Ratings, eloratings.net, early 2026),
// rounded. These are a STARTING point for the scenario simulator's Elo model
// (src/utils/eloModel.ts): the model updates them by every already-played
// result, so exact starting values matter less than the relative spread.
// Editable as a plain data table — refresh before/at the tournament.
//
// Elo differs from the FIFA ranking on purpose: it is a head-to-head strength
// rating (logistic, zero-sum updates), which gives a principled per-match win
// probability instead of a hand-tuned rank-gap tier table.

export const ELO_RATINGS: Record<string, number> = {
  ARG: 2130, ESP: 2120, FRA: 2080, NED: 2010, BRA: 2015, ENG: 2005, POR: 2000,
  COL: 1985, URU: 1975, GER: 1965, BEL: 1925, CRO: 1920, MAR: 1890,
  SEN: 1850, JPN: 1855, SUI: 1850, ECU: 1840, TUR: 1820, AUT: 1820, NOR: 1815,
  MEX: 1810, IRN: 1800, USA: 1795, KOR: 1790, SWE: 1780, SCO: 1765, CIV: 1745,
  ALG: 1760, CAN: 1760, PAR: 1760, CZE: 1760, AUS: 1740, EGY: 1740, BIH: 1700, GHA: 1700,
  TUN: 1690, COD: 1680, PAN: 1680, RSA: 1660, UZB: 1650, QAT: 1640, IRQ: 1620,
  KSA: 1620, JOR: 1600, CPV: 1590, CUR: 1580, HAI: 1530, NZL: 1500,
};

// Mid-table fallback for any finalist missing above (≈ lower-third strength).
export const DEFAULT_ELO = 1650;
