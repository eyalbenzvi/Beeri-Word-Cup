// Aggregates submitted-form predictions for a single match into the shape
// the Stats "ניחושים למשחק" panel renders: outcome (1/X/2) and per-score
// breakdowns that retain WHICH forms predicted each, so the UI can list the
// voters behind every result/outcome — not just the counts.
//
// Pure and side-effect free so it can be unit-tested directly.

type Prediction = { homeScore?: number | null; awayScore?: number | null };
type Form = { formName?: string; matches?: Record<string, Prediction> };

export type MatchPredictionStats = {
  preds: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  outcomeVoters: { home: string[]; draw: string[]; away: string[] };
  // Every distinct predicted score, sorted by frequency (desc), then by key
  // for a stable order on ties. Not capped — the UI shows them all.
  scores: [string, number][];
  scoreVoters: Record<string, string[]>;
  avgGoals: string;
};

export function aggregateMatchPredictions(
  forms: Form[],
  matchId: string,
): MatchPredictionStats {
  // Keep the form name alongside each prediction so we can list WHO
  // predicted each result/outcome, not just the counts. Resolve the name
  // fallback once here so downstream lists never contain undefined.
  const entries: { name: string; p: Prediction }[] = [];
  for (const f of forms) {
    const p = f.matches?.[matchId];
    if (p) entries.push({ name: f.formName || "טופס ללא שם", p });
  }

  const outcomeVoters: { home: string[]; draw: string[]; away: string[] } = {
    home: [],
    draw: [],
    away: [],
  };
  entries.forEach(({ name, p }) => {
    const h = p.homeScore ?? 0;
    const a = p.awayScore ?? 0;
    if (h > a) outcomeVoters.home.push(name);
    else if (h === a) outcomeVoters.draw.push(name);
    else outcomeVoters.away.push(name);
  });

  // Most common scores — track the voters per score, not just the count.
  const scoreVoters: Record<string, string[]> = {};
  entries.forEach(({ name, p }) => {
    // RTL display: away first so the home digit is read first by Hebrew readers (right side).
    const key = `${p.awayScore}-${p.homeScore}`;
    (scoreVoters[key] ||= []).push(name);
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
