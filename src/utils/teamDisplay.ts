import { getTeamByCode } from "../data/teams";

/**
 * Returns team display name with a fallback for unknown/unresolved teams.
 * Single source of truth for team name display used across pages.
 */
export function getTeamDisplayName(code, fallback = "טרם נקבע") {
  return getTeamByCode(code)?.name || fallback;
}

/**
 * "🇫🇷 צרפת" — flag + name, falling back to the raw code for unknown teams.
 * Single source of truth for the flag+name rendering used by the
 * competition-analysis surfaces.
 */
export function getTeamFlagName(code) {
  const t = getTeamByCode(code);
  return t ? `${t.flag} ${t.name}` : code;
}
