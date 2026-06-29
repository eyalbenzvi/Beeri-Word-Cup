// Shared, framework-free logic for knockout extra-time / penalty results.
//
// THE ONE INVARIANT THAT MATTERS: `homeScore`/`awayScore` on a result are the
// END-OF-90-MINUTES (regulation) score and are the ONLY thing scoring reads
// (see src/utils/scoring.ts). Everything in this module is presentation-only
// enrichment — it records and describes HOW a knockout tie was decided (extra
// time / penalties) without ever touching the points pipeline.
//
// Used by BOTH the client (admin entry form, display components) and the
// Netlify auto-fill function, so the write shape and the read interpretation
// can never drift. No React, no DOM, no Hebrew copy (copy lives in
// constants/messages.ts) — just data.

export const DECIDED_BY = {
  REGULAR: "regular",
  EXTRA_TIME: "extra_time",
  PENALTIES: "penalties",
} as const;

export type DecidedByValue =
  (typeof DECIDED_BY)[keyof typeof DECIDED_BY];

// Source "duration" tokens (REGULAR / EXTRA_TIME / PENALTY_SHOOTOUT) -> our
// decidedBy. Anything unrecognised falls back to regular.
export function decidedByFromDuration(duration: string | null | undefined): DecidedByValue {
  if (duration === "PENALTY_SHOOTOUT") return DECIDED_BY.PENALTIES;
  if (duration === "EXTRA_TIME") return DECIDED_BY.EXTRA_TIME;
  return DECIDED_BY.REGULAR;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export interface BreakdownInput {
  decidedBy?: string | null;
  etHomeScore?: any;
  etAwayScore?: any;
  penHomeScore?: any;
  penAwayScore?: any;
  breakdownSource?: string | null;
}

export interface BreakdownRecord {
  decidedBy: DecidedByValue;
  etHomeScore: number | null;
  etAwayScore: number | null;
  penHomeScore: number | null;
  penAwayScore: number | null;
  breakdownSource: string | null;
}

// Canonical serializer for the breakdown subset of a result. ALWAYS emits every
// key (null where N/A) — never `undefined` — because Firestore + JSON.stringify
// drop undefined keys, and the auto-fill function writes with { merge: true },
// where an omitted key would silently leave a STALE previous value behind. The
// admin path (full-map replace) and the auto-fill path (per-match merge) both
// run through this, so the two produce byte-identical shapes.
//
// It also normalizes by decision kind: a "regular" result carries no ET/pen
// numbers; an "extra_time" result carries no penalty numbers. This keeps a
// regular knockout win from ever sprouting an empty penalties row downstream.
export function buildResultRecord(input: BreakdownInput = {}): BreakdownRecord {
  const decidedBy = ((): DecidedByValue => {
    const d = input.decidedBy;
    if (d === DECIDED_BY.PENALTIES || d === DECIDED_BY.EXTRA_TIME || d === DECIDED_BY.REGULAR) {
      return d;
    }
    // Infer from presence (self-heal partial inputs) before defaulting.
    if (toIntOrNull(input.penHomeScore) != null || toIntOrNull(input.penAwayScore) != null) {
      return DECIDED_BY.PENALTIES;
    }
    if (toIntOrNull(input.etHomeScore) != null || toIntOrNull(input.etAwayScore) != null) {
      return DECIDED_BY.EXTRA_TIME;
    }
    return DECIDED_BY.REGULAR;
  })();

  const hasET = decidedBy === DECIDED_BY.EXTRA_TIME || decidedBy === DECIDED_BY.PENALTIES;
  const hasPens = decidedBy === DECIDED_BY.PENALTIES;

  return {
    decidedBy,
    etHomeScore: hasET ? toIntOrNull(input.etHomeScore) : null,
    etAwayScore: hasET ? toIntOrNull(input.etAwayScore) : null,
    penHomeScore: hasPens ? toIntOrNull(input.penHomeScore) : null,
    penAwayScore: hasPens ? toIntOrNull(input.penAwayScore) : null,
    breakdownSource: typeof input.breakdownSource === "string" ? input.breakdownSource : null,
  };
}

export interface ValidateContext {
  isKnockout: boolean;
  /** the two participant codes, for advancingTeam membership checks */
  homeTeam?: string | null;
  awayTeam?: string | null;
}

// Integrity gate run on EVERY write (admin + auto-fill), never just on display.
// Rejects internally-contradictory results so a wrong story can never be
// persisted. Tolerant of MISSING breakdown numbers (auto-fill is best-effort and
// may know only that it went to ET/pens), but strict about PRESENT numbers.
export function validateResultBreakdown(result: any, ctx: ValidateContext): { valid: boolean; reason?: string } {
  if (!result) return { valid: false, reason: "missing result" };
  const home = toIntOrNull(result.homeScore);
  const away = toIntOrNull(result.awayScore);
  if (home == null || away == null) {
    // Unplayed / scoreless rows are validated elsewhere; nothing to check here.
    return { valid: true };
  }

  const isTie = home === away;
  const decidedBy = result.decidedBy || DECIDED_BY.REGULAR;
  const adv = result.advancingTeam || null;
  const etH = toIntOrNull(result.etHomeScore);
  const etA = toIntOrNull(result.etAwayScore);
  const penH = toIntOrNull(result.penHomeScore);
  const penA = toIntOrNull(result.penAwayScore);

  // --- Group stage / non-knockout: no decision metadata allowed. ---
  if (!ctx.isKnockout) {
    if (decidedBy !== DECIDED_BY.REGULAR || adv || etH != null || penH != null) {
      return { valid: false, reason: "group match cannot carry knockout decision data" };
    }
    return { valid: true };
  }

  // --- Knockout decided in regulation (no tie at 90'). ---
  if (!isTie) {
    if (decidedBy !== DECIDED_BY.REGULAR) {
      return { valid: false, reason: "decisive 90' result must be decidedBy=regular" };
    }
    if (etH != null || penH != null) {
      return { valid: false, reason: "decisive 90' result cannot carry ET/penalty scores" };
    }
    return { valid: true };
  }

  // --- Knockout tie at 90': someone must advance. ---
  if (!adv) return { valid: false, reason: "knockout tie without advancing team" };
  if (ctx.homeTeam && ctx.awayTeam && adv !== ctx.homeTeam && adv !== ctx.awayTeam) {
    return { valid: false, reason: "advancing team is not a participant" };
  }
  if (decidedBy !== DECIDED_BY.EXTRA_TIME && decidedBy !== DECIDED_BY.PENALTIES) {
    return { valid: false, reason: "knockout tie must be decided by extra_time or penalties" };
  }

  // Which side does advancingTeam correspond to? (home vs away)
  const advIsHome = ctx.homeTeam ? adv === ctx.homeTeam : null;

  if (decidedBy === DECIDED_BY.EXTRA_TIME) {
    if (penH != null || penA != null) {
      return { valid: false, reason: "extra_time result cannot carry penalty scores" };
    }
    // If ET numbers are present they must name a winner that matches advancing.
    if (etH != null && etA != null) {
      if (etH === etA) return { valid: false, reason: "extra_time score cannot be level" };
      if (advIsHome !== null) {
        const etWinnerIsHome = etH > etA;
        if (etWinnerIsHome !== advIsHome) {
          return { valid: false, reason: "extra_time winner does not match advancing team" };
        }
      }
    }
    return { valid: true };
  }

  // decidedBy === penalties
  // ET (if recorded) must be LEVEL — that's why it went to penalties.
  if (etH != null && etA != null && etH !== etA) {
    return { valid: false, reason: "penalties imply a level score after extra time" };
  }
  if (penH != null && penA != null) {
    if (penH === penA) return { valid: false, reason: "penalty shootout cannot be level" };
    if (advIsHome !== null) {
      const penWinnerIsHome = penH > penA;
      if (penWinnerIsHome !== advIsHome) {
        return { valid: false, reason: "penalty winner does not match advancing team" };
      }
    }
  }
  return { valid: true };
}

// A knockout result whose 90' was LEVEL but whose winner is not yet recorded —
// i.e. the match is still being decided in extra time / penalties (or an admin
// entered the 90' score before picking who advanced). Such a match is NOT over:
// it must keep showing as live and keep being polled for auto-fill, NOT drop
// into "finished". Group ties never qualify (no advancing concept there).
export function isUnresolvedKnockoutTie(result: any, isKnockout: boolean): boolean {
  if (!result || !isKnockout) return false;
  const h = toIntOrNull(result.homeScore);
  const a = toIntOrNull(result.awayScore);
  return h != null && a != null && h === a && !result.advancingTeam;
}

export interface ResultDecision {
  /** has a usable 90' score */
  played: boolean;
  /** 90' (regulation) score — the scoring anchor, always the headline number */
  reg: { home: number; away: number } | null;
  /** "regular" | "extra_time" | "penalties" | "unknown_tie" */
  decidedBy: DecidedByValue | "unknown_tie";
  /** true when the 90' score was a tie in a knockout (i.e. someone advanced) */
  isKnockoutTie: boolean;
  et: { home: number; away: number } | null;
  pens: { home: number; away: number } | null;
  advancingTeam: string | null;
  /** true when we know it went beyond 90' but lack the exact ET/pen numbers */
  numbersMissing: boolean;
}

// Read-side normalizer, tolerant of legacy data. Produces a single structured
// view every display surface renders from, so the bracket cell, the results
// page, the blog and the live card can never disagree on the story.
//
// Legacy tolerance: a stored tie that carries advancingTeam but NO decidedBy
// and NO ET/pen numbers (every result written before this feature) is reported
// as "unknown_tie" — the UI then says a neutral "עלתה: X" and NEVER fabricates
// "penalties". Partial data self-heals (pen numbers present ⇒ penalties, etc.).
export function getResultDecision(result: any): ResultDecision {
  const empty: ResultDecision = {
    played: false, reg: null, decidedBy: DECIDED_BY.REGULAR, isKnockoutTie: false,
    et: null, pens: null, advancingTeam: null, numbersMissing: false,
  };
  if (!result) return empty;
  const home = toIntOrNull(result.homeScore);
  const away = toIntOrNull(result.awayScore);
  if (home == null || away == null) return empty;

  const adv = result.advancingTeam || null;
  const etH = toIntOrNull(result.etHomeScore);
  const etA = toIntOrNull(result.etAwayScore);
  const penH = toIntOrNull(result.penHomeScore);
  const penA = toIntOrNull(result.penAwayScore);
  const et = etH != null && etA != null ? { home: etH, away: etA } : null;
  const pens = penH != null && penA != null ? { home: penH, away: penA } : null;

  // A knockout tie is the only context where we enrich: scores level AND there
  // is a winner / decision metadata. Group ties never carry advancingTeam.
  const isKnockoutTie =
    home === away && (!!adv || !!et || !!pens || !!result.decidedBy);

  let decidedBy: ResultDecision["decidedBy"];
  if (!isKnockoutTie) {
    decidedBy = DECIDED_BY.REGULAR;
  } else if (result.decidedBy === DECIDED_BY.PENALTIES || pens) {
    decidedBy = DECIDED_BY.PENALTIES;
  } else if (result.decidedBy === DECIDED_BY.EXTRA_TIME || et) {
    decidedBy = DECIDED_BY.EXTRA_TIME;
  } else {
    decidedBy = "unknown_tie";
  }

  const numbersMissing =
    (decidedBy === DECIDED_BY.EXTRA_TIME && !et) ||
    (decidedBy === DECIDED_BY.PENALTIES && (!pens || !et)) ||
    decidedBy === "unknown_tie";

  return {
    played: true,
    reg: { home, away },
    decidedBy,
    isKnockoutTie,
    et,
    pens,
    advancingTeam: adv,
    numbersMissing,
  };
}
