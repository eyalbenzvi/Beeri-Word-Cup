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

// ============ Domain limits ============
// Centralised so business rules (form caps), Firestore-imposed limits
// (batch size), and UX defaults (input length) can be reasoned about in
// one place. The Firestore rules file enforces the security-critical
// counterparts; if you change these, mirror them there too.

// Firestore allows 500 writes per batch. We cap at 400 to leave headroom
// for retries and to stay clear of soft-quota throttling.
export const FIRESTORE_BATCH_LIMIT = 400;

// Defensive cap on the global users doc. Single Firestore document can
// hold up to ~1MB; with ~500 bytes per user record, 2000 is well below
// the ceiling. Beyond this, future writes are refused with a Sentry alert.
export const MAX_USERS_HARD_LIMIT = 2000;

// Per-user form cap. Enforced client-side; Firestore rules don't yet
// enforce this (would need a counter doc) — see security audit #26.
export const MAX_FORMS_PER_USER = 10;

// Hard cap on raw phone-input length. The longest sane format is
// "+972-50-123-4567" (17 chars); 20 leaves slack for whitespace.
export const PHONE_MAX_INPUT_LEN = 20;
