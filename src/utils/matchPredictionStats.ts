// Aggregates submitted-form predictions for a single match into the shape
// the Stats "ניחושים למשחק" panel renders: outcome (1/X/2) and per-score
// breakdowns that retain WHICH forms predicted each, so the UI can list the
// voters behind every result/outcome — not just the counts.
//
// Pure and side-effect free so it can be unit-tested directly.

type Prediction = { homeScore?: number | null; awayScore?: number | null };
type Form = { formId?: string; formName?: string; matches?: Record<string, Prediction> };

// A voter carries both the form's id (so the UI can deep-link to that form's
// view) and its display name. Previously this was a bare string[] of names;
// the id was added so "who predicted this?" lists become navigable.
export type Voter = { formId: string; name: string };

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

export function aggregateMatchPredictions(
  forms: Form[],
  matchId: string,
): MatchPredictionStats {
  // Keep the form name alongside each prediction so we can list WHO
  // predicted each result/outcome, not just the counts. Resolve the name
  // fallback once here so downstream lists never contain undefined.
  const entries: { voter: Voter; p: Prediction }[] = [];
  for (const f of forms) {
    const p = f.matches?.[matchId];
    if (p) entries.push({ voter: { formId: f.formId || "", name: f.formName || "טופס ללא שם" }, p });
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
