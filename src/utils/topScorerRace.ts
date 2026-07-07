/**
 * Per-simulation golden-boot ("מלך השערים") sampling for the Monte-Carlo
 * engines (scenarioSim + personalAnalysis).
 *
 * The Elo model samples MATCH SCORES, not scorers, so until now every
 * simulation implicitly assumed NOBODY hits the top-scorer bonus — silently
 * dropping 8 points (BONUSES.topScorer) plus tiebreaker #4 from every
 * simulated table, until the admin enters the real king at tournament end.
 *
 * Model (deliberately simple): the race is assumed to be decided among a
 * short favorite list. Each simulated tournament draws, per candidate,
 * an INDEPENDENT Bernoulli with his configured probability — a candidate
 * with p=0.5 pays his pickers' bonus in ~50% of sims, and two favorites can
 * be drawn together (co-kings ≈ a tie at the top of the scoring chart, which
 * is exactly how the real bonus pays every entry in actualBonuses.topScorers).
 * Per-candidate marginal hit-rates are exact; only the co-king correlation is
 * approximated. A sim where no candidate is drawn = "someone else won" (no
 * form gets the bonus, same as a pick outside the list).
 *
 * ADMIN-CONTROLLED, OFF BY DEFAULT. The whole feature is gated on the
 * existing gameData/actualBonuses doc:
 *   actualBonuses.topScorerSim = { enabled: boolean, odds?: { "<player>": p } }
 *   - enabled=false/absent → no sampling anywhere (the automatic post-result
 *     server run needs no odds and behaves exactly as before).
 *   - The admin turns it on from the scenarios tab when recomputing, and can
 *     set each candidate's probability there (odds keys are matched with
 *     isSamePlayer, so Hebrew or English names both work; clamped to [0,1]).
 *     Candidates without an override use the defaults below.
 *   - Because the gate lives in actualBonuses it reaches EVERY engine run —
 *     server, admin-local, and each user's personal analysis — from one
 *     source of truth, and runs that sampled are stamped (meta.topScorerProbs)
 *     so the UI can tell users whether the tables include the bonus.
 *   - A candidate whose team is already ELIMINATED in the real results is
 *     zeroed automatically — no bonus keeps paying for a knocked-out striker.
 *   - Once actualBonuses.topScorers is set (real king known), the engines
 *     switch back to the FIXED bonus and sampling is disabled entirely
 *     (see precomputeForms / the engines' `tsProbs` gate).
 *
 * Pure + side-effect-free → safe for Web Workers, the Netlify background
 * function, and the node test harness.
 */

import { isSamePlayer } from "./playerSearch";
import { calcBracketTeams, deriveActualAdvancing } from "./bracket";
import { knockoutMatches } from "../data/matches";
import { isScoreValid } from "./helpers";

export type TopScorerCandidate = { name: string; team: string; prob: number };

// Default per-candidate probabilities for the admin inputs (owner-chosen;
// the admin edits them per run in the scenarios tab). Draws are INDEPENDENT
// Bernoullis, so they may sum past 1 — overlap simply means co-kings are more
// likely. Order defines the bit position used by buildTopScorerMask /
// sampleTopScorerMask.
export const TOP_SCORER_CANDIDATES: TopScorerCandidate[] = [
  { name: "Kylian Mbappe", team: "FRA", prob: 0.6 },
  { name: "Lionel Messi", team: "ARG", prob: 0.5 },
  { name: "Erling Haaland", team: "NOR", prob: 0.2 },
  { name: "Harry Kane", team: "ENG", prob: 0.1 },
];

// Teams still alive in the real tournament: the R32 qualifiers minus every
// played knockout match's loser (the same derivation the competition-status
// page uses). Before all twelve groups are resolved, qualification isn't
// final — return null and treat everyone as alive.
export function computeAliveTeams(results: Record<string, any>): Set<string> | null {
  const bracket = calcBracketTeams(results || {});
  const r32 = deriveActualAdvancing(bracket, results || {})?.R32 || [];
  if (r32.length < 32) return null;
  const alive = new Set<string>(r32);
  for (const km of knockoutMatches) {
    const r = results?.[km.id];
    if (!isScoreValid(r)) continue;
    const teams = bracket[km.id];
    if (!teams?.home || !teams?.away) continue;
    const h = Number(r.homeScore);
    const a = Number(r.awayScore);
    const loser =
      h > a ? teams.away : a > h ? teams.home : r.advancingTeam === teams.home ? teams.away : teams.home;
    if (loser) alive.delete(loser);
  }
  return alive;
}

// The admin opt-in gate. Engines additionally require the real king to be
// unknown (actualBonuses.topScorers empty) before sampling.
export function isTopScorerSimEnabled(actualBonuses: any): boolean {
  return !!actualBonuses?.topScorerSim?.enabled;
}

// The FULL sampling gate — the single source of truth used by both engines
// and by the UI note on the competition-status page: admin opt-in AND the
// real king still unknown. Keep every consumer on this helper so the gates
// can never drift apart.
export function isTopScorerSamplingActive(actualBonuses: any): boolean {
  const fixed = Array.isArray(actualBonuses?.topScorers) ? actualBonuses.topScorers : [];
  return fixed.length === 0 && isTopScorerSimEnabled(actualBonuses);
}

// Resolve the per-candidate probability vector for a run (aligned to
// TOP_SCORER_CANDIDATES): defaults → admin odds → elimination zeroing.
export function resolveTopScorerProbs(
  actualBonuses: any,
  results: Record<string, any>,
): number[] {
  const overrides = actualBonuses?.topScorerSim?.odds;
  const alive = computeAliveTeams(results);
  return TOP_SCORER_CANDIDATES.map((c) => {
    let p = c.prob;
    if (overrides && typeof overrides === "object") {
      for (const [key, value] of Object.entries(overrides)) {
        if (!isSamePlayer(key, c.name)) continue;
        const n = Number(value);
        if (Number.isFinite(n)) p = Math.min(1, Math.max(0, n));
      }
    }
    if (alive && !alive.has(c.team)) p = 0;
    return p;
  });
}

// Bitmask of candidates a form's top-scorer pick refers to (bit i ⇔ candidate
// i, via isSamePlayer so legacy-English and Hebrew stored picks both match).
// 0 = the pick is outside the candidate list (or missing) — never pays.
export function buildTopScorerMask(pick: string | null | undefined): number {
  if (!pick) return 0;
  let mask = 0;
  for (let i = 0; i < TOP_SCORER_CANDIDATES.length; i++) {
    if (isSamePlayer(pick, TOP_SCORER_CANDIDATES[i].name)) mask |= 1 << i;
  }
  return mask;
}

// Draw one sim's kings: independent Bernoulli per candidate. ALWAYS consumes
// exactly TOP_SCORER_CANDIDATES.length rng() calls (even for p=0), so the
// consumed random stream — and therefore every downstream sampled match —
// is identical across runs that differ only in probabilities, and identical
// between scenarioSim and personalAnalysis (the same-seed parity lock).
export function sampleTopScorerMask(rng: () => number, probs: number[]): number {
  let mask = 0;
  for (let i = 0; i < TOP_SCORER_CANDIDATES.length; i++) {
    const draw = rng();
    if (draw < (probs[i] || 0)) mask |= 1 << i;
  }
  return mask;
}
