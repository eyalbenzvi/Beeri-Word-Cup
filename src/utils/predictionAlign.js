// Helpers for reconciling a user's stored prediction with the actual home/away
// assignment of a knockout match. The bracket slot can seat the same two teams
// in swapped roles vs the user's internal model, in which case the displayed
// score must be mirrored so the "home – away" pair corresponds to the actual
// home/away shown to the reader.

/**
 * Order-agnostic comparison between two {home, away} entries.
 * Both must carry non-null home and away codes.
 */
export function teamsMatch(a, b) {
  if (!a || !b) return false;
  if (!a.home || !a.away || !b.home || !b.away) return false;
  const setA = new Set([a.home, a.away]);
  return setA.has(b.home) && setA.has(b.away);
}

/**
 * Return the home/away teams to render for a given match:
 *   - group stage: use the fixed match.homeTeam / match.awayTeam
 *   - knockout:    use the bracket slot derived from actual results; may be
 *                  {home: null, away: null} until the feeding matches finish.
 */
export function resolveMatchTeams(match, actualBracket) {
  if (!match) return { home: null, away: null };
  if (match.stage === "group") {
    return { home: match.homeTeam || null, away: match.awayTeam || null };
  }
  const entry = actualBracket?.[match.id];
  return { home: entry?.home || null, away: entry?.away || null };
}

/**
 * Align a user's prediction to the actual match's home/away assignment.
 * In knockout, the bracket slot may seat the same two teams in swapped roles
 * relative to the user's model. When that happens we mirror the scores so the
 * rendered "home – away" pair corresponds to the actual home/away teams.
 *
 * Input:
 *   pred        — user's prediction {homeScore, awayScore, advancingTeam?}
 *   formEntry   — user's bracket slot {home, away} for this match
 *   actualTeams — real bracket slot {home, away}
 *
 * If formEntry is missing or actualTeams is incomplete, the prediction is
 * returned unchanged. advancingTeam is a team code (not role-based) so it is
 * never swapped.
 */
export function alignPredictionToActual(pred, formEntry, actualTeams) {
  const adv = pred?.advancingTeam || null;
  if (!pred) return { homeScore: null, awayScore: null, advancingTeam: adv };
  const home = pred.homeScore;
  const away = pred.awayScore;
  if (!formEntry || !actualTeams || !actualTeams.home || !actualTeams.away) {
    return { homeScore: home, awayScore: away, advancingTeam: adv };
  }
  if (formEntry.home && actualTeams.home === formEntry.away) {
    return { homeScore: away, awayScore: home, advancingTeam: adv };
  }
  return { homeScore: home, awayScore: away, advancingTeam: adv };
}
