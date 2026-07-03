/**
 * Best-case scenario computation for a single prediction form.
 *
 * Pure functions — no React, no side effects, safe for Web Workers.
 *
 * Design principle: ALL scoring/standings/bracket logic is delegated to
 * the existing utilities (scoring.ts, bracket.ts). This file contains
 * search/optimization only — never reimplements outcome/exact-score/
 * advancing/champion arithmetic. Every score that drives a decision is
 * produced by `calculateFullScore`, exactly the same call path the
 * leaderboard uses.
 */

import {
  calculateFullScore,
  compareTiebreaker,
  getOutcome,
  POINTS,
  BONUSES,
} from "./scoring";
import {
  calcBracketTeams,
  deriveAdvancingTeams,
  deriveActualAdvancing,
  deriveChampion,
} from "./bracket";
import { groupMatches, knockoutMatches } from "../data/matches";
import { GROUPS } from "../data/teams";
import { isScoreValid } from "./helpers";

// ─── Public types ─────────────────────────────────────────────────

export type BestCaseResult = {
  projectedRank: number;
  projectedScore: number;
  totalForms: number;
  bestResults: Record<string, any>;
};

export type ProgressCallback = (phase: string, percent: number) => void;

// ─── Worker-payload sanitization ──────────────────────────────────
// The optimizer runs in a Web Worker, so its inputs (`allForms`,
// `playedResults`) must survive `postMessage`'s structured clone. Those maps
// come STRAIGHT off the Firestore-backed store (`docSnap.data()`).
//
// NOTE on intent — this is DEFENSE-IN-DEPTH + input parity, NOT a confirmed
// diagnosis. The current data model is entirely JSON-safe (timestamps are
// stored as ISO strings; no Firestore Timestamp/GeoPoint/DocumentReference is
// persisted on form/result docs), so a `DataCloneError` on this payload is not
// something we have observed. What sanitization DOES buy us:
//   1. Parity — the worker and the main-thread fallback score byte-identical
//      inputs (no prototype-stripping / field-ordering differences between the
//      two paths).
//   2. Future-proofing — if a legacy or future field ever carries a
//      non-cloneable value (a function/proxy), it is dropped here instead of
//      throwing on postMessage.
// The far likelier cause of the reported every-run failure is the worker chunk
// itself failing to load in production; that is handled by the fallback +
// `bestcase-worker-fallback` Sentry signal in useBestCase, not here.
//
// The projection keeps ONLY the fields the compute graph reads — per match
// `homeScore` / `awayScore` / `advancingTeam` / `stage`, per form `status` +
// `matches`. `null`/`undefined`/non-object entries are preserved as harmless
// empties so the search's `!playedResults[id]` and `isScoreValid` checks behave
// exactly as before.
//
// Every field carried here is verified against the readers: bracket.ts /
// scoring.ts / deriveChampion read nothing else off a match, and buildFormPreds
// re-derives `advancing`/`champion` from `matches` (so a form's persisted copies
// are intentionally dropped — they're recomputed anyway).

// Numeric-ish scores are copied verbatim (number | string | null | undefined) —
// the compute graph coerces them itself (isScoreValid, Number(...)), and
// preserving the original type keeps sanitized data behaviourally identical to
// the raw store data the main thread used to consume directly.
function sanitizeMatchEntry(m: any): Record<string, any> {
  if (!m || typeof m !== "object") return {};
  const out: Record<string, any> = {
    homeScore: m.homeScore ?? null,
    awayScore: m.awayScore ?? null,
  };
  if (m.advancingTeam != null) out.advancingTeam = m.advancingTeam;
  if (m.stage != null) out.stage = m.stage;
  return out;
}

function sanitizeMatchMap(matches: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (matches && typeof matches === "object") {
    for (const [id, m] of Object.entries(matches)) {
      out[id] = sanitizeMatchEntry(m);
    }
  }
  return out;
}

// Project the store's forms map to the minimal, structured-cloneable shape the
// optimizer needs. Preserves the SET of form ids (so ranking/relevant-form
// filtering is unchanged) and each form's `status` + sanitized `matches`.
export function sanitizeFormsForWorker(
  allForms: Record<string, any> | null | undefined,
): Record<string, any> {
  const out: Record<string, any> = {};
  if (allForms && typeof allForms === "object") {
    for (const [formId, form] of Object.entries(allForms)) {
      const f = (form as any) || {};
      out[formId] = {
        status: typeof f.status === "string" ? f.status : undefined,
        matches: sanitizeMatchMap(f.matches),
      };
    }
  }
  return out;
}

// Project the store's played-results map to the minimal, cloneable shape.
export function sanitizeResultsForWorker(
  playedResults: Record<string, any> | null | undefined,
): Record<string, any> {
  const out: Record<string, any> = {};
  if (playedResults && typeof playedResults === "object") {
    for (const [id, r] of Object.entries(playedResults)) {
      // Preserve falsy/non-object entries AS-IS (null/undefined). computeBestCase
      // keys "is this match still open?" off `!playedResults[id]`, so a null
      // placeholder row must stay falsy — replacing it with `{}` would flip the
      // match from "remaining" to "played" and change the search.
      out[id] = r && typeof r === "object" ? sanitizeMatchEntry(r) : (r ?? null);
    }
  }
  return out;
}

