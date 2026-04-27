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

// World Cup 2026 kickoff: Mexico City local 13:00 (UTC-6) = 19:00 UTC =
// 22:00 Israel time (IDT, UTC+3). Source for both the live countdown and any
// "tournament has started" gate. Single source so `useCountdown` and any
// future caller cannot drift.
export const KICKOFF_UTC = new Date("2026-06-11T19:00:00Z").getTime();
