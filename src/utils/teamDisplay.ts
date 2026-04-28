import { getTeamByCode } from "../data/teams";

/**
 * Returns team display name with a fallback for unknown/unresolved teams.
 * Single source of truth for team name display used across pages.
 */
export function getTeamDisplayName(code, fallback = "טרם נקבע") {
  return getTeamByCode(code)?.name || fallback;
}
