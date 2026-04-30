// Chip serialization. Format: `[[kind:CODE]]`, e.g. [[team:ARG]] [[stage:F]] [[form:abc]].
// Codes are stable; labels are NEVER serialized — looked up at render time.

import type { Chip, ChipKind, Stage } from "./types";
import { ALL_TEAMS } from "../../data/teams";

const CHIP_RE = /\[\[(team|stage|form):([A-Za-z0-9_\-]+)\]\]/g;

export function encodeChips(text: string, chips: Chip[]): string {
  // No-op: the editor already produces inline `[[k:CODE]]` markers; this
  // helper exists for tests + programmatic construction.
  void chips;
  return text;
}

export function parseChipsFromText(
  text: string,
  resolveLabel: (kind: ChipKind, code: string) => string,
): { plain: string; chips: Chip[] } {
  const chips: Chip[] = [];
  CHIP_RE.lastIndex = 0;
  const plain = text.replace(CHIP_RE, (_m, kind: ChipKind, code: string) => {
    chips.push({ kind, code, label: resolveLabel(kind, code) });
    return resolveLabel(kind, code);
  });
  return { plain, chips };
}

export function defaultLabelLookup(kind: ChipKind, code: string): string {
  if (kind === "team") {
    const t = ALL_TEAMS.find((x: any) => x.code === code);
    return t?.name || code;
  }
  if (kind === "stage") {
    const map: Record<Stage, string> = {
      groups: "שלב הבתים",
      R32: "שלב ה-32",
      R16: "שמינית",
      QF: "רבע גמר",
      SF: "חצי גמר",
      F: "גמר",
      ALL: "כל השלבים",
    };
    return map[code as Stage] || code;
  }
  return code;
}
