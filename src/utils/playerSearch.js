import { getTeamByCode } from "../data/teams";

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