// ─── Best-case → simulator override conversion ────────────────────
// The optimizer's `bestResults` is a full results map (already-played matches
// + synthesised results for every remaining match). The shared SimulatorPanel
// keeps its hypothetical edits as an `override` map that is merged OVER the
// real results — so to seed it we only need the REMAINING (not-yet-really-
// played) matches; the played ones are the simulator's fixed base already.
//
// We shape each entry exactly like SimulatorPanel.handleSaveResult produces
// (homeTeam/awayTeam/stage/group/played, plus advancingTeam for KO draws) so a
// seeded simulator is indistinguishable from one the user filled by hand. Team
// codes are cosmetic (the panel re-derives display teams from the live
// bracket), but we populate them for shape-parity. Knockout teams come from the
// best-case bracket; group teams from the fixed fixtures.

const GROUP_FIXTURE: Record<string, { home: string; away: string; group: string }> =
  Object.fromEntries(
    groupMatches.map((m) => [m.id, { home: m.homeTeam, away: m.awayTeam, group: m.group }]),
  );

export function bestResultsToSimulatorOverrides(
  bestResults: Record<string, any>,
  playedResults: Record<string, any> | null | undefined,
): Record<string, any> {
  const played = playedResults || {};
  // Knockout matchups resolve from the full best-case scenario.
  const koBracket = calcBracketTeams(bestResults);
  const overrides: Record<string, any> = {};

  for (const [matchId, r] of Object.entries(bestResults)) {
    // Already-played matches are the simulator's fixed base — never an override.
    if (isScoreValid(played[matchId])) continue;
    if (!isScoreValid(r)) continue;

    const stage = STAGE_BY_ID[matchId] || "group";
    const isKO = stage !== "group";
    const teams = isKO
      ? koBracket[matchId] || { home: null, away: null }
      : GROUP_FIXTURE[matchId] || { home: null, away: null };

    const entry: Record<string, any> = {
      homeTeam: teams.home ?? null,
      awayTeam: teams.away ?? null,
      homeScore: Number((r as any).homeScore),
      awayScore: Number((r as any).awayScore),
      stage,
      group: isKO ? null : GROUP_FIXTURE[matchId]?.group ?? null,
      played: true,
    };
    // Carry the tie-break winner for knockout draws so the simulator doesn't
    // flag the match as "needs an advancing team".
    if (isKO && entry.homeScore === entry.awayScore && (r as any).advancingTeam) {
      entry.advancingTeam = (r as any).advancingTeam;
      entry.needsAdvancingTeam = false;
    }
    overrides[matchId] = entry;
  }

  return overrides;
}

// ─── Availability gate ────────────────────────────────────────────
// The optimizer is only offered once the group stage is fully played:
// all 32 R32 qualifiers (winners, runners-up, best thirds) are determined
// only when ALL 12 groups are complete — best-third qualification compares
// across groups, so partial completion is not enough. Before that point the
// search space (72 group matches × refine) is also prohibitively large
// (minutes of worker time with a real form population).

export function isBestCaseAvailable(
  playedResults: Record<string, any> | null | undefined,
): boolean {
  return groupMatches.every((m) => isScoreValid(playedResults?.[m.id]));
}

// ─── Per-form precomputed predictions (stable across all trials) ──
// Computing each form's bracket / advancing / champion is the heaviest
// derivation in the inner loop. They depend ONLY on the form's own
// match predictions, so we compute once per form per top-level call
// and reuse for every trial result-set we evaluate.

type FormPreds = {
  bracket: Record<string, any>;
  advancing: Record<string, string[]>;
  champion: string | null;
};

function buildFormPreds(form: any): FormPreds {
  const matches = form?.matches || {};
  const bracket = calcBracketTeams(matches);
  return {
    bracket,
    advancing: deriveAdvancingTeams(bracket),
    champion: deriveChampion(matches, bracket),
  };
}

// ─── Score forms against a trial result-set ───────────────────────
// Single source of truth for scoring. Every comparison in the optimizer
// goes through this function → `calculateFullScore`. Top-scorer bonus is
// intentionally excluded from the projection (passed as []).

const STAGE_BY_ID: Record<string, string> = Object.fromEntries([
  ...groupMatches.map((m) => [m.id, "group"]),
  ...knockoutMatches.map((m) => [m.id, m.stage]),
]);

function withStage(trialResults: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [mid, r] of Object.entries(trialResults)) {
    out[mid] = (r as any)?.stage ? r : { ...(r as any), stage: STAGE_BY_ID[mid] || "group" };
  }
  return out;
}

function scoreForms(
  forms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  rawTrialResults: Record<string, any>,
): Record<string, any> {
  const trialResults = withStage(rawTrialResults);
  const actualBracket = calcBracketTeams(trialResults);
  const actualAdvancing = deriveActualAdvancing(actualBracket, trialResults);
  const actualChampion = deriveChampion(trialResults, actualBracket);
  const bonuses = { champion: actualChampion, topScorers: [] as string[] };

  const scores: Record<string, any> = {};
  for (const [formId, formData] of Object.entries(forms)) {
    const preds = formPreds[formId];
    if (!preds) continue;
    const enriched = {
      ...(formData as any),
      advancing: preds.advancing,
      champion: preds.champion,
    };
    scores[formId] = calculateFullScore(
      enriched,
      trialResults,
      actualAdvancing,
      bonuses,
      preds.bracket,
      actualBracket,
    );
  }
  return scores;
}

