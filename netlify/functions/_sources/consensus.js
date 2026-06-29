// Pure two-source consensus logic for auto-fill.
//
// Combines the results from football-data.org (primary) and api-sports
// (secondary) into a single decision. NEVER writes anything; this module is
// intentionally dependency-free so it can be unit-tested directly.
//
// A "source result" is the normalized object returned by the source clients
// (footballData.js / apiSports.js):
//
//   {
//     name: "football-data" | "api-sports",
//     error: false,                 // true => the source was unreachable
//     finished: true,               // FINISHED / FT / AET / PEN
//     home90: 1, away90: 1,         // END-OF-90-MINUTES score (NOT ET/agg)
//     homeCode: "ESP", awayCode: "GER",  // matched 3-letter team codes
//     advancingTeam: "ESP" | null,  // for KO ties at 90'; else null
//     duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | null,
//     regulationAmbiguous: false,   // true => could not separate 90' from ET
//   }
//
// Expected match info:
//   { matchId, isKnockout, homeTeam, awayTeam }   // homeTeam/awayTeam are the
//                                                  // server-authoritative codes
//
// Decision shape:
//   { decision, homeScore?, awayScore?, advancingTeam?, reason }
//   decision ∈ "agreed" | "not-finished" | "ambiguous" | "disagree" | "error"

const MIN_SCORE = 0;
const MAX_SCORE = 20;

function isValidScore(n) {
  return Number.isInteger(n) && n >= MIN_SCORE && n <= MAX_SCORE;
}

// Normalizes a 3-letter code for comparison (uppercase, trimmed). Returns ""
// for nullish input so a missing code never accidentally "matches".
function normCode(c) {
  return typeof c === "string" ? c.trim().toUpperCase() : "";
}

// Source "duration" -> our decidedBy. Inlined (not imported) to keep this
// module dependency-free and unit-testable in isolation.
function decidedByFrom(duration) {
  if (duration === "PENALTY_SHOOTOUT") return "penalties";
  if (duration === "EXTRA_TIME") return "extra_time";
  return "regular";
}

function intOrNull(n) {
  return Number.isInteger(n) ? n : null;
}

// The presentation-only breakdown a single source contributes. Pure pass-through
// of the (already sanity-checked) source fields; carries ZERO scoring weight.
function breakdownOf(s, isTie) {
  return {
    decidedBy: isTie ? decidedByFrom(s.duration) : "regular",
    etHomeScore: intOrNull(s.etHome),
    etAwayScore: intOrNull(s.etAway),
    penHomeScore: intOrNull(s.penHome),
    penAwayScore: intOrNull(s.penAway),
    breakdownSource: intOrNull(s.etHome) != null || intOrNull(s.penHome) != null ? s.name : null,
  };
}

// Reconcile two sources' breakdowns: agree-or-drop per field (a wrong shootout
// score must never be shown), so disagreement degrades to "we know it went to
// ET/pens but not the exact numbers" rather than an arbitrary pick.
function reconcileBreakdown(a, b) {
  const pick = (x, y) => (x == null ? y : y == null ? x : x === y ? x : null);
  const decidedBy =
    a.decidedBy === b.decidedBy
      ? a.decidedBy
      : // exactly one non-regular -> trust it; otherwise fall back to regular
        a.decidedBy !== "regular" && b.decidedBy === "regular"
        ? a.decidedBy
        : b.decidedBy !== "regular" && a.decidedBy === "regular"
          ? b.decidedBy
          : "regular";
  return {
    decidedBy,
    etHomeScore: pick(a.etHomeScore, b.etHomeScore),
    etAwayScore: pick(a.etAwayScore, b.etAwayScore),
    penHomeScore: pick(a.penHomeScore, b.penHomeScore),
    penAwayScore: pick(a.penAwayScore, b.penAwayScore),
    breakdownSource: a.breakdownSource || b.breakdownSource || null,
  };
}

