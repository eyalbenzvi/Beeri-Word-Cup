// Aggregates submitted-form predictions for a single match into the shape
// the Stats "ניחושים למשחק" panel renders: outcome (1/X/2) and per-score
// breakdowns that retain WHICH forms predicted each, so the UI can list the
// voters behind every result/outcome — not just the counts.
//
// For knockout matches, only includes predictions from forms where the bracket-derived
// match is identical to the actual match (same home and away teams). This prevents
// counting a prediction for "TeamA vs TeamB" in a form that actually predicted
// "TeamC vs TeamD" due to different group stage outcomes.
//
// Pure and side-effect free so it can be unit-tested directly.

type Prediction = {
  homeScore?: number | null;
  awayScore?: number | null;
  // For a knockout tie the score alone doesn't say who goes through — the
  // form stores the qualifier (penalty-shootout winner) here.
  advancingTeam?: string | null;
};
type Form = { formId?: string; formName?: string; matches?: Record<string, Prediction> };
export type BracketEntry = { home: string | null; away: string | null };

// A voter carries the form's id (so the UI can deep-link to that form's view)
// and its display name. `advancingTeam` is set only for knockout-tie
// predictions — the team the form picked to go through on penalties — so the
// shared VoterList can show which team advances when the score is level. It's
// null for group matches and for any decisive knockout score (the winner is
// implied by the result, so no annotation is needed).
export type Voter = { formId: string; name: string; advancingTeam?: string | null };

// Check if a match is a knockout match (not group stage)
export function isKnockoutMatch(matchId: string): boolean {
  return !matchId.startsWith("group-");
}

// Check if a form's bracket matches the actual bracket for a knockout match.
// Returns true if it's a group match, or if both home/away teams match.
export function bracketMatchesActual(
  formBracket: BracketEntry | null | undefined,
  actualBracket: BracketEntry | null | undefined,
  matchId: string,
): boolean {
  // Group stage matches don't require bracket validation
  if (!isKnockoutMatch(matchId)) return true;

  // For knockout matches, both the form's bracket and actual bracket must exist
  // and have matching teams
  if (!formBracket || !actualBracket) return false;

  return formBracket.home === actualBracket.home && formBracket.away === actualBracket.away;
}

export type MatchPredictionStats = {
  preds: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  outcomeVoters: { home: Voter[]; draw: Voter[]; away: Voter[] };
  // Every distinct predicted score, sorted by frequency (desc), then by key
  // for a stable order on ties. Not capped — the UI shows them all.
  scores: [string, number][];
  scoreVoters: Record<string, Voter[]>;
  avgGoals: string;
};

// Lightweight crowd-consensus for EVERY match in a single pass over all forms,
// for the "what did everyone predict?" line on the Results cards. Cheaper than
// calling aggregateMatchPredictions per match (which re-scans all forms each
// time) — one O(forms × predictions) sweep builds the whole map.
export type MatchConsensus = {
  preds: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  // Most-predicted exact score (home/away kept separate so the UI can render
  // it RTL-correctly). null when there are no predictions.
  topHome: number | null;
  topAway: number | null;
  topCount: number;
};

export function computeConsensusMap(
  forms: Form[],
  actualBracketTeams?: Record<string, BracketEntry>,
  getFormBracketTeams?: (form: Form) => Record<string, BracketEntry>,
): Record<string, MatchConsensus> {
  const acc: Record<string, { preds: number; homeWin: number; draw: number; awayWin: number; scores: Record<string, number> }> = {};
  for (const f of forms) {
    const formBracket = getFormBracketTeams?.(f) || {};
    const matches = f.matches || {};
    for (const matchId in matches) {
      const p = matches[matchId];
      if (!p || p.homeScore == null || p.awayScore == null) continue;

      // For knockout matches, verify the form's bracket matches the actual bracket
      if (actualBracketTeams) {
        if (!bracketMatchesActual(formBracket[matchId], actualBracketTeams[matchId], matchId)) {
          continue;
        }
      }

      const h = p.homeScore as number;
      const a = p.awayScore as number;
      const m = (acc[matchId] ||= { preds: 0, homeWin: 0, draw: 0, awayWin: 0, scores: {} });
      m.preds++;
      if (h > a) m.homeWin++;
      else if (h === a) m.draw++;
      else m.awayWin++;
      const key = `${h}-${a}`;
      m.scores[key] = (m.scores[key] || 0) + 1;
    }
  }
  const out: Record<string, MatchConsensus> = {};
  for (const matchId in acc) {
    const m = acc[matchId];
    let topKey: string | null = null;
    let topCount = 0;
    for (const key in m.scores) {
      // Tie-break by key for determinism (testable, stable across renders).
      if (m.scores[key] > topCount || (m.scores[key] === topCount && topKey != null && key < topKey)) {
        topCount = m.scores[key];
        topKey = key;
      }
    }
    const [th, ta] = topKey ? topKey.split("-").map(Number) : [null, null];
    out[matchId] = {
      preds: m.preds,
      homeWin: m.homeWin,
      draw: m.draw,
      awayWin: m.awayWin,
      topHome: th,
      topAway: ta,
      topCount,
    };
  }
  return out;
}