// How many of the given formIds rank strictly above targetId.
// Mirrors useLeaderboardComputed.rankedLeaderboard exactly:
// dense ranking on (totalPoints, compareTiebreaker). Forms tied on both
// share a rank — they are NOT counted as "above". `formId.localeCompare`
// is only a sort key inside a tied bucket; it does not break the rank.
function countAbove(
  targetId: string,
  formIds: string[],
  scores: Record<string, any>,
): number {
  const t = scores[targetId];
  if (!t) return formIds.length;
  let n = 0;
  for (const id of formIds) {
    if (id === targetId) continue;
    const s = scores[id];
    if (!s) continue;
    if (s.totalPoints > t.totalPoints) {
      n++;
    } else if (s.totalPoints === t.totalPoints) {
      if (compareTiebreaker(s, t) < 0) n++;
    }
  }
  return n;
}

// ─── Relevant-forms filter ────────────────────────────────────────
// Upper bound on how many points a form can still earn in remaining matches.
// Loose overestimate — used only for pruning, so false positives are fine.

function getStagePoints(stage: string): typeof POINTS.group {
  return (POINTS as Record<string, typeof POINTS.group>)[stage] ?? POINTS.group;
}

function maxRemainingPts(
  formData: any,
  remGroup: any[],
  remKO: any[],
): number {
  let max = 0;
  const m = formData?.matches || {};

  for (const gm of remGroup) {
    if (isScoreValid(m[gm.id]))
      max += POINTS.group.outcome + POINTS.group.exactScore;
  }
  // Upper bound on R32-advancing pts from remaining groups. In the 48-team
  // format up to 3 teams per group can advance to R32 (top-2 always + best
  // third-place teams cover 8 of 12). Per group the form's R32 prediction
  // may newly match up to 3 of those, so 3 × 2 pts is the safe bound.
  const groupsRem = new Set(remGroup.map((gm: any) => gm.group));
  max += groupsRem.size * 3 * POINTS.group.advancing;

  for (const km of remKO) {
    if (!isScoreValid(m[km.id])) continue;
    const p = getStagePoints(km.stage);
    max += p.outcome + p.exactScore + p.advancing;
  }
  // Champion bonus only possible if the Final hasn't been played yet.
  if (remKO.some((km: any) => km.stage === "F")) {
    max += BONUSES.champion;
  }
  return max;
}

function identifyRelevant(
  targetId: string,
  forms: Record<string, any>,
  baseScores: Record<string, any>,
  remGroup: any[],
  remKO: any[],
): string[] {
  const tBase = baseScores[targetId]?.totalPoints ?? 0;
  const tMax = tBase + maxRemainingPts(forms[targetId], remGroup, remKO);

  return Object.keys(forms).filter((id) => {
    if (id === targetId) return false;
    const cur = baseScores[id]?.totalPoints ?? 0;
    const maxG = maxRemainingPts(forms[id], remGroup, remKO);
    if (cur > tBase) return tMax >= cur;   // reachable above
    return cur + maxG >= tBase;            // threat below
  });
}

// ─── Candidate match results ──────────────────────────────────────
// Collects all distinct (homeScore, awayScore) pairs predicted by any form,
// plus one fallback per outcome type to ensure coverage. Per-outcome
// fallbacks make the search exhaustive over outcomes (H/D/A) even when
// no form predicted that outcome.

const OUTCOME_DEFAULTS: [number, number][] = [
  [1, 0], // home win
  [0, 0], // draw
  [0, 1], // away win
];

// Per-outcome DENY candidate: the lowest scoreline with the given outcome
// that NO tracked form predicted. Every candidate collected from the forms
// is somebody's exact prediction (and the 1-0/0-0/0-1 fallbacks are the most
// commonly predicted scorelines), so whichever the optimizer picks, it gifts
// the exact-score bonus to every rival who predicted it. When the target
// can't score on a match anyway (no prediction, or a different knockout
// matchup), the best result is often an outcome NOBODY predicted — this
// gives the search that option while still steering outcome/advancement.
function addDenyCandidate(
  seen: Set<string>,
  list: Array<{ homeScore: number; awayScore: number }>,
  outcome: "home" | "draw" | "away",
): void {
  if (outcome === "draw") {
    for (let d = 0; d <= 12; d++) {
      const k = `${d}:${d}`;
      if (!seen.has(k)) {
        seen.add(k);
        list.push({ homeScore: d, awayScore: d });
        return;
      }
    }
    return;
  }
  // Probe realistic scorelines first (1-0, 2-0, 2-1, 3-0, …).
  for (let hi = 1; hi <= 12; hi++) {
    for (let lo = 0; lo < hi; lo++) {
      const [h, a] = outcome === "home" ? [hi, lo] : [lo, hi];
      const k = `${h}:${a}`;
      if (!seen.has(k)) {
        seen.add(k);
        list.push({ homeScore: h, awayScore: a });
        return;
      }
    }
  }
}

