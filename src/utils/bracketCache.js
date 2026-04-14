import { useMemo } from "react";
import { calcBracketTeams, deriveChampion } from "../utils/bracket";

// WeakMap-based cache — automatically garbage collected when form data changes
const bracketCache = new Map();
const championCache = new Map();

function getStableKey(matchPredictions) {
  const entries = Object.entries(matchPredictions);
  if (entries.length === 0) return 0;
  // Sort for determinism (JS object property order can vary)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  // FNV-1a hash — fast numeric key, no string allocation
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < entries.length; i++) {
    const id = entries[i][0];
    const p = entries[i][1];
    for (let j = 0; j < id.length; j++) {
      hash ^= id.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193);
    }
    const h = p?.homeScore ?? -1;
    const a = p?.awayScore ?? -1;
    hash ^= ((typeof h === 'number' ? h : -1) << 16) | ((typeof a === 'number' ? a : -1) & 0xffff);
    hash = Math.imul(hash, 0x01000193);
    if (p?.advancingTeam) {
      const at = p.advancingTeam;
      for (let j = 0; j < at.length; j++) {
        hash ^= at.charCodeAt(j);
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return hash;
}

export function getCachedBracket(matches) {
  const key = getStableKey(matches);
  if (bracketCache.has(key)) return bracketCache.get(key);
  const result = calcBracketTeams(matches);
  bracketCache.set(key, result);
  // Keep cache bounded
  if (bracketCache.size > 1000) {
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
  if (championCache.size > 1000) {
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
