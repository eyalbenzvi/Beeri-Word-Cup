// Flattens a single form (or all forms) into the FlatForm shape used by the
// admin query evaluator. Reuses calculateFullScore for all numeric scoring —
// the parity test (flatten.test.ts) guards against drift.

import { calculateFullScore } from "../scoring";
import { getCachedBracket } from "../bracketCache";
import { ALL_MATCHES, R16_MATCHES, QF_MATCHES, SF_MATCHES, R32_MATCHES, FINAL_MATCHES } from "../../data/matches";
import { isSamePlayer } from "../playerSearch";
import type { FlatForm, FlatMatch, StageScore, Stage, TeamCode } from "./types";
import {
  buildScoringContext,
  deriveAdvancingTeams,
  type ScoringContext,
} from "./scoringContext";

export { buildScoringContext };
export type { ScoringContext };

// Stable list of knockout match IDs per stage, sourced from data/matches.ts so
// we cannot drift from the rest of the app.
const STAGE_MATCH_IDS: Record<Exclude<Stage, "groups" | "ALL">, string[]> = {
  R32: R32_MATCHES.map((m) => m.id),
  R16: R16_MATCHES.map((m) => m.id),
  QF: QF_MATCHES.map((m) => m.id),
  SF: SF_MATCHES.map((m) => m.id),
  F: FINAL_MATCHES.filter((m) => m.id === "F-1").map((m) => m.id),
};

function getOutcome(homeScore: number | null, awayScore: number | null) {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return "home" as const;
  if (awayScore > homeScore) return "away" as const;
  return "draw" as const;
}

function pairKey(a: TeamCode | null, b: TeamCode | null): string | null {
  if (!a || !b) return null;
  return [a, b].slice().sort().join("|");
}

function emptyStageScore(): StageScore {
  return { teams: 0, matchupsBySlot: 0, pairings: 0, scores: 0, outcomes: 0 };
}

/** Compute the form's stage rosters from its bracket. Nulls preserved when
 *  upstream matches aren't yet predicted. */
function stageTeams(bracket: Record<string, any>, stage: Stage): (TeamCode | null)[] {
  if (stage === "groups" || stage === "ALL") return [];
  const ids = STAGE_MATCH_IDS[stage] || [];
  const out: (TeamCode | null)[] = [];
  for (const id of ids) {
    const t = bracket[id];
    out.push(t?.home ?? null);
    out.push(t?.away ?? null);
  }
  return out;
}

/** Compute the per-stage scoring components for ONE form against the actual bracket. */
function computeStageScore(
  formBracket: Record<string, any>,
  actualBracket: Record<string, any>,
  fullScore: ReturnType<typeof calculateFullScore>,
  results: Record<string, any>,
  formMatches: Record<string, any>,
  stage: Exclude<Stage, "groups" | "ALL">,
): StageScore {
  const ids = STAGE_MATCH_IDS[stage] || [];
  const score = emptyStageScore();

  // teams: set intersection of unique team codes between form and actual at this stage.
  const formTeams = new Set<string>();
  const actualTeams = new Set<string>();
  for (const id of ids) {
    const fb = formBracket[id];
    const ab = actualBracket[id];
    if (fb?.home) formTeams.add(fb.home);
    if (fb?.away) formTeams.add(fb.away);
    if (ab?.home) actualTeams.add(ab.home);
    if (ab?.away) actualTeams.add(ab.away);
  }
  for (const t of formTeams) if (actualTeams.has(t)) score.teams++;

  // matchupsBySlot: home AND away match per slot.
  // pairings: unordered {home,away} pair appears anywhere in actual at this stage.
  const actualPairs = new Set<string>();
  for (const id of ids) {
    const ab = actualBracket[id];
    const k = pairKey(ab?.home, ab?.away);
    if (k) actualPairs.add(k);
  }
  for (const id of ids) {
    const fb = formBracket[id];
    const ab = actualBracket[id];
    if (fb?.home && fb?.away && ab?.home && ab?.away) {
      if (fb.home === ab.home && fb.away === ab.away) score.matchupsBySlot++;
    }
    const fk = pairKey(fb?.home, fb?.away);
    if (fk && actualPairs.has(fk)) score.pairings++;
  }

  // scores / outcomes from calculateFullScore's per-match breakdown so we
  // never re-derive correctness — single source of truth.
  for (const id of ids) {
    const ms = fullScore.matchScores?.[id];
    if (!ms) continue;
    if (ms.exactPoints > 0) score.scores++;
    if (ms.outcomePoints > 0) score.outcomes++;
  }

  return score;
}

function computeGroupStageScore(
  fullScore: ReturnType<typeof calculateFullScore>,
  results: Record<string, any>,
): StageScore {
  // Group stage has no "teams"/"pairings" notion in the same way; we count
  // exact scores and outcomes, leave the rest at zero.
  const score = emptyStageScore();
  for (const [id, ms] of Object.entries(fullScore.matchScores || {})) {
    if (!id.startsWith("group-")) continue;
    if ((ms as any).exactPoints > 0) score.scores++;
    if ((ms as any).outcomePoints > 0) score.outcomes++;
  }
  return score;
}