function getCandidates(
  matchId: string,
  forms: Record<string, any>,
  includeDeny = false,
): Array<{ homeScore: number; awayScore: number }> {
  const seen = new Set<string>();
  const list: Array<{ homeScore: number; awayScore: number }> = [];

  for (const fd of Object.values(forms)) {
    const p = (fd as any).matches?.[matchId];
    if (!isScoreValid(p)) continue;
    const k = `${p.homeScore}:${p.awayScore}`;
    if (!seen.has(k)) {
      seen.add(k);
      list.push({ homeScore: +p.homeScore, awayScore: +p.awayScore });
    }
  }
  for (const [dh, da] of OUTCOME_DEFAULTS) {
    const k = `${dh}:${da}`;
    if (!seen.has(k)) {
      seen.add(k);
      list.push({ homeScore: dh, awayScore: da });
    }
  }
  // Deny candidates are reserved for the refinement pass (refineKnockout):
  // there every trial is a COMPLETE scenario scored against the full
  // population, so a denial is accepted only when it genuinely improves the
  // target's rank. The round-by-round greedy, by contrast, evaluates each
  // match with all later rounds still empty — there a denial that suppresses
  // a rival looks locally great while silently wrecking the target's own
  // downstream advancing/champion chain (observed: a 2→51 rank collapse in a
  // synthetic 60-form world when denials were offered to the greedy).
  if (includeDeny) {
    addDenyCandidate(seen, list, "home");
    addDenyCandidate(seen, list, "draw");
    addDenyCandidate(seen, list, "away");
  }
  return list;
}

// For knockout draws, expand into two candidates — one with each team
// advancing on penalties — so the optimizer evaluates both choices
// instead of an arbitrary bias. Non-draw candidates are returned as-is.
function expandKnockoutCandidates(
  base: Array<{ homeScore: number; awayScore: number }>,
  actualTeams: { home: string; away: string },
): any[] {
  const expanded: any[] = [];
  for (const c of base) {
    if (c.homeScore !== c.awayScore) {
      expanded.push(c);
    } else {
      expanded.push({ ...c, advancingTeam: actualTeams.home });
      expanded.push({ ...c, advancingTeam: actualTeams.away });
    }
  }
  return expanded;
}

// ─── Group-stage enumeration ──────────────────────────────────────
// Enumerate all 3^k outcome combinations for a group's remaining matches.
// For each combo, build the full trial result-set, score every tracked
// form via calculateFullScore, and keep the combo that minimises rank.

type GroupCombo = Record<string, { homeScore: number; awayScore: number }>;

// Outcomes for a base-3 enumeration index → name used by `getOutcome`.
const OUTCOME_NAMES: ReadonlyArray<"home" | "draw" | "away"> = [
  "home",
  "draw",
  "away",
];

function enumerateGroupCombos(
  remainingMatches: any[],
  targetForm: any,
): GroupCombo[] {
  const k = remainingMatches.length;
  const combos: GroupCombo[] = [];

  for (let mask = 0; mask < 3 ** k; mask++) {
    const combo: GroupCombo = {};
    let tmp = mask;
    for (const m of remainingMatches) {
      const outcomeIdx = tmp % 3;
      tmp = Math.floor(tmp / 3);
      // If the target form's score-prediction has the same outcome we're
      // enumerating, prefer the form's exact score (so target earns the
      // exactScore bonus too). Otherwise fall back to a canonical
      // representative score for that outcome.
      const pred = targetForm?.matches?.[m.id];
      let ch: [number, number] = OUTCOME_DEFAULTS[outcomeIdx];
      if (isScoreValid(pred)) {
        const predOutcome = getOutcome(+pred.homeScore, +pred.awayScore);
        if (predOutcome === OUTCOME_NAMES[outcomeIdx]) {
          ch = [+pred.homeScore, +pred.awayScore];
        }
      }
      combo[m.id] = { homeScore: ch[0], awayScore: ch[1] };
    }
    combos.push(combo);
  }
  return combos;
}

function bestGroupCombo(
  groupRem: any[],
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  workingResults: Record<string, any>,
): GroupCombo {
  const combos = enumerateGroupCombos(groupRem, trackedForms[targetId]);
  let bestAbove = Infinity;
  let bestScore = -Infinity;
  let bestCombo: GroupCombo = combos[0] ?? {};

  for (const combo of combos) {
    const trial = { ...workingResults, ...combo };
    const scores = scoreForms(trackedForms, formPreds, trial);
    const above = countAbove(targetId, trackedIds, scores);
    const score = scores[targetId]?.totalPoints ?? 0;
    // Lexicographic objective: minimize (above, -targetScore). Many trials
    // tie on `above` (especially when few results are locked), so without
    // the score tiebreak the optimizer would settle on the first combo it
    // visited (typically all-home-wins) — a scenario unrelated to the
    // target's predictions. Tiebreaking on target score guarantees the
    // displayed scenario reflects the form whenever doing so achieves the
    // best rank.
    if (above < bestAbove || (above === bestAbove && score > bestScore)) {
      bestAbove = above;
      bestScore = score;
      bestCombo = combo;
    }
  }
  return bestCombo;
}

