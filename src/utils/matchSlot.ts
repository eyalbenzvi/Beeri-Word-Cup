import type { Match } from "../data/matches";

type SlotMatch = Pick<Match, "stage" | "home" | "away" | "thirdFrom"> | null | undefined;

/**
 * Round-of-32 qualifying-slot placeholder.
 *
 * Before the group stage finishes, the two sides of an R32 match are not yet
 * decided. Rather than rendering a bare "טרם נקבע", every surface that shows a
 * match can call this to display WHO will play in the slot — the group-finish
 * code ("1A" = winner of group A, "2B" = runner-up of group B) or, for the
 * eight winner-vs-third-place fixtures, a third-place descriptor that lists the
 * groups the qualifier may come from.
 *
 * Returns null when no placeholder applies (non-R32 stage — R16+ placeholders
 * are opaque "W77"-style codes the app deliberately hides — or missing slot
 * data), so callers fall back to their own "טרם נקבע" default.
 */
export function r32SlotLabel(match: SlotMatch, side: "home" | "away"): string | null {
  if (!match || match.stage !== "R32") return null;
  const slot = side === "home" ? match.home : match.away;
  if (!slot) return null;
  if (slot === "3rd") {
    return match.thirdFrom ? `מקום 3 (${match.thirdFrom})` : "מקום 3";
  }
  return slot;
}

/**
 * Team-name display for a match slot with the R32 placeholder baked into the
 * fallback chain: resolved team name → R32 slot placeholder → "טרם נקבע".
 * Convenience wrapper for the many surfaces that currently do
 * `team?.name || "טרם נקבע"`.
 */
export function slotDisplayName(
  match: SlotMatch,
  side: "home" | "away",
  resolvedName: string | null | undefined,
): string {
  return resolvedName || r32SlotLabel(match, side) || "טרם נקבע";
}
