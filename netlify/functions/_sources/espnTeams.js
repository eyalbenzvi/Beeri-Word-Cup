// Shared ESPN team -> our FIFA code resolver, used by both the live-scores
// normalizer (espnLive.js) and the auto-fill result client (espnResult.js).
//
// Prefer the full country name via the shared alias table (robust to ESPN's
// naming variants); fall back to the team abbreviation only when it is already
// one of our codes. Unknown -> null, so the fixture simply fails to pair /
// identify (never a wrong or flipped score).

import { matchTeamName, FIFA_CODES } from "./teamCodes.js";

const VALID_CODES = new Set(FIFA_CODES);

export function espnTeamCode(team) {
  if (!team) return null;
  const byName =
    matchTeamName(team.displayName) ||
    matchTeamName(team.shortDisplayName) ||
    matchTeamName(team.name) ||
    matchTeamName(team.location);
  if (byName) return byName;
  const abbr =
    typeof team.abbreviation === "string"
      ? team.abbreviation.trim().toUpperCase()
      : "";
  return VALID_CODES.has(abbr) ? abbr : null;
}
