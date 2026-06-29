// ESPN result client for auto-fill (PRIMARY source; football-data is the
// fallback — see auto-fill-match-result.js).
//
// Contract (identical to footballData.js / apiSports.js so consensus.js treats
// every source the same):
//   fetchMatchResult({ fifaMatch, homeTeam, awayTeam, kickoffIso })
//     -> { name, error, finished, home90, away90, homeCode, awayCode,
//          advancingTeam, duration, regulationAmbiguous }
//     or { name, error:true, reason }
//
// We record the END-OF-90-MINUTES score only. ESPN's competitor.score is the
// FINAL score and, for a knockout decided in extra time, INCLUDES ET goals. So:
//   - regular-time finish  -> the final score IS the 90' score;
//   - extra time / pens    -> reconstruct 90' from the per-period linescores
//                             (1st half + 2nd half). If those aren't available
//                             we set regulationAmbiguous (decline to write; the
//                             match is then entered manually) — NEVER an
//                             ET-inclusive score recorded as the 90' result.
// Group matches are always regular time, so they're unaffected.
//
// Team identity: ESPN exposes names/abbreviations, not FIFA codes. Like the
// other sources we identify the fixture by its two teams (orientation-
// independent), so simultaneous final-matchday kickoffs can't be confused.

import { getJson, dayWindow } from "./http.js";
import { espnTeamCode } from "./espnTeams.js";
import { espnIsFinished, espnDuration, espnGoals } from "./espnStatus.js";
import { orientToExpected } from "./orient.js";

// Goals scored in a specific ESPN period (1/2 halves, 3/4 ET halves, 5 pens)
// from a competitor's linescores. Used to recover the penalty tally when ESPN
// doesn't expose competitor.shootoutScore. Returns null if absent.
function periodGoals(linescores, period) {
  if (!Array.isArray(linescores)) return null;
  for (const e of linescores) {
    if (e && typeof e === "object" && Number.isInteger(e.period) && e.period === period) {
      return espnGoals(e);
    }
  }
  return null;
}

const NAME = "espn";
const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LEAGUE = process.env.ESPN_SOCCER_LEAGUE || "fifa.world";

function norm(s) {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
}

// First-half + second-half goals from competitor.linescores, to reconstruct the
// 90' score for an extra-time/penalty match. Returns null (-> regulationAmbiguous)
// rather than guess when the layout isn't the trusted one: we require at least
// two entries, and — when ESPN labels periods — that the first two ARE periods
// 1 and 2 (so a prepended aggregate/other row can never be summed as "90'").
function regulationGoals(linescores) {
  if (!Array.isArray(linescores) || linescores.length < 2) return null;
  const periodOf = (e) =>
    e && typeof e === "object" && Number.isInteger(e.period) ? e.period : null;
  const p0 = periodOf(linescores[0]);
  const p1 = periodOf(linescores[1]);
  if ((p0 != null && p0 !== 1) || (p1 != null && p1 !== 2)) return null;
  const a = espnGoals(linescores[0]);
  const b = espnGoals(linescores[1]);
  return a == null || b == null ? null : a + b;
}

function findEvent(events, homeTeam, awayTeam) {
  const want = new Set([norm(homeTeam), norm(awayTeam)]);
  for (const ev of Array.isArray(events) ? events : []) {
    const comp = ev?.competitions?.[0];
    const cs = comp?.competitors;
    if (!Array.isArray(cs) || cs.length < 2) continue;
    const home = cs.find((c) => c?.homeAway === "home") || cs[0];
    const away = cs.find((c) => c?.homeAway === "away") || cs[1];
    const h = espnTeamCode(home?.team);
    const a = espnTeamCode(away?.team);
    if (h && a && h !== a && want.has(h) && want.has(a)) {
      return { comp, home, away, homeCode: h, awayCode: a };
    }
  }
  return null;
}

