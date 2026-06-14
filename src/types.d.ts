/// <reference types="vite/client" />

// Project-wide JSDoc-friendly type definitions.
// These describe the data shapes that flow through src/store.js and the
// scoring / bracket utilities. They aren't enforced at runtime — but
// editors pick them up via jsconfig.json + JSDoc comments, giving
// type-aware completions and red squiggles for shape drift without a
// TypeScript install.
//
// To use: in any .js / .jsx file, annotate with `@type {Form}` etc.

declare global {

  /** A two-letter team code like "ARG", "ENG", "ISR". */
  type TeamCode = string;

  /** Group letter A..L. */
  type GroupName = string;

  /** Tournament stage. */
  type Stage = "group" | "R32" | "R16" | "QF" | "SF" | "3RD" | "F";

  /** Form FSM. */
  type FormStatus = "draft" | "pending" | "submitted" | "approved";

  /** Daily-summary (blog) FSM — independent of the form FSM. */
  type SummaryStatus = "draft" | "published";

  /** A single match prediction. */
  interface Prediction {
    homeScore: number | null;
    awayScore: number | null;
    /** For knockout ties: which team advances. */
    advancingTeam?: TeamCode | null;
  }

  /** A user's submitted form. */
  interface Form {
    /** `<userId>__<Date.now()>` */
    formId: string;
    userId: string;
    formName: string;
    /** 100..9999 stored as string; isBudgetValid() validates. */
    budgetNumber: string;
    /** Map of matchId -> prediction. */
    matches: Record<string, Prediction>;
    /** Derived per-stage list of advancing teams. */
    advancing: Record<string, TeamCode[]>;
    /** Predicted champion (final winner). */
    champion: TeamCode | null;
    /** Top-scorer player name (Hebrew or English from closed list). */
    topScorer: string;
    status: FormStatus;
    createdAt: string;
    updatedAt?: string;
    submittedAt?: string;
    reopenedAt?: string;
  }

  /** Tournament-wide actual result. */
  interface MatchResult {
    homeScore: number | null;
    awayScore: number | null;
    advancingTeam?: TeamCode | null;
  }

  /** A user record stored under gameData/users.data[uid]. */
  interface UserRecord {
    id: string;
    displayName: string;
    firstName?: string;
    lastName?: string;
    /** Empty / null for phone-auth users. */
    email?: string | null;
    isAdmin?: boolean;
    profileCompleted?: boolean;
    createdAt?: string;
    lastLoginAt?: string;
  }

  /** Top-scorer candidate. */
  interface Player {
    /** Canonical English name (used as topScorer key in stored forms). */
    name: string;
    /** Hebrew display name. */
    nameHe: string;
    /** Team code the player belongs to. */
    team: TeamCode;
    /** Whether the player is a striker (used by AI fill heuristics). */
    isStriker?: boolean;
  }

  /** Result of getCachedBracket(matchPredictions). Keyed by knockout match id. */
  interface BracketEntry {
    home: TeamCode | null;
    away: TeamCode | null;
  }
}

export {};
