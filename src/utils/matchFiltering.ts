import { groupMatches, knockoutMatches } from "../data/matches";

/**
 * Returns filtered matches by stage and optionally group.
 * Single source of truth for match filtering used across pages.
 */
export function getFilteredMatches(stage, group) {
  return stage === "group"
    ? groupMatches.filter((m) => m.group === group)
    : knockoutMatches.filter((m) => m.stage === stage);
}