// Top-K distinct group bracket shapes (defined by the set of teams that
// advance to R32 from this group). For each shape we keep the combo that
// scored best within that shape. Used by refineGroups to try different
// downstream bracket structures.
function getTopKShapes(
  groupRem: any[],
  group: string,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  workingResults: Record<string, any>,
  K: number,
): GroupCombo[] {
  const combos = enumerateGroupCombos(groupRem, trackedForms[targetId]);
  // GROUPS holds team objects; shapeKey compares against team CODES (the
  // values deriveAdvancingTeams returns), so index by code — otherwise
  // `groupTeams.has(code)` is always false and every combo collapses into a
  // single empty shapeKey, defeating the per-shape dedup below.
  const groupTeams = new Set(
    (GROUPS[group as keyof typeof GROUPS] || []).map((team) => team.code),
  );

  // Two combos that produce the same set of R32 entrants from this group
  // are merged — they yield the same downstream bracket structure for
  // this group, so refining over them is redundant. The R32 entrants
  // are derived via deriveAdvancingTeams (the canonical source).
  const shapeBest = new Map<
    string,
    { combo: GroupCombo; above: number; score: number }
  >();

  for (const combo of combos) {
    const trial = { ...workingResults, ...combo };
    const trialBracket = calcBracketTeams(trial);
    const allR32 = deriveAdvancingTeams(trialBracket).R32 || [];
    const shapeKey = allR32
      .filter((t: string) => groupTeams.has(t))
      .sort()
      .join(":");

    const scores = scoreForms(trackedForms, formPreds, trial);
    const above = countAbove(targetId, trackedIds, scores);
    const score = scores[targetId]?.totalPoints ?? 0;

    const existing = shapeBest.get(shapeKey);
    if (
      !existing ||
      above < existing.above ||
      (above === existing.above && score > existing.score)
    ) {
      shapeBest.set(shapeKey, { combo, above, score });
    }
  }

  return Array.from(shapeBest.values())
    .sort((a, b) => a.above - b.above || b.score - a.score)
    .slice(0, K)
    .map((s) => s.combo);
}

// ─── Target-dream completion ──────────────────────────────────────
// The one scenario every user checks by hand: "every remaining match goes
// exactly the way MY form predicted". The greedy search optimises rank
// against rivals but explores a limited candidate space and can wander off
// the target's own bracket — the reported production bug was a form whose
// optimizer scenario ranked 3rd while trivial manual edits (pushing the
// form's own picks truer) reached 1st. This builds that scenario explicitly
// so computeBestCase can never report worse than it.
//
// Remaining group matches take the target's exact predicted score (fallback
// 1-0). Remaining KO matches resolve round by round against the live
// bracket: when the materialised matchup equals the target's predicted
// matchup, the target's exact score (and tie-break winner) is used — the
// only case where the score itself earns points; otherwise the team the
// target predicted to go deeper advances with a representative 1-0/0-1.

function dreamCompletion(
  targetForm: any,
  targetPreds: FormPreds,
  remGroup: any[],
  remKO: any[],
  playedResults: Record<string, any>,
): Record<string, any> {
  const results: Record<string, any> = { ...playedResults };
  const matches = targetForm?.matches || {};

  for (const gm of remGroup) {
    const pred = matches[gm.id];
    results[gm.id] = isScoreValid(pred)
      ? { homeScore: +pred.homeScore, awayScore: +pred.awayScore }
      : { homeScore: 1, awayScore: 0 };
  }

  // How deep the target predicted a team to go (index into the advancing
  // rounds, champion ranks deepest). Drives the "who should advance" choice
  // for matchups the target didn't foresee.
  const ROUNDS = ["R32", "R16", "QF", "SF", "F"] as const;
  const depth = (team: string | null | undefined): number => {
    if (!team) return -1;
    let d = -1;
    for (let i = 0; i < ROUNDS.length; i++) {
      if ((targetPreds.advancing[ROUNDS[i]] || []).includes(team)) d = i;
    }
    if (targetPreds.champion === team) d = ROUNDS.length;
    return d;
  };

  for (const round of KO_ROUND_ORDER) {
    const roundRem = remKO.filter((m) => m.stage === round);
    if (!roundRem.length) continue;
    const bracket = calcBracketTeams(results);
    for (const m of roundRem) {
      const t = bracket[m.id];
      if (!t?.home || !t?.away) continue;
      const pred = matches[m.id];
      const pt = targetPreds.bracket[m.id];
      const sameMatchup = pt?.home === t.home && pt?.away === t.away;
      if (sameMatchup && isScoreValid(pred)) {
        const e: Record<string, any> = {
          homeScore: +pred.homeScore,
          awayScore: +pred.awayScore,
        };
        if (e.homeScore === e.awayScore)
          e.advancingTeam = pred.advancingTeam || t.home;
        results[m.id] = e;
      } else {
        const homeWins = depth(t.home) >= depth(t.away);
        results[m.id] = homeWins
          ? { homeScore: 1, awayScore: 0 }
          : { homeScore: 0, awayScore: 1 };
      }
    }
  }
  return results;
}

// ─── Knockout optimizer (greedy round-by-round) ───────────────────
// For each remaining KO match, try every candidate result, score the
// target + relevant forms via calculateFullScore against the cumulative
// trial, keep the candidate that minimises forms-above-target.

