// Client-side rank history for the signed-in user's forms (#6). There is no
// server-side time series, so we accumulate one locally: each time the
// leaderboard is computed we append the current rank per form. To keep the
// series compact and meaningful we record a point only when the rank MOVED, or
// at most once per day for a stable rank, capped to the most recent points.
//
// Pure functions with an injectable storage object (anything exposing
// getItem/setItem) so the dedupe logic is unit-testable without a DOM.

export type RankPoint = { t: number; rank: number };
type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "beeri:rankHistory";
const MAX_POINTS = 40;
const DAY_MS = 24 * 3600 * 1000;

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* access denied */ }
  return null;
}

function read(storage: StorageLike): Record<string, RankPoint[]> {
  try {
    const raw = storage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

// Append current ranks. Returns the updated map (handy for tests).
export function recordRanks(
  entries: { formId: string; rank: number }[],
  now: number = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): Record<string, RankPoint[]> {
  if (!storage) return {};
  const data = read(storage);
  let changed = false;
  for (const { formId, rank } of entries) {
    if (!formId || typeof rank !== "number") continue;
    // Coerce a corrupt per-form value (e.g. hand-edited storage turning the
    // array into a scalar) to [] so .push / later .map never throw.
    const arr = Array.isArray(data[formId]) ? data[formId] : [];
    const last = arr[arr.length - 1];
    // Record on: first ever point · a rank change · a new day for a stable rank.
    const shouldRecord = !last || last.rank !== rank || now - last.t >= DAY_MS;
    if (!shouldRecord) continue;
    // Seed an anchor on the very first entry so the sparkline (which requires
    // ≥2 points) renders immediately on the first leaderboard visit.
    if (!last) arr.push({ t: now - 1, rank });
    arr.push({ t: now, rank });
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
    data[formId] = arr;
    changed = true;
  }
  if (changed) {
    try { storage.setItem(KEY, JSON.stringify(data)); } catch { /* quota — ignore */ }
  }
  return data;
}

export function getRankHistory(
  formId: string,
  storage: StorageLike | null = defaultStorage(),
): RankPoint[] {
  if (!storage || !formId) return [];
  const v = read(storage)[formId];
  return Array.isArray(v) ? v : [];
}
