import { useMemo } from "react";
import { calcBracketTeams, calcGroupStandings, deriveChampion } from "../utils/bracket";

// Separate caches for gated (actual-results) vs ungated (prediction) brackets
const bracketCache = new Map();
const bracketGatedCache = new Map();
const championCache = new Map();
const standingsCache = new Map();

function getStableKey(matchPredictions: Record<string, any>) {
  const entries = Object.entries(matchPredictions);
  if (entries.length === 0) return 0;
  // Sort for determinism (JS object property order can vary)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  // FNV-1a hash — fast numeric key, no string allocation
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < entries.length; i++) {
    const id = entries[i][0];
    const p = entries[i][1] as any;
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

export function getCachedBracket(matches, gatingOnResults = false) {
  const key = getStableKey(matches);
  const cache = gatingOnResults ? bracketGatedCache : bracketCache;
  if (cache.has(key)) return cache.get(key);
  const result = calcBracketTeams(matches, gatingOnResults);
  cache.set(key, result);
  // Keep cache bounded
  if (cache.size > 1000) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  return result;
}

// Cached group standings (ordered arrays per group). Same FNV key + bounded
// LRU as the bracket caches. Used by the admin team-insights aggregation so
// per-form group positions aren't recomputed on every render.
export function getCachedStandings(matches) {
  const key = getStableKey(matches);
  if (standingsCache.has(key)) return standingsCache.get(key);
  const result = calcGroupStandings(matches);
  standingsCache.set(key, result);
  if (standingsCache.size > 1000) {
    const firstKey = standingsCache.keys().next().value;
    standingsCache.delete(firstKey);
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

// Stable (module-level) resolver: a form → its full bracket-teams map.
// Passed to the prediction-stats aggregators that need to verify, per form,
// whether the form's bracket seated the SAME teams into a knockout slot as
// actually happened. Defined once here (not as an inline arrow at call sites)
// so it keeps a stable identity across renders — callers can safely list it
// in useMemo dependency arrays without retriggering. Reads form.matches and
// rides the same cached-bracket LRU as everything else.
export function getFormBracketTeams(form) {
  return getCachedBracket(form?.matches || {});
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
  bracketGatedCache.clear();
  championCache.clear();
  standingsCache.clear();
}