function optimizeKnockout(
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
): Record<string, any> {
  if (remKO.length === 0) return {};

  const koRes: Record<string, any> = {};

  for (const round of ["R32", "R16", "QF", "SF", "3RD", "F"]) {
    const roundMatches = remKO.filter((m) => m.stage === round);
    if (!roundMatches.length) continue;

    for (const match of roundMatches) {
      // Bracket may shift with each prior choice → recompute per match.
      const actualBracket = calcBracketTeams({ ...workingResults, ...koRes });
      const actualTeams = actualBracket[match.id];
      if (!actualTeams?.home || !actualTeams?.away) continue;

      const candidates = expandKnockoutCandidates(
        getCandidates(match.id, trackedForms),
        actualTeams,
      );

      let bestAbove = Infinity;
      let bestScore = -Infinity;
      let bestCand = candidates[0];

      for (const cand of candidates) {
        const trial = { ...workingResults, ...koRes, [match.id]: cand };
        const scores = scoreForms(trackedForms, formPreds, trial);
        const above = countAbove(targetId, trackedIds, scores);
        const score = scores[targetId]?.totalPoints ?? 0;
        if (above < bestAbove || (above === bestAbove && score > bestScore)) {
          bestAbove = above;
          bestScore = score;
          bestCand = cand;
        }
      }

      koRes[match.id] = bestCand;
    }
  }

  return koRes;
}

// ─── Iterative refinement ─────────────────────────────────────────
// Group choices propagate into KO matchups, so a locally-optimal group
// combo may be globally worse once the resulting bracket is filled in.
// We retry top-K distinct bracket shapes per group, re-running the full
// KO optimizer for each, accepting any trial that improves overall rank.

