import { useMemo } from "react";
import { calcBracketTeams, deriveChampion } from "../utils/bracket";

// WeakMap-based cache — automatically garbage collected when form data changes
const bracketCache = new Map();
const championCache = new Map();

function getStableKey(matches) {
  // Use a simple hash of match count + first/last match scores for cache key
  const keys = Object.keys(matches);
  if (keys.length === 0) return "empty";
  const first = matches[keys[0]];
  const last = matches[keys[keys.length - 1]];
  return `${keys.length}:${first?.homeScore}${first?.awayScore}:${last?.homeScore}${last?.awayScore}`;
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
