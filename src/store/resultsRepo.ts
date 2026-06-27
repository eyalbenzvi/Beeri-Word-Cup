// Admin-write repos for the small singleton gameData docs:
//   - matchResults: { [matchId]: { homeScore, awayScore, advancingTeam? } }
//   - actualBonuses: { champion, topScorers[] }
//   - settings: { predictionsLocked, bestCaseEnabled?, topScorerPlayers? }
//
// All writes go through writeGameDoc (in usersRepo) so the don't-shrink
// safety guard + audit + timeout + token-refresh wrapping applies
// uniformly.

import { writeAuditLog } from "./audit";
import { cache } from "./cache";
import { requireAdmin, writeGameDoc } from "./usersRepo";
import { triggerScenarioRecompute } from "./scenarioRepo";

const EMPTY_OBJ: Record<string, any> = {};
const DEFAULT_BONUSES = { champion: null as string | null, topScorers: [] as string[] };
const DEFAULT_SETTINGS: Record<string, any> = {
  predictionsLocked: false,
  bestCaseEnabled: false,
};

// ============ MATCH RESULTS (admin) ============

export function clearMatchResults() {
  if (!requireAdmin()) return;
  writeAuditLog("clear-match-results");
  recomputeScenariosAfter(writeGameDoc("matchResults", {}, { force: true }));
}

// Poke the server-side scenario recompute once a result write has SETTLED (so
// the background function reads the new state, not the pre-write one).
function recomputeScenariosAfter(write: any) {
  Promise.resolve(write).then(() => triggerScenarioRecompute()).catch(() => {});
}

export function getMatchResults() {
  return cache.matchResults || EMPTY_OBJ;
}

export function saveMatchResult(matchId: string, result: any) {
  if (!requireAdmin()) return;
  const results = { ...getMatchResults() };
  // A manual admin write is authoritative and marks the row as admin-owned
  // (source="admin"), so the auto-fill function will never overwrite a score
  // an admin has set or corrected. No approval step exists — auto-fill is
  // fully automatic; this only protects deliberate manual overrides.
  results[matchId] = {
    ...result,
    source: "admin",
    updatedAt: new Date().toISOString(),
  };
  recomputeScenariosAfter(writeGameDoc("matchResults", results));
}

export function deleteMatchResult(matchId: string) {
  if (!requireAdmin()) return;
  const results = { ...getMatchResults() };
  delete results[matchId];
  recomputeScenariosAfter(writeGameDoc("matchResults", results));
}

// ============ ACTUAL BONUSES (admin) ============

export function getActualBonuses() {
  return cache.actualBonuses || DEFAULT_BONUSES;
}

export function saveActualBonuses(bonuses: any) {
  if (!requireAdmin()) return;
  writeGameDoc("actualBonuses", bonuses);
}

// ============ SETTINGS ============

export function getSettings() {
  return cache.settings || DEFAULT_SETTINGS;
}

// Whether the settings doc has been fetched at least once (authenticated
// listener landed, or public-readonly endpoint resolved). Used by the blog
// page so an unauth visitor doesn't briefly see the pre-tournament empty
// state during the public-settings fetch window — instead we show the
// loading state until we actually know predictionsLocked.
export function isSettingsReady() {
  return !!cache._ready.settings;
}

// Whether the settings doc's value is SERVER-confirmed (not just a possibly
// stale offline-cache read). Consumers that must not act on a stale
// `predictionsLocked` — the Leaderboard lock screen — gate on this so they
// don't flash "rating unavailable" off a pre-lock IndexedDB snapshot, while
// the global readiness gate (isSettingsReady) stays resolvable offline.
export function isSettingsServerConfirmed() {
  return !!cache.settingsServerConfirmed;
}

export function updateSettings(newSettings: Record<string, any>) {
  if (!requireAdmin()) return;
  const settings = { ...getSettings(), ...newSettings };
  writeGameDoc("settings", settings);
}
