import { useMemo } from "react";
import { calcBracketTeams, deriveChampion } from "../utils/bracket";

// WeakMap-based cache — automatically garbage collected when form data changes
const bracketCache = new Map();
const championCache = new Map();

function getStableKey(matchPredictions) {
  const entries = Object.entries(matchPredictions);
  if (entries.length === 0) return "empty";
  // Use ALL entries for a collision-free key (sorted for determinism)
  const parts = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, p]) => `${id}:${p?.homeScore ?? ''}-${p?.awayScore ?? ''}${p?.advancingTeam ? '>' + p.advancingTeam : ''}`)
    .join('|');
  return parts;
}

export function getCachedBracket(matches) {
  const key = getStableKey(matches);
  if (bracketCache.has(key)) return bracketCache.get(key);
  const result = calcBracketTeams(matches);
  bracketCache.set(key, result);
  // Keep cache bounded
  if (bracketCache.size > 500) {
    const firstKey = bracketCache.keys().next().value;
    bracketCache.delete(firstKey);
  }
  return result;
}

export function getCachedChampion(matches) {
  const key = getStableKey(matches);
  if (championCache.has(key)) return championCache.get(key);
  const bracket = getCachedBracket(matches);
  const champ = deriveChampion(matches, bracket);
  championCache.set(key, champ);
  if (championCache.size > 500) {
    const firstKey = championCache.keys().next().value;
    championCache.delete(firstKey);
  }
  return champ;
}

// Hook for components that need bracket for a single form
export function useBracket(matches) {
  return useMemo(() => getCachedBracket(matches), [matches]);
}

// Hook for computing champions for all forms at once
export function useAllChampions(forms) {
  return useMemo(() => {
    const result = {};
    for (const form of forms) {
      const matches = form.matches || {};
      result[form.formId] = getCachedChampion(matches);
    }
    return result;
  }, [forms]);
}

// Clear caches (call when data changes significantly)
export function clearBracketCache() {
  bracketCache.clear();
  championCache.clear();
}
