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

import { espnTeamCode } from "./espnTeams.js";
import { espnIsFinished, espnDuration, espnGoals } from "./espnStatus.js";

// "67'", "45'+2'", "90'+4'" -> 67 / 45 / 90 (the displayed match minute).
// Anything non-numeric ("FT", "HT", "-") -> null.
function parseMinute(displayClock) {
  if (typeof displayClock !== "string") return null;
  const m = displayClock.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Live-card status vocabulary the client already understands. Finished/ET
// detection is shared with the auto-fill result client (espnStatus.js) so the
// two can never disagree on whether a match ended or went to extra time.
function mapStatus(status) {
  if (espnIsFinished(status)) return "FINISHED";
  const type = status?.type || {};
  if (type.state === "pre") return "TIMED";
  if (type.state === "in") {
    return type.name === "STATUS_HALFTIME" ? "PAUSED" : "IN_PLAY";
  }
  return null;
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
    const homeCode = espnTeamCode(home.team);
    const awayCode = espnTeamCode(away.team);
    // A fixture without both team codes can't be paired client-side — drop it.
    if (!homeCode || !awayCode || homeCode === awayCode) continue;
    const status = comp.status || ev.status;
    const st = mapStatus(status);
    // duration only carries meaning once the match is under way or done;
    // leaving it null pre-kickoff mirrors football-data's null score.duration.
    const duration =
      st === "IN_PLAY" || st === "PAUSED" || st === "FINISHED"
        ? espnDuration(status)
        : null;
    // Live penalty tally (presentation only) so the card can show "פנדלים 3–2"
    // while the shootout is under way. Only meaningful once it's a shootout.
    const penHome = duration === "PENALTY_SHOOTOUT" ? espnGoals(home.shootoutScore) : null;
    const penAway = duration === "PENALTY_SHOOTOUT" ? espnGoals(away.shootoutScore) : null;
    out.push({
      homeCode,
      awayCode,
      status: st,
      minute: parseMinute(status?.displayClock),
      duration,
      homeScore: espnGoals(home.score),
      awayScore: espnGoals(away.score),
      penHome,
      penAway,
      utcDate:
        typeof (comp.date || ev.date) === "string" ? comp.date || ev.date : null,
    });
  }
  return out;
}
