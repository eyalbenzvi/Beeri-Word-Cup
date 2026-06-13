// Pure normalization of football-data.org /matches payloads into the
// compact shape the live-scores endpoint returns to clients.
//
// Deliberately does NOT map fixtures to our internal matchIds: the client
// already holds the schedule and the knockout bracket (derived from the
// official results in Firestore), so it can pair fixtures by team codes.
// Keeping the server side id-agnostic means no Firestore read here at all —
// the endpoint stays a cheap cacheable proxy.
//
// Output entry shape:
//   { homeCode, awayCode, status, minute, homeScore, awayScore, utcDate }
//
// - codes are in OUR code space (fdCodes.ourCode translation applied);
// - status is football-data's (SCHEDULED/TIMED/IN_PLAY/PAUSED/FINISHED/
//   SUSPENDED/POSTPONED/CANCELLED/AWARDED);
// - minute may be null (the field is plan-dependent on FD's side);
// - scores come from score.fullTime, which FD keeps CURRENT while a match
//   is in play. Either may be null pre-kickoff.

import { ourCode } from "./fdCodes.js";

function intOrNull(v) {
  return Number.isInteger(v) ? v : null;
}

export function normalizeFdMatches(fdMatches) {
  const out = [];
  for (const m of Array.isArray(fdMatches) ? fdMatches : []) {
    const homeCode = ourCode(m?.homeTeam?.tla);
    const awayCode = ourCode(m?.awayTeam?.tla);
    // A fixture without both team codes can't be paired client-side —
    // drop it rather than ship an unmatchable entry.
    if (!homeCode || !awayCode || homeCode === awayCode) continue;
    const ft = m?.score?.fullTime || {};
    out.push({
      homeCode,
      awayCode,
      status: typeof m?.status === "string" ? m.status : null,
      minute: intOrNull(m?.minute),
      homeScore: intOrNull(ft.home),
      awayScore: intOrNull(ft.away),
      utcDate: typeof m?.utcDate === "string" ? m.utcDate : null,
    });
  }
  return out;
}
