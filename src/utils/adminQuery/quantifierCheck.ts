// Pre-LLM deterministic check: the Hebrew word `או` between two chips of the
// same kind is structurally ambiguous (distributing over the count vs over the
// chip). We surface this as a warning so the LLM is instructed to clarify.
//
// This is the v4-equivalent of v3's prefix-strip trap (Hebrew NLP review):
// a small Hebrew-syntactic hole that LLMs paper over silently.

const CHIP_RE = /\[\[(team|stage|form):[A-Za-z0-9_\-]+\]\]/g;

export interface QuantifierWarning {
  kind: "or-between-same-kind-chips";
  message: string;
}

export function detectQuantifierAmbiguity(text: string): QuantifierWarning[] {
  const warnings: QuantifierWarning[] = [];
  // Find all chip occurrences with their kinds + spans.
  const chips: Array<{ kind: string; start: number; end: number }> = [];
  CHIP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHIP_RE.exec(text)) !== null) {
    chips.push({ kind: m[1], start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i + 1 < chips.length; i++) {
    const a = chips[i];
    const b = chips[i + 1];
    if (a.kind !== b.kind) continue;
    const between = text.slice(a.end, b.start);
    // Match "או" as a standalone word, possibly with prefixes/suffixes
    // (e.g., " או ", "-או-", but not "מאוד" as a substring).
    if (/(^|\s|-)או(\s|$|-)/.test(between)) {
      warnings.push({
        kind: "or-between-same-kind-chips",
        message: `נמצא "או" בין שני אלמנטים מאותו סוג. הבהר/י: לחפש טפסים שניחשו את שניהם, או טפסים שניחשו לפחות אחד?`,
      });
    }
  }
  return warnings;
}
