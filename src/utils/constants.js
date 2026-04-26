// Tournament-stage constants. Display labels live in `src/data/matches.js`
// (`STAGES`) — the same object is re-exported here as `STAGE_LABELS` so the
// two cannot drift. Order of the knockout rounds is the project-wide source
// of truth and is consumed both for iteration and for ranking comparisons.

import { STAGES } from "../data/matches.js";

export const KNOCKOUT_STAGE_ORDER = ["R32", "R16", "QF", "SF", "3RD", "F"];

// Alias retained for callers that imported `STAGE_LABELS` historically. Same
// object as `STAGES` from data/matches.js — including the `group` key.
export const STAGE_LABELS = STAGES;

export function getStageLabel(stage) {
  return STAGES[stage] || stage;
}
