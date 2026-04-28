// Public scoring-rules table — derived from the runtime POINTS / BONUSES in
// utils/scoring.js so a tweak to scoring rules cannot silently drift from
// what the rules page shows users. The labels are display-only and slightly
// shorter than STAGES (e.g. "בתים" not "שלב הבתים") so the 4-column table
// fits on phone widths.

import { POINTS, BONUSES } from "../utils/scoring";

// [stage code, display label] in the order they should appear on the rules page.
const SCORING_TABLE_ROWS = [
  ["group", "בתים"],
  ["R32", "שלב ה-32"],
  ["R16", "שמינית גמר"],
  ["QF", "רבע גמר"],
  ["SF", "חצי גמר"],
  ["3RD", "מקום שלישי"],
  ["F", "גמר"],
];

// Stages with no further round have no "advancing" column — surface as null.
const TERMINAL_STAGES = new Set(["3RD", "F"]);

// [label, outcome pts, exact pts, advancing pts | null]
export const SCORING_DATA = SCORING_TABLE_ROWS.map(([stage, label]) => {
  const p = POINTS[stage];
  const advancing = TERMINAL_STAGES.has(stage) ? null : p.advancing;
  return [label, p.outcome, p.exactScore, advancing];
});

// Re-export bonus values so the rules page (and anyone else) can render them
// without independently hardcoding the numbers.
export { BONUSES };