function refineGroups(
  remGroup: any[],
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  scoringForms: Record<string, any>,
  scoringPreds: Record<string, FormPreds>,
  allIds: string[],
): Record<string, any> {
  let best = { ...workingResults };
  const bestScores = scoreForms(scoringForms, scoringPreds, best);
  let bestRank = countAbove(targetId, allIds, bestScores);
  let bestScore = bestScores[targetId]?.totalPoints ?? 0;

  for (let iter = 0; iter < 4; iter++) {
    let improved = false;

    for (const group of Object.keys(GROUPS)) {
      const groupRem = remGroup.filter((m) => m.group === group);
      if (!groupRem.length) continue;

      const shapes = getTopKShapes(
        groupRem, group, targetId, trackedIds, trackedForms, formPreds, best, 8,
      );

      for (const shape of shapes) {
        const trial = { ...best };
        Object.assign(trial, shape);
        for (const km of remKO) delete trial[km.id];

        const newKO = optimizeKnockout(
          remKO, trial, targetId, trackedIds, trackedForms, formPreds,
        );
        Object.assign(trial, newKO);

        const trialScores = scoreForms(scoringForms, scoringPreds, trial);
        const trialRank = countAbove(targetId, allIds, trialScores);
        const trialScore = trialScores[targetId]?.totalPoints ?? 0;

        if (
          trialRank < bestRank ||
          (trialRank === bestRank && trialScore > bestScore)
        ) {
          bestRank = trialRank;
          bestScore = trialScore;
          best = trial;
          improved = true;
          break;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

// ─── Knockout local search ────────────────────────────────────────
// refineGroups only fires while group matches are still unplayed. The
// dominant real-world use of this tool, though, is "group stage finished,
// only the knockout bracket remains" — and there the round-by-round greedy
// (optimizeKnockout) is the ONLY other optimization, with no lookahead: an
// advancing-team / scoreline choice in an early round can be locally optimal
// yet globally worse once its downstream matchups are filled in. The reported
// production bug (optimizer said 3rd; trivially editing the scenario reached
// 1st) came from exactly this gap.
//
// This pass is a coordinate descent over COMPLETE scenarios. For each
// remaining KO match it re-tries every candidate result (including the
// deny-candidates the greedy is not allowed to use); the strictly-downstream
// matches — whose matchups depend on the choice — are re-completed with the
// target-dream rollout (dreamCompletion), and the resulting FULL scenario is
// scored against the FULL population. A trial replaces the incumbent only
// when it improves (rank, then target score), so the pass is a strict
// hill-climb: never worse than the seed it starts from, and every downstream
// match it rewrites is itself re-tried later in the same sweep. Compared to
// the previous design (re-running the greedy optimizer for the whole
// downstream subtree per candidate — quadratic in remaining matches, tens of
// seconds at 16), the rollout evaluation costs ONE population scoring per
// candidate, which is what makes running it at 16 remaining matches viable.

const KO_ROUND_ORDER = ["R32", "R16", "QF", "SF", "3RD", "F"];
const koRoundIndex = (stage: string) => KO_ROUND_ORDER.indexOf(stage);

// Gate for the greedy-downstream local search (refineKnockoutGreedy). That
// pass re-optimises every strictly-downstream match for each candidate of
// each match, so its cost grows ~quadratically with the number of remaining
// KO matches (≈37s at 16, untenable at the full 32) — it stays gated to the
// late, CONSTRAINED rounds (QF onward ≈ 8 matches, a few seconds).
const MAX_KO_REFINE_GREEDY = 8;

function refineKnockoutGreedy(
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  scoringForms: Record<string, any>,
  scoringPreds: Record<string, FormPreds>,
  allIds: string[],
): Record<string, any> {
  if (remKO.length === 0 || remKO.length > MAX_KO_REFINE_GREEDY) {
    return { ...workingResults };
  }

  let best = { ...workingResults };
  const bestScores = scoreForms(scoringForms, scoringPreds, best);
  let bestRank = countAbove(targetId, allIds, bestScores);
  let bestScore = bestScores[targetId]?.totalPoints ?? 0;

  const ordered = [...remKO].sort(
    (a, b) => koRoundIndex(a.stage) - koRoundIndex(b.stage),
  );

  for (let iter = 0; iter < 3; iter++) {
    let improved = false;

    for (const m of ordered) {
      // Only matches in strictly later rounds depend on m's outcome; same-round
      // matches are independent bracket slots, so leave them fixed.
      const mIdx = koRoundIndex(m.stage);
      const downstream = remKO.filter((k) => koRoundIndex(k.stage) > mIdx);

      const bracket = calcBracketTeams(best);
      const actualTeams = bracket[m.id];
      if (!actualTeams?.home || !actualTeams?.away) continue;

      const candidates = expandKnockoutCandidates(
        getCandidates(m.id, trackedForms),
        actualTeams,
      );

      for (const cand of candidates) {
        const trial = { ...best, [m.id]: cand };
        for (const d of downstream) delete trial[d.id];
        Object.assign(
          trial,
          optimizeKnockout(
            downstream, trial, targetId, trackedIds, trackedForms, formPreds,
          ),
        );

        const trialScores = scoreForms(scoringForms, scoringPreds, trial);
        const trialRank = countAbove(targetId, allIds, trialScores);
        const trialScore = trialScores[targetId]?.totalPoints ?? 0;

        if (
          trialRank < bestRank ||
          (trialRank === bestRank && trialScore > bestScore)
        ) {
          bestRank = trialRank;
          bestScore = trialScore;
          best = trial;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

// Gate for the rollout local search. 20 covers "R16 onward" INCLUDING the
// tail of R32 (validated on the real production backup: at 13/16 R32 results
// played = 19 remaining, the rollout finds the rank the user could reach by
// hand in the simulator, while the un-refined greedy+dream stops one rank
// short). Runtime at 19 remaining × 250 real forms ≈ 20s inside the worker.
// At the full 32 the sweep is still heavy in scoreForms calls (32 matches ×
// candidates × iterations), so the early-R32 window keeps relying on the
// greedy + dream floor — which on the same real backup found rank 1 at every
// state up to 11 R32 results played.
const MAX_KO_REFINE = 20;

function refineKnockout(
  remKO: any[],
  workingResults: Record<string, any>,
  targetId: string,
  trackedIds: string[],
  trackedForms: Record<string, any>,
  formPreds: Record<string, FormPreds>,
  scoringForms: Record<string, any>,
  scoringPreds: Record<string, FormPreds>,
  allIds: string[],
): Record<string, any> {
  if (remKO.length === 0 || remKO.length > MAX_KO_REFINE) {
    return { ...workingResults };
  }

  const targetForm = trackedForms[targetId];
  const targetPreds = formPreds[targetId];

  let best = { ...workingResults };
  const bestScores = scoreForms(scoringForms, scoringPreds, best);
  let bestRank = countAbove(targetId, allIds, bestScores);
  let bestScore = bestScores[targetId]?.totalPoints ?? 0;

  const ordered = [...remKO].sort(
    (a, b) => koRoundIndex(a.stage) - koRoundIndex(b.stage),
  );

  for (let iter = 0; iter < 4; iter++) {
    let improved = false;

    for (const m of ordered) {
      // Only matches in strictly later rounds depend on m's outcome; same-round
      // matches are independent bracket slots, so leave them fixed.
      const mIdx = koRoundIndex(m.stage);
      const downstream = remKO.filter((k) => koRoundIndex(k.stage) > mIdx);

      const bracket = calcBracketTeams(best);
      const actualTeams = bracket[m.id];
      if (!actualTeams?.home || !actualTeams?.away) continue;

      const candidates = expandKnockoutCandidates(
        getCandidates(m.id, trackedForms, /* includeDeny */ true),
        actualTeams,
      );

      for (const cand of candidates) {
        const withCand = { ...best, [m.id]: cand };
        for (const d of downstream) delete withCand[d.id];
        // Re-complete the downstream bracket for this choice with the
        // target-dream rollout — a full, legal scenario in one cheap pass.
        const trial = dreamCompletion(
          targetForm, targetPreds, [], downstream, withCand,
        );

        const trialScores = scoreForms(scoringForms, scoringPreds, trial);
        const trialRank = countAbove(targetId, allIds, trialScores);
        const trialScore = trialScores[targetId]?.totalPoints ?? 0;

        if (
          trialRank < bestRank ||
          (trialRank === bestRank && trialScore > bestScore)
        ) {
          bestRank = trialRank;
          bestScore = trialScore;
          best = trial;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

// ─── Main entry point ─────────────────────────────────────────────

export function computeBestCase(
  targetFormId: string,
  allForms: Record<string, any>,
  playedResults: Record<string, any>,
  onProgress?: ProgressCallback,
): BestCaseResult | null {
  const submittedForms = Object.fromEntries(
    Object.entries(allForms).filter(([, f]) => {
      const s = (f as any).status;
      return s === "submitted" || s === "approved";
    }),
  );
  if (!submittedForms[targetFormId]) return null;

  const remGroup = groupMatches.filter((m) => !playedResults[m.id]);
  const remKO = knockoutMatches.filter((m) => !playedResults[m.id]);

  // ── Phase 0: precompute per-form predictions (stable) + base scores ──
  onProgress?.("prep", 5);
  const allIds = Object.keys(submittedForms);

  // Per-form predictions are reused across every trial — compute once.
  const allFormPreds: Record<string, FormPreds> = {};
  for (const id of allIds) {
    allFormPreds[id] = buildFormPreds(submittedForms[id]);
  }

  const baseScores = scoreForms(submittedForms, allFormPreds, playedResults);
  const relevantIds = identifyRelevant(
    targetFormId, submittedForms, baseScores, remGroup, remKO,
  );

  // Inner-loop scoring is restricted to {target} ∪ relevant — heavy
  // optimization without paying to score irrelevant forms each time.
  const trackedIds = [targetFormId, ...relevantIds];
  const trackedForms: Record<string, any> = {};
  const trackedPreds: Record<string, FormPreds> = {};
  for (const id of trackedIds) {
    trackedForms[id] = submittedForms[id];
    trackedPreds[id] = allFormPreds[id];
  }

  // ── Phase 1: greedy group stage ──
  onProgress?.("group", 15);
  const workingResults = { ...playedResults };
  for (const group of Object.keys(GROUPS)) {
    const groupRem = remGroup.filter((m) => m.group === group);
    if (!groupRem.length) continue;
    Object.assign(
      workingResults,
      bestGroupCombo(
        groupRem, targetFormId, trackedIds, trackedForms, trackedPreds, workingResults,
      ),
    );
  }

  // ── Phase 2: greedy knockout ──
  onProgress?.("knockout", 50);
  Object.assign(
    workingResults,
    optimizeKnockout(
      remKO, workingResults, targetFormId, trackedIds, trackedForms, trackedPreds,
    ),
  );

  // ── Phase 2b: target-dream floor (full-population) ──
  // Never seed refinement with something worse than "the target's own
  // predictions simply come true". The greedy above can settle on a scenario
  // off the target's bracket; the dream scenario is the user's own mental
  // benchmark, so being beaten by it reads as a bug (and was reported as
  // one). Both candidates are scored against the FULL population — the same
  // objective the final rank uses.
  {
    const dream = dreamCompletion(
      trackedForms[targetFormId],
      trackedPreds[targetFormId],
      remGroup,
      remKO,
      playedResults,
    );
    const greedyScores = scoreForms(submittedForms, allFormPreds, workingResults);
    const greedyAbove = countAbove(targetFormId, allIds, greedyScores);
    const greedyPts = greedyScores[targetFormId]?.totalPoints ?? 0;
    const dreamScores = scoreForms(submittedForms, allFormPreds, dream);
    const dreamAbove = countAbove(targetFormId, allIds, dreamScores);
    const dreamPts = dreamScores[targetFormId]?.totalPoints ?? 0;
    if (
      dreamAbove < greedyAbove ||
      (dreamAbove === greedyAbove && dreamPts > greedyPts)
    ) {
      for (const k of Object.keys(workingResults)) delete workingResults[k];
      Object.assign(workingResults, dream);
    }
  }

  // ── Phase 3: iterative refinement of group shapes (full-population) ──
  onProgress?.("refine", 65);
  const refined = refineGroups(
    remGroup, remKO, workingResults,
    targetFormId, trackedIds, trackedForms, trackedPreds,
    submittedForms, allFormPreds, allIds,
  );

  // ── Phase 3b: knockout local search (lookahead over bracket choices) ──
  // The key optimization once the group stage is over and only the bracket is
  // left to play — refineGroups is a no-op then. Two chained strict
  // hill-climbs on the same objective, so the result can only match or
  // improve `refined`:
  //   1. refineKnockoutGreedy — the exhaustive downstream-re-greedy pass,
  //      affordable only at ≤8 remaining (QF onward).
  //   2. refineKnockout — the dream-rollout coordinate descent, cheap enough
  //      for the R16-onward window (≤16 remaining) where the reported
  //      "optimizer said 3rd, manual edits reached 1st" bug lived. It also
  //      runs after (1) so the late-stage window gets both explorers.
  onProgress?.("refine", 80);
  const refinedGreedy = refineKnockoutGreedy(
    remKO, refined,
    targetFormId, trackedIds, trackedForms, trackedPreds,
    submittedForms, allFormPreds, allIds,
  );
  onProgress?.("refine", 88);
  const refinedKO = refineKnockout(
    remKO, refinedGreedy,
    targetFormId, trackedIds, trackedForms, trackedPreds,
    submittedForms, allFormPreds, allIds,
  );

  // ── Phase 4: final rank against the full population ──
  onProgress?.("rank", 93);
  const finalScores = scoreForms(submittedForms, allFormPreds, refinedKO);
  const projectedRank = 1 + countAbove(targetFormId, allIds, finalScores);
  const projectedScore = finalScores[targetFormId]?.totalPoints ?? 0;

  onProgress?.("done", 100);
  return {
    projectedRank,
    projectedScore,
    totalForms: allIds.length,
    // Attach `stage` so the returned scenario scores identically if it is ever
    // re-fed through the leaderboard scoring path (which keys points off it).
    bestResults: withStage(refinedKO),
  };
}
