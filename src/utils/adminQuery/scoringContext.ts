// Builds the actual-tournament scoring context (actual bracket, advancing,
// champion). Pure wrappers around existing utilities — no new bracket math.
//
// This duplicates the structure of useLeaderboardComputed.ts but stays
// outside hooks-land so it can be called from tests and a single useMemo
// in the admin tab. Parity with calculateFullScore is enforced by
// flatten.test.ts.

import {
  deriveActualAdvancing,
  deriveAdvancingTeams,
  deriveChampion,
} from "../bracket";
import { getCachedBracket } from "../bracketCache";

export interface ScoringContext {
  actualBracket: Record<string, { home: string | null; away: string | null }>;
  actualAdvancing: Record<string, string[]>;
  actualChampion: string | null;
}

export function buildScoringContext(
  results: Record<string, any>,
  actualBonuses: any,
): ScoringContext {
  const actualBracket = getCachedBracket(results);
  const actualAdvancing = deriveActualAdvancing(actualBracket, results);
  // Champion is derived from the actual final result; fall back to any admin-
  // saved champion bonus for symmetry with `useLeaderboardComputed`.
  const derived = deriveChampion(results, actualBracket);
  const actualChampion = derived || actualBonuses?.champion || null;
  return { actualBracket, actualAdvancing, actualChampion };
}

export { deriveAdvancingTeams };