// A run of tie-predicting forms that all sent the SAME team through. Used by
// the UI to list knockout-tie voters grouped by their advancing pick.
export type AdvancingGroup = { team: string; voters: Voter[]; count: number };

// Groups a knockout-tie voter list by the team each form advanced, so every
// team's predictors appear consecutively, ordered by crowd size (desc) — the
// app's "most-predicted first" convention — with a stable team-code tie-break
// for deterministic, testable output. Voters without a recorded qualifier
// (a group-stage draw, or an incomplete knockout form) are returned separately
// as `ungrouped` so the caller can still surface them rather than drop them.
export function groupVotersByAdvancing(voters: Voter[]): {
  groups: AdvancingGroup[];
  ungrouped: Voter[];
} {
  const byTeam = new Map<string, Voter[]>();
  const ungrouped: Voter[] = [];
  for (const v of voters) {
    if (v.advancingTeam) {
      const arr = byTeam.get(v.advancingTeam);
      if (arr) arr.push(v);
      else byTeam.set(v.advancingTeam, [v]);
    } else {
      ungrouped.push(v);
    }
  }
  const groups = [...byTeam.entries()]
    .map(([team, vs]) => ({ team, voters: vs, count: vs.length }))
    .sort(
      (a, b) =>
        b.count - a.count || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0),
    );
  return { groups, ungrouped };
}

export function aggregateMatchPredictions(
  forms: Form[],
  matchId: string,
  actualBracketTeams?: Record<string, BracketEntry>,
  getFormBracketTeams?: (form: Form) => Record<string, BracketEntry>,
): MatchPredictionStats {
  // Keep the form name alongside each prediction so we can list WHO
  // predicted each result/outcome, not just the counts. Resolve the name
  // fallback once here so downstream lists never contain undefined.
  const entries: { voter: Voter; p: Prediction }[] = [];
  for (const f of forms) {
    const p = f.matches?.[matchId];
    if (!p) continue;

    // For knockout matches, verify the form's bracket matches the actual bracket
    if (actualBracketTeams) {
      const formBracket = getFormBracketTeams?.(f) || {};
      if (!bracketMatchesActual(formBracket[matchId], actualBracketTeams[matchId], matchId)) {
        continue;
      }
    }

    // Surface the qualifier only for a level KNOCKOUT score — a decisive score
    // needs no annotation, and a group draw never sends anyone through. Gating
    // on the match type (rather than trusting the form to have stripped the
    // field on group matches) keeps this pure module's contract self-enforcing
    // against stale/imported data.
    const isTie =
      isKnockoutMatch(matchId) &&
      p.homeScore != null &&
      p.awayScore != null &&
      p.homeScore === p.awayScore;
    entries.push({
      voter: {
        formId: f.formId || "",
        name: f.formName || "טופס ללא שם",
        advancingTeam: isTie ? p.advancingTeam ?? null : null,
      },
      p,
    });
  }

  const outcomeVoters: { home: Voter[]; draw: Voter[]; away: Voter[] } = {
    home: [],
    draw: [],
    away: [],
  };
  entries.forEach(({ voter, p }) => {
    const h = p.homeScore ?? 0;
    const a = p.awayScore ?? 0;
    if (h > a) outcomeVoters.home.push(voter);
    else if (h === a) outcomeVoters.draw.push(voter);
    else outcomeVoters.away.push(voter);
  });

  // Most common scores — track the voters per score, not just the count.
  const scoreVoters: Record<string, Voter[]> = {};
  entries.forEach(({ voter, p }) => {
    // RTL display: away first so the home digit is read first by Hebrew readers (right side).
    const key = `${p.awayScore}-${p.homeScore}`;
    (scoreVoters[key] ||= []).push(voter);
  });
  // All distinct scores, most-predicted first. Stable tie-break by key so
  // the order is deterministic (and unit-testable).
  const scores = Object.entries(scoreVoters)
    .map(([key, voters]) => [key, voters.length] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const totalGoals = entries.reduce(
    (s, { p }) => s + (p.homeScore ?? 0) + (p.awayScore ?? 0),
    0,
  );
  const avgGoals =
    entries.length > 0 ? (totalGoals / entries.length).toFixed(1) : "0";

  return {
    preds: entries.length,
    homeWin: outcomeVoters.home.length,
    draw: outcomeVoters.draw.length,
    awayWin: outcomeVoters.away.length,
    outcomeVoters,
    scores,
    scoreVoters,
    avgGoals,
  };
}
