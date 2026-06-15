// Pure normalization of ESPN's (undocumented) soccer scoreboard payload into
// the SAME compact entry shape liveNormalize.js produces, so the client pairs
// ESPN and football-data entries identically (by our team codes) with no
// ESPN-specific branch anywhere downstream.
//
// Why ESPN is the PRIMARY live source (see get-live-scores.js): its free,
// key-less scoreboard endpoint carries genuinely real-time in-play scores,
// whereas football-data.org's free tier deliberately delays scores by minutes.
// football-data stays wired as the FALLBACK for when ESPN is unreachable.
//
// Output entry shape (identical to liveNormalize.js):
//   { homeCode, awayCode, status, minute, duration,
//     homeScore, awayScore, utcDate }
//
// Status mapping — we translate ESPN's status into the SAME canonical values
// the client already understands from football-data (TIMED/IN_PLAY/PAUSED/
// FINISHED). ESPN's status.type.state (pre/in/post) is the reliable coarse
// signal; type.name refines it (STATUS_HALFTIME -> our PAUSED).

import { matchTeamName, FIFA_CODES } from "./teamCodes.js";

const VALID_CODES = new Set(FIFA_CODES);

// "67'", "45'+2'", "90'+4'" -> 67 / 45 / 90 (the displayed match minute).
// Anything non-numeric ("FT", "HT", "-") -> null.
function parseMinute(displayClock) {
  if (typeof displayClock !== "string") return null;
  const m = displayClock.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// ESPN scoreboard scores come as strings ("2"); pre-kickoff they're absent.
function parseScore(v) {
  if (Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

// ESPN team -> our FIFA code. Prefer the full country name via the shared
// alias table (robust to ESPN's naming variants); fall back to the team
// abbreviation only when it is already one of our codes. Unknown -> null, so
// the fixture simply fails to pair (never a wrong/flipped score).
function teamCode(team) {
  if (!team) return null;
  const byName =
    matchTeamName(team.displayName) ||
    matchTeamName(team.shortDisplayName) ||
    matchTeamName(team.name) ||
    matchTeamName(team.location);
  if (byName) return byName;
  const abbr =
    typeof team.abbreviation === "string"
      ? team.abbreviation.trim().toUpperCase()
      : "";
  return VALID_CODES.has(abbr) ? abbr : null;
}

function mapStatus(status) {
  const type = status?.type || {};
  if (type.completed === true || type.state === "post") return "FINISHED";
  if (type.state === "pre") return "TIMED";
  if (type.state === "in") {
    return type.name === "STATUS_HALFTIME" ? "PAUSED" : "IN_PLAY";
  }
  return null;
}

// duration is the client's ET/pens suppression signal. ESPN soccer periods:
// 1/2 regulation, 3/4 extra time, 5 penalties. We also read type.name so a
// finished knockout that went to ET still reports EXTRA_TIME and the client
// keeps suppressing a provisional verdict against an ET-inclusive score.
function mapDuration(status) {
  const type = status?.type || {};
  const name = typeof type.name === "string" ? type.name : "";
  const period = Number.isInteger(status?.period) ? status.period : null;
  if (/PEN|SHOOTOUT/.test(name) || period === 5) return "PENALTY_SHOOTOUT";
  if (/OVERTIME|EXTRA/.test(name) || (period != null && period >= 3)) {
    return "EXTRA_TIME";
  }
  return "REGULAR";
}

export function normalizeEspnEvents(events) {
  const out = [];
  for (const ev of Array.isArray(events) ? events : []) {
    const comp = ev?.competitions?.[0];
    const competitors = comp?.competitors;
    if (!Array.isArray(competitors) || competitors.length < 2) continue;
    // homeAway is the authoritative orientation; if a feed ever omits it, fall
    // back to positional order (ESPN lists home first). Either way the client
    // re-orients to OUR schedule by team code, so a wrong guess here is
    // harmless — dropping the fixture (showing no score) would be worse.
    const home =
      competitors.find((c) => c?.homeAway === "home") || competitors[0];
    const away =
      competitors.find((c) => c?.homeAway === "away") || competitors[1];
    if (!home || !away || home === away) continue;
    const homeCode = teamCode(home.team);
    const awayCode = teamCode(away.team);
    // A fixture without both team codes can't be paired client-side — drop it.
    if (!homeCode || !awayCode || homeCode === awayCode) continue;
    const status = comp.status || ev.status;
    const st = mapStatus(status);
    // duration only carries meaning once the match is under way or done;
    // leaving it null pre-kickoff mirrors football-data's null score.duration.
    const duration =
      st === "IN_PLAY" || st === "PAUSED" || st === "FINISHED"
        ? mapDuration(status)
        : null;
    out.push({
      homeCode,
      awayCode,
      status: st,
      minute: parseMinute(status?.displayClock),
      duration,
      homeScore: parseScore(home.score),
      awayScore: parseScore(away.score),
      utcDate:
        typeof (comp.date || ev.date) === "string" ? comp.date || ev.date : null,
    });
  }
  return out;
}