/** Flatten a single form. */
export function flattenForm(
  form: any,
  ctx: ScoringContext,
  results: Record<string, any>,
  actualBonuses: any,
  ownerName: string,
): FlatForm {
  const matchesObj = form.matches || {};
  const formBracket = getCachedBracket(matchesObj);

  // Derive advancing from the form's bracket, mirroring useLeaderboardComputed.
  const formAdvancing = deriveAdvancingTeams(formBracket);
  const enrichedForm = {
    ...form,
    advancing: formAdvancing,
  };

  const fullScore = calculateFullScore(
    enrichedForm,
    results,
    ctx.actualAdvancing,
    { ...actualBonuses, champion: ctx.actualChampion },
    formBracket,
    ctx.actualBracket,
  );

  const matches: Record<string, FlatMatch> = {};
  const actualHasResults = Object.keys(results).length > 0;
  const championKnown = !!ctx.actualChampion;
  const topScorerKnown =
    Array.isArray(actualBonuses?.topScorers) && actualBonuses.topScorers.length > 0;

  for (const m of ALL_MATCHES) {
    const id = m.id;
    const pred = matchesObj[id];
    const actual = results[id];
    const ms = fullScore.matchScores?.[id];

    // For knockout matches, "home/away" comes from the form's bracket so it
    // reflects who the form *thought* was playing. For group matches, it
    // comes from the static schedule.
    const teams = formBracket[id] || null;
    let home: TeamCode | null = null;
    let away: TeamCode | null = null;
    if (id.startsWith("group-")) {
      home = (m as any).home ?? null;
      away = (m as any).away ?? null;
    } else {
      home = teams?.home ?? null;
      away = teams?.away ?? null;
    }

    const flat: FlatMatch = {
      home,
      away,
      homeScore: pred?.homeScore ?? null,
      awayScore: pred?.awayScore ?? null,
      advancingTeam: pred?.advancingTeam ?? null,
      outcome: pred ? getOutcome(pred.homeScore, pred.awayScore) : null,
      correctScore:
        actual && actual.homeScore != null
          ? !!ms && ms.exactPoints > 0
          : null,
      correctOutcome:
        actual && actual.homeScore != null
          ? !!ms && ms.outcomePoints > 0
          : null,
      wrongMatchup:
        actual && actual.homeScore != null && !id.startsWith("group-")
          ? !!ms && !!ms.wrongMatchup
          : null,
    };
    matches[id] = flat;
  }

  const formCorrectChampion = championKnown ? !!fullScore.correctChampion : null;
  let formCorrectTopScorer: boolean | null = null;
  if (topScorerKnown) {
    formCorrectTopScorer = !!fullScore.correctTopScorer;
  }

  return {
    formId: form.formId,
    formName: form.formName || "טופס ללא שם",
    ownerName,
    status: form.status,
    champion: form.champion ?? null,
    topScorer: form.topScorer ?? null,
    correctChampion: formCorrectChampion,
    correctTopScorer: formCorrectTopScorer,
    r32Teams: stageTeams(formBracket, "R32"),
    r16Teams: stageTeams(formBracket, "R16"),
    qfTeams: stageTeams(formBracket, "QF"),
    sfTeams: stageTeams(formBracket, "SF"),
    finalTeams: stageTeams(formBracket, "F"),
    stageScore: {
      groups: computeGroupStageScore(fullScore, results),
      R32: computeStageScore(formBracket, ctx.actualBracket, fullScore, results, matchesObj, "R32"),
      R16: computeStageScore(formBracket, ctx.actualBracket, fullScore, results, matchesObj, "R16"),
      QF: computeStageScore(formBracket, ctx.actualBracket, fullScore, results, matchesObj, "QF"),
      SF: computeStageScore(formBracket, ctx.actualBracket, fullScore, results, matchesObj, "SF"),
      F: computeStageScore(formBracket, ctx.actualBracket, fullScore, results, matchesObj, "F"),
    },
    matches,
    totalPoints: fullScore.totalPoints,
  };
}

/** Flatten every form in `allPredictions`. Drafts are kept; the evaluator
 *  excludes them by default unless `scope.includeDrafts` is set. */
export function flattenAll(
  allPredictions: Record<string, any>,
  userDirectory: Record<string, any>,
  results: Record<string, any>,
  actualBonuses: any,
): FlatForm[] {
  const ctx = buildScoringContext(results, actualBonuses);
  const out: FlatForm[] = [];
  for (const [formId, form] of Object.entries(allPredictions)) {
    const f: any = form;
    const ownerName =
      userDirectory[f.userId]?.displayName || f.userId || "ללא משתמש";
    out.push(flattenForm({ ...f, formId }, ctx, results, actualBonuses, ownerName));
  }
  return out;
}
