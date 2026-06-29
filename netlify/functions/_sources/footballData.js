// Thin client for football-data.org (PRIMARY source).
//
// Contract:
//   fetchMatchResult({ fifaMatch, homeTeam, awayTeam, kickoffIso })
//     -> normalized source result (see consensus.js), or { name, error:true }
//
// Env:
//   FOOTBALL_DATA_TOKEN            - X-Auth-Token header value
//   AUTO_FILL_COMPETITION_ID_FD    - competition code/id (e.g. "WC")
//
// We record the END-OF-90-MINUTES score only: score.fullTime.{home,away}.
// score.duration ("REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT") tells us
// whether the match went beyond 90'; for a knockout tie at 90' we read the
// overall winner (score.winner) to report the advancing team. We never use the
// aggregate/ET total as the recorded score.

import { norm, ourCode } from "./fdCodes.js";
import { getJson, dayWindow } from "./http.js";
import { orientToExpected } from "./orient.js";

const NAME = "football-data";
const BASE = "https://api.football-data.org/v4";

// Find the fixture whose two teams' codes are exactly the expected pair
// (orientation-independent), comparing in OUR code space.
function findFixture(matches, homeTeam, awayTeam) {
  const want = new Set([norm(homeTeam), norm(awayTeam)]);
  return (matches || []).find((m) => {
    const h = ourCode(m?.homeTeam?.tla);
    const a = ourCode(m?.awayTeam?.tla);
    return h && a && want.has(h) && want.has(a) && h !== a;
  });
}

function tlaWinner(match) {
  // score.winner is "HOME_TEAM" | "AWAY_TEAM" | "DRAW" for the overall result.
  const w = match?.score?.winner;
  if (w === "HOME_TEAM") return ourCode(match?.homeTeam?.tla) || null;
  if (w === "AWAY_TEAM") return ourCode(match?.awayTeam?.tla) || null;
  return null;
}

export async function fetchMatchResult({ homeTeam, awayTeam, kickoffIso }) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const comp = process.env.AUTO_FILL_COMPETITION_ID_FD;
  if (!token || !comp) {
    return { name: NAME, error: true, reason: "missing FD env config" };
  }

  const { from, to } = dayWindow(Date.parse(kickoffIso));
  const url = `${BASE}/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${from}&dateTo=${to}`;
  const H = { "X-Auth-Token": token };

  // One request + a single fallback retry on transient failure, then give up.
  let data;
  try {
    data = await getJson(url, H);
  } catch (err1) {
    try {
      data = await getJson(url, H);
    } catch (err2) {
      return { name: NAME, error: true, reason: err2?.message || String(err2) };
    }
  }

  const match = findFixture(data?.matches, homeTeam, awayTeam);
  if (!match) {
    // No fixture found yet -> treat as not finished (don't write).
    return { name: NAME, error: false, finished: false, reason: "fixture not found" };
  }

  const finished = match.status === "FINISHED";
  const duration = match?.score?.duration || null;

  // END-OF-90-MINUTES score only. In football-data v4, score.fullTime is the
  // FINAL result and, for a knockout that went to extra time, INCLUDES extra
  // time (e.g. 2-1 even though it was 1-1 at 90'). The 90' score, when the API
  // exposes it, lives in score.regularTime. Strategy that is correct no matter
  // the exact field name:
  //   - regularTime present            -> use it (the true 90' score);
  //   - else duration === "REGULAR"    -> fullTime IS the 90' score (no ET);
  //   - else (ET/PEN, no regularTime)  -> we cannot isolate 90' -> leave null,
  //     which sets regulationAmbiguous below and declines to write (the match
  //     is then entered manually). Group-stage matches are always REGULAR, so
  //     they are unaffected.
  const ft = match?.score?.fullTime || {};
  const reg = match?.score?.regularTime || null;
  const pens = match?.score?.penalties || null;
  let home90 = null;
  let away90 = null;
  if (reg && typeof reg.home === "number" && typeof reg.away === "number") {
    home90 = reg.home;
    away90 = reg.away;
  } else if (duration === "REGULAR") {
    home90 = typeof ft.home === "number" ? ft.home : null;
    away90 = typeof ft.away === "number" ? ft.away : null;
  }

  // Presentation-only breakdown (never affects scoring). In football-data v4
  // score.fullTime is the END-OF-EXTRA-TIME cumulative score (penalties live
  // separately in score.penalties), so fullTime IS the ET aggregate when the
  // match went beyond 90'.
  let etHome = null;
  let etAway = null;
  if (duration === "EXTRA_TIME" || duration === "PENALTY_SHOOTOUT") {
    if (typeof ft.home === "number" && typeof ft.away === "number") {
      etHome = ft.home;
      etAway = ft.away;
    }
  }
  let penHome = null;
  let penAway = null;
  if (duration === "PENALTY_SHOOTOUT" && pens) {
    if (typeof pens.home === "number" && typeof pens.away === "number") {
      penHome = pens.home;
      penAway = pens.away;
    }
  }

  let homeCode = ourCode(match?.homeTeam?.tla) || null;
  let awayCode = ourCode(match?.awayTeam?.tla) || null;

  // Orient EVERYTHING to OUR schedule's home/away in one shared step (90' +
  // ET + penalties + codes), so a reversed-fixture feed can never leak a
  // flipped score into any of them.
  ({ home90, away90, homeCode, awayCode, etHome, etAway, penHome, penAway } =
    orientToExpected(
      { home90, away90, homeCode, awayCode, etHome, etAway, penHome, penAway },
      homeTeam,
      awayTeam,
    ));

  // Breakdown sanity (best-effort): ET is cumulative so it must be >= the 90'
  // score on each side; penalties must name a winner. Anything off -> drop the
  // cosmetic field, never the core result.
  if (home90 == null || away90 == null || etHome == null || etAway == null ||
      etHome < home90 || etAway < away90) {
    etHome = null;
    etAway = null;
  }
  if (penHome == null || penAway == null || penHome === penAway) {
    penHome = null;
    penAway = null;
  }

  // FINISHED but no clean 90' score -> can't isolate regulation.
  const regulationAmbiguous = finished && (home90 == null || away90 == null);

  // Advancing team only matters for a knockout level at 90'. tlaWinner returns
  // the overall winner's code, which is orientation-independent.
  const advancingTeam =
    finished && home90 != null && away90 != null && home90 === away90
      ? tlaWinner(match)
      : null;

  return {
    name: NAME,
    error: false,
    finished,
    home90,
    away90,
    homeCode,
    awayCode,
    advancingTeam,
    duration,
    etHome,
    etAway,
    penHome,
    penAway,
    regulationAmbiguous,
  };
}
