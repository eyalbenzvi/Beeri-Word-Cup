import { getTeamByCode } from "../data/teams.js";
import { TOP_SCORER_PLAYERS } from "../data/players.js";

const HEBREW_RE = /[֐-׿]/;
const NIQQUD_RE = /[֑-ׇ]/g;

export function isHebrew(str) {
  return !!str && HEBREW_RE.test(str);
}

export function normalizeSearch(str) {
  if (!str) return "";
  return str.normalize("NFKD").replace(NIQQUD_RE, "").toLowerCase().trim();
}

export function filterPlayers(query, players, limit = 20) {
  if (!query || !query.trim()) return players.slice(0, limit);
  const q = normalizeSearch(query);
  const hebrew = isHebrew(query);
  return players
    .filter((p) => {
      if (hebrew) {
        return p.nameHe && normalizeSearch(p.nameHe).includes(q);
      }
      const teamName = getTeamByCode(p.team)?.name || "";
      return normalizeSearch(p.name).includes(q) || normalizeSearch(teamName).includes(q);
    })
    .slice(0, limit);
}

// ============ LOOKUP HELPERS ============

export function resolvePlayerList(customList) {
  return customList && customList.length > 0 ? customList : TOP_SCORER_PLAYERS;
}

// Find a player by a stored value that may be in English (legacy) or Hebrew (new).
// Exact match only — partial/prefix matches are not resolved here.
export function getPlayerByEitherName(stored, playerList) {
  if (!stored) return null;
  const list = playerList || TOP_SCORER_PLAYERS;
  const s = String(stored).trim();
  if (!s) return null;
  return (
    list.find((p) => p.nameHe === s) ||
    list.find((p) => p.name === s) ||
    null
  );
}

// Display name (always Hebrew when resolvable; falls back to the raw stored string).
export function getPlayerDisplayName(stored, playerList) {
  if (!stored) return "";
  const player = getPlayerByEitherName(stored, playerList);
  return player?.nameHe || String(stored);
}

// True if two stored values refer to the same player (handles mixed En/He across legacy data).
// Falls back to normalized string comparison when neither side is in the list.
export function isSamePlayer(a, b, playerList) {
  if (a == null || b == null) return false;
  const as = String(a).trim();
  const bs = String(b).trim();
  if (!as || !bs) return false;
  if (as === bs) return true;

  const list = playerList || TOP_SCORER_PLAYERS;
  const pa = getPlayerByEitherName(as, list);
  const pb = getPlayerByEitherName(bs, list);
  if (pa && pb) return pa.name === pb.name && pa.team === pb.team;
  return normalizeSearch(as) === normalizeSearch(bs);
}

// Canonical storage form — Hebrew if the input resolves to a known player, else the raw input.
export function canonicalPlayerValue(input, playerList) {
  if (!input) return "";
  const player = getPlayerByEitherName(input, playerList);
  return player?.nameHe || String(input).trim();
}
