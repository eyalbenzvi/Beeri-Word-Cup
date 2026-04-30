// Residual resolver: parses the parts of the Hebrew question that aren't
// chips — score patterns, bare stage names, bare numbers. Runs in JS before
// the LLM call.
//
// Per Hebrew NLP reviewer: minimum-viable score patterns; chips kill the
// rest of the prefix-strip / fuzzy class.

import type { ResolvedEntities, Stage, Chip } from "./types";
import { detectQuantifierAmbiguity } from "./quantifierCheck";

const STAGE_PATTERNS: Array<{ regex: RegExp; stage: Stage }> = [
  { regex: /(?:^|\s)(?:שלב\s+)?(?:ה)?(?:רבעי|רבע)\s+(?:ה)?גמר(?=$|\s)/, stage: "QF" },
  { regex: /(?:^|\s)(?:שלב\s+)?(?:ה)?(?:חצאי|חצי)\s+(?:ה)?גמר(?=$|\s)/, stage: "SF" },
  { regex: /(?:^|\s)(?:שלב\s+)?(?:ה)?(?:שמיניות|שמינית)(?:\s+(?:ה)?גמר)?(?=$|\s)/, stage: "R16" },
  { regex: /(?:^|\s)(?:שלב\s+)?(?:ה)?32(?:\s+(?:ה)?גמר)?(?=$|\s)/, stage: "R32" },
  { regex: /(?:^|\s)(?:שלב\s+)?(?:ה)?גמר(?=$|\s)/, stage: "F" },
  { regex: /(?:^|\s)(?:שלב\s+)?ה?בתים(?=$|\s)/, stage: "groups" },
];

const SCORE_PATTERNS = [
  /(\d+)\s*[:\-]\s*(\d+)/g, // 2:1, 2-1
  /(\d+)\s+ל-?\s*(\d+)/g, // 2 ל-1
];

const NUMBER_RE = /(?<![A-Za-z\d:])(\d+)(?!\d)/g;

const CHIP_STRIPPER = /\[\[(?:team|stage|form):[A-Za-z0-9_\-]+\]\]/g;

export function resolveResidual(
  questionWithChips: string,
  preExistingChips: Chip[] = [],
): ResolvedEntities {
  // Strip chips from text so we don't accidentally re-detect their codes
  // as numbers or scores.
  const stripped = questionWithChips.replace(CHIP_STRIPPER, " ");

  const stages: ResolvedEntities["stages"] = [];
  for (const { regex, stage } of STAGE_PATTERNS) {
    const m = stripped.match(regex);
    if (m) stages.push({ token: m[0].trim(), stage });
    if (stages.some((s) => s.stage === stage)) continue;
  }

  const scores: ResolvedEntities["scores"] = [];
  const consumed = new Set<string>();
  for (const re of SCORE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const key = `${m.index}:${m[0]}`;
      if (consumed.has(key)) continue;
      consumed.add(key);
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        scores.push({ token: m[0], pair: [a, b] });
      }
    }
  }

  // Drop bare digits that are also part of a score we already parsed.
  const scoreSpans = scores.map((s) => s.token);
  const numbers: number[] = [];
  let nm: RegExpExecArray | null;
  NUMBER_RE.lastIndex = 0;
  while ((nm = NUMBER_RE.exec(stripped)) !== null) {
    const val = parseInt(nm[1], 10);
    const isInScore = scoreSpans.some((s) => s.includes(nm![1]));
    if (!isInScore && Number.isFinite(val)) numbers.push(val);
  }

  return {
    chips: preExistingChips,
    scores,
    stages,
    numbers,
    warnings: detectQuantifierAmbiguity(questionWithChips).map((w) => w.message),
  };
}