export async function fetchMatchResult({ homeTeam, awayTeam, kickoffIso }) {
  const t = Date.parse(kickoffIso);
  if (!Number.isFinite(t)) {
    return { name: NAME, error: true, reason: "bad kickoffIso" };
  }
  const { from, to } = dayWindow(t);
  const dates = `${from.replace(/-/g, "")}-${to.replace(/-/g, "")}`;
  const url = `${BASE}/${encodeURIComponent(LEAGUE)}/scoreboard?dates=${dates}&limit=200`;

  // One request + a single retry on transient failure, mirroring the other
  // sources; then give up (the caller falls back to football-data).
  let data;
  try {
    data = await getJson(url);
  } catch {
    try {
      data = await getJson(url);
    } catch (err2) {
      return { name: NAME, error: true, reason: err2?.message || String(err2) };
    }
  }

  const found = findEvent(data?.events, homeTeam, awayTeam);
  if (!found) {
    // Not in ESPN's feed. At 1h55m+ past kickoff this means a coverage gap
    // (wrong slug / window miss), NOT "still live" — flag notFound so the
    // handler falls back to football-data rather than retrying ESPN forever.
    return { name: NAME, error: false, finished: false, notFound: true, reason: "fixture not found" };
  }

  const { comp, home, away } = found;
  // Codes already resolved by findEvent (don't re-run espnTeamCode).
  let homeCode = found.homeCode;
  let awayCode = found.awayCode;
  const status = comp.status || {};
  const finished = espnIsFinished(status);
  const duration = espnDuration(status);

  // 90' score: regular time -> final score; ET/pens -> reconstruct from the
  // first two periods' linescores, else ambiguous.
  let home90;
  let away90;
  if (duration === "REGULAR") {
    home90 = espnGoals(home.score);
    away90 = espnGoals(away.score);
  } else {
    home90 = regulationGoals(home.linescores);
    away90 = regulationGoals(away.linescores);
  }

  // Presentation-only breakdown (never affects scoring). ESPN's
  // competitor.score is the post-ET final (penalties excluded); the shootout
  // tally is competitor.shootoutScore, or period 5 of the linescores.
  let etHome = null;
  let etAway = null;
  if (duration !== "REGULAR") {
    etHome = espnGoals(home.score);
    etAway = espnGoals(away.score);
  }
  let penHome = null;
  let penAway = null;
  if (duration === "PENALTY_SHOOTOUT") {
    penHome = espnGoals(home.shootoutScore);
    penAway = espnGoals(away.shootoutScore);
    if (penHome == null || penAway == null) {
      penHome = periodGoals(home.linescores, 5);
      penAway = periodGoals(away.linescores, 5);
    }
  }

  // Orient EVERYTHING to OUR schedule's home/away in one shared step. We
  // matched by team identity, so the codes are reliable; if ESPN lists the
  // pair reversed, the helper swaps score + ET + penalties + codes + winner
  // flags together so downstream consensus compares like-for-like.
  let homeWinner = home.winner === true;
  let awayWinner = away.winner === true;
  ({ home90, away90, homeCode, awayCode, etHome, etAway, penHome, penAway, homeWinner, awayWinner } =
    orientToExpected(
      { home90, away90, homeCode, awayCode, etHome, etAway, penHome, penAway, homeWinner, awayWinner },
      homeTeam,
      awayTeam,
    ));

  // Breakdown sanity (best-effort): ET is cumulative (>= 90' each side);
  // penalties must name a winner. Off -> drop the cosmetic field, keep core.
  if (home90 == null || away90 == null || etHome == null || etAway == null ||
      etHome < home90 || etAway < away90) {
    etHome = null;
    etAway = null;
  }
  if (penHome == null || penAway == null || penHome === penAway) {
    penHome = null;
    penAway = null;
  }

  // Invariant: a match only goes to extra time / penalties if it was LEVEL at
  // 90'. If the linescores reconstruction yields a non-draw for an ET/pens
  // match, the per-half split is wrong — decline (regulationAmbiguous) rather
  // than record a bogus decisive 90' score. Falls back to football-data.
  let regulationAmbiguous = finished && (home90 == null || away90 == null);
  if (finished && duration !== "REGULAR" && home90 != null && away90 != null && home90 !== away90) {
    regulationAmbiguous = true;
    home90 = null;
    away90 = null;
  }

  // Advancing team only matters for a knockout tie at 90'. competitor.winner
  // reflects the overall winner (incl. penalties), which is what advances.
  let advancingTeam = null;
  if (finished && home90 != null && away90 != null && home90 === away90) {
    if (homeWinner) advancingTeam = homeCode;
    else if (awayWinner) advancingTeam = awayCode;
  }

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
