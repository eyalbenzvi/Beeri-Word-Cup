// Admin-write repos for the small singleton gameData docs:
//   - matchResults: { [matchId]: { homeScore, awayScore, advancingTeam? } }
//   - actualBonuses: { champion, topScorers[] }
//   - settings: { predictionsLocked, topScorerPlayers? }
//
// All writes go through writeGameDoc (in usersRepo) so the don't-shrink
// safety guard + audit + timeout + token-refresh wrapping applies
// uniformly.

import { writeAuditLog } from "./audit";
import { cache } from "./cache";
import { requireAdmin, writeGameDoc } from "./usersRepo";

const EMPTY_OBJ: Record<string, any> = {};
const DEFAULT_BONUSES = { champion: null as string | null, topScorers: [] as string[] };
const DEFAULT_SETTINGS: Record<string, any> = { predictionsLocked: false };

// ============ MATCH RESULTS (admin) ============

export function clearMatchResults() {
  if (!requireAdmin()) return;
  writeAuditLog("clear-match-results");
  writeGameDoc("matchResults", {}, { force: true });
}

export function getMatchResults() {
  return cache.matchResults || EMPTY_OBJ;
}

export function saveMatchResult(matchId: string, result: any) {
  if (!requireAdmin()) return;
  const results = { ...getMatchResults() };
  results[matchId] = { ...result, updatedAt: new Date().toISOString() };
  writeGameDoc("matchResults", results);
}

export function deleteMatchResult(matchId: string) {
  if (!requireAdmin()) return;
  const results = { ...getMatchResults() };
  delete results[matchId];
  writeGameDoc("matchResults", results);
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

export function updateSettings(newSettings: Record<string, any>) {
  if (!requireAdmin()) return;
  const settings = { ...getSettings(), ...newSettings };
  writeGameDoc("settings", settings);
}
