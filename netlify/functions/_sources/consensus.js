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

/**
 * @param {{matchId:string,isKnockout:boolean,homeTeam:string,awayTeam:string}} expected
 * @param {Array} sources - exactly two normalized source results
 * @returns {{decision:string,homeScore?:number,awayScore?:number,advancingTeam?:string|null,reason:string}}
 */
export function computeConsensus(expected, sources) {
  if (!Array.isArray(sources) || sources.length !== 2) {
    return { decision: "error", reason: "expected exactly two sources" };
  }
  const [a, b] = sources;

  // 1. Source reachability.
  if (a?.error || b?.error) {
    const which = [a?.error && a?.name, b?.error && b?.name]
      .filter(Boolean)
      .join(", ");
    return { decision: "error", reason: `source unreachable: ${which}` };
  }

  // 2. Both must report the match as finished.
  if (!a.finished || !b.finished) {
    return { decision: "not-finished", reason: "one or both sources not FINISHED" };
  }

  // 3. Neither source may be unable to separate regulation from extra time.
  if (a.regulationAmbiguous || b.regulationAmbiguous) {
    return {
      decision: "ambiguous",
      reason: "a source could not isolate the 90-minute score",
    };
  }

  // 4. Scores must be present + valid integers on both.
  if (
    !isValidScore(a.home90) ||
    !isValidScore(a.away90) ||
    !isValidScore(b.home90) ||
    !isValidScore(b.away90)
  ) {
    return { decision: "ambiguous", reason: "missing or out-of-range 90' scores" };
  }

  // 5. The two sources must agree on the 90-minute score.
  if (a.home90 !== b.home90 || a.away90 !== b.away90) {
    return {
      decision: "disagree",
      reason: `90' score mismatch: ${a.name} ${a.home90}-${a.away90} vs ${b.name} ${b.home90}-${b.away90}`,
    };
  }

  // 6. Team codes from BOTH sources must match the expected (server) codes.
  const expHome = normCode(expected?.homeTeam);
  const expAway = normCode(expected?.awayTeam);
  if (expHome && expAway) {
    const aHome = normCode(a.homeCode);
    const aAway = normCode(a.awayCode);
    const bHome = normCode(b.homeCode);
    const bAway = normCode(b.awayCode);
    const aOk = aHome === expHome && aAway === expAway;
    const bOk = bHome === expHome && bAway === expAway;
    if (!aOk || !bOk) {
      return {
        decision: "ambiguous",
        reason: "team codes do not match expected fixture",
      };
    }
  }

  const homeScore = a.home90;
  const awayScore = a.away90;

  // 7. Knockout tie at 90' -> need an agreed advancing team.
  let advancingTeam = null;
  if (expected?.isKnockout && homeScore === awayScore) {
    const advA = normCode(a.advancingTeam);
    const advB = normCode(b.advancingTeam);
    if (!advA || !advB) {
      return {
        decision: "ambiguous",
        reason: "knockout tie at 90' without an advancing team from both sources",
      };
    }
    if (advA !== advB) {
      return {
        decision: "disagree",
        reason: `advancing-team mismatch: ${a.advancingTeam} vs ${b.advancingTeam}`,
      };
    }
    // Must be one of the two participating teams.
    if (expHome && expAway && advA !== expHome && advA !== expAway) {
      return {
        decision: "ambiguous",
        reason: "advancing team is not one of the two participants",
      };
    }
    // Preserve original casing from the source.
    advancingTeam = a.advancingTeam;
  }

  return {
    decision: "agreed",
    homeScore,
    awayScore,
    advancingTeam,
    reason: "both sources finished and agree on 90' score" +
      (advancingTeam ? " and advancing team" : ""),
  };
}

export const __test__ = { isValidScore, normCode, MIN_SCORE, MAX_SCORE };