// Evaluate ONE source against the expected fixture. Returns the same decision
// shape used by callers. "agreed" here means: this source alone is finished,
// has a valid 90' score, the teams match, and (for a knockout tie) names a
// valid advancing team. computeConsensus then additionally requires two such
// sources to agree; decideSingleSource trusts this one source.
function evaluateOne(expected, s) {
  if (!s || s.error) {
    return { decision: "error", reason: `source unreachable: ${s?.name || "unknown"}` };
  }
  if (!s.finished) {
    return { decision: "not-finished", reason: `${s.name} not FINISHED` };
  }
  if (s.regulationAmbiguous) {
    return { decision: "ambiguous", reason: `${s.name} could not isolate the 90' score` };
  }
  if (!isValidScore(s.home90) || !isValidScore(s.away90)) {
    return { decision: "ambiguous", reason: `${s.name} missing/out-of-range 90' score` };
  }
  const expHome = normCode(expected?.homeTeam);
  const expAway = normCode(expected?.awayTeam);
  if (expHome && expAway) {
    if (normCode(s.homeCode) !== expHome || normCode(s.awayCode) !== expAway) {
      return { decision: "ambiguous", reason: `${s.name} team codes do not match expected` };
    }
  }
  let advancingTeam = null;
  if (expected?.isKnockout && s.home90 === s.away90) {
    const adv = normCode(s.advancingTeam);
    if (!adv) {
      return { decision: "ambiguous", reason: `${s.name} knockout tie without advancing team` };
    }
    if (expHome && expAway && adv !== expHome && adv !== expAway) {
      return { decision: "ambiguous", reason: `${s.name} advancing team not a participant` };
    }
    advancingTeam = s.advancingTeam;
  }
  const isTie = s.home90 === s.away90;
  return {
    decision: "agreed",
    homeScore: s.home90,
    awayScore: s.away90,
    advancingTeam,
    ...breakdownOf(s, expected?.isKnockout && isTie),
    reason: `${s.name} finished with a valid 90' score`,
  };
}

/**
 * Single-source decision (used in football-data-only mode). Trusts one source,
 * applying the same per-source validity rules used by the two-source path.
 * @param {{matchId:string,isKnockout:boolean,homeTeam:string,awayTeam:string}} expected
 * @param {object} source - one normalized source result
 */
export function decideSingleSource(expected, source) {
  return evaluateOne(expected, source);
}

/**
 * Two-source consensus. Both sources must individually be valid AND agree on
 * the 90' score (and advancing team for knockout ties).
 * @param {{matchId:string,isKnockout:boolean,homeTeam:string,awayTeam:string}} expected
 * @param {Array} sources - exactly two normalized source results
 */
export function computeConsensus(expected, sources) {
  if (!Array.isArray(sources) || sources.length !== 2) {
    return { decision: "error", reason: "expected exactly two sources" };
  }
  const [a, b] = sources;
  const ra = evaluateOne(expected, a);
  const rb = evaluateOne(expected, b);

  // Precedence: error > not-finished > ambiguous before we can compare.
  for (const stage of ["error", "not-finished", "ambiguous"]) {
    if (ra.decision === stage || rb.decision === stage) {
      const bad = ra.decision === stage ? ra : rb;
      return { decision: stage, reason: bad.reason };
    }
  }

  // Both are individually "agreed" — now require cross-source agreement.
  if (ra.homeScore !== rb.homeScore || ra.awayScore !== rb.awayScore) {
    return {
      decision: "disagree",
      reason: `90' score mismatch: ${a.name} ${ra.homeScore}-${ra.awayScore} vs ${b.name} ${rb.homeScore}-${rb.awayScore}`,
    };
  }
  if (normCode(ra.advancingTeam) !== normCode(rb.advancingTeam)) {
    return {
      decision: "disagree",
      reason: `advancing-team mismatch: ${ra.advancingTeam} vs ${rb.advancingTeam}`,
    };
  }

  return {
    decision: "agreed",
    homeScore: ra.homeScore,
    awayScore: ra.awayScore,
    advancingTeam: ra.advancingTeam,
    ...reconcileBreakdown(ra, rb),
    reason: "both sources finished and agree on 90' score" +
      (ra.advancingTeam ? " and advancing team" : ""),
  };
}

export const __test__ = { isValidScore, normCode, MIN_SCORE, MAX_SCORE, evaluateOne };
