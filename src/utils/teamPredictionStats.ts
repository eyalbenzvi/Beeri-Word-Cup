// Aggregates submitted-form predictions into per-TEAM tournament-progress
// stats for the admin "מידע ונתונים" tab. For every team it counts, and keeps
// the voters behind, ten parameters:
//   pos1..pos4  — finished 1st/2nd/3rd/4th in its group
//   R32/R16/QF/SF/F — advanced to (reached) that knockout round
//   champion    — predicted as the tournament winner
//
// Reuses the already-tested bracket primitives (calcGroupStandings,
// deriveAdvancingTeams, deriveChampion) via injected resolvers so this module
// stays pure and unit-testable, and so the component can wire them to the
// cached bracket helpers (no recompute per render).
//
// The "advanced to round X" counts are naturally cumulative: a team that
// reached the final also appears in every earlier round's list, because
// deriveAdvancingTeams records a team in each round it actually played.

import type { Voter } from "./matchPredictionStats";

export const TEAM_STAT_KEYS = [
  "pos1",
  "pos2",
  "pos3",
  "pos4",
  "R32",
  "R16",
  "QF",
  "SF",
  "F",
  "champion",
] as const;

export type TeamStatKey = (typeof TEAM_STAT_KEYS)[number];

// Hebrew labels for the parameters, in display order.
export const TEAM_STAT_LABELS: Record<TeamStatKey, string> = {
  pos1: "מקום 1 בבית",
  pos2: "מקום 2 בבית",
  pos3: "מקום 3 בבית",
  pos4: "מקום 4 בבית",
  R32: "עלתה לשלב ה-32",
  R16: "עלתה לשמינית הגמר",
  QF: "עלתה לרבע הגמר",
  SF: "עלתה לחצי הגמר",
  F: "עלתה לגמר",
  champion: "אלופה",
};

type Form = { formId?: string; formName?: string; matches?: Record<string, unknown> };

type AdvancingRounds = {
  R32: string[];
  R16: string[];
  QF: string[];
  SF: string[];
  F: string[];
};

// Injected per-form resolvers. The component supplies cached implementations;
// tests supply trivial stubs.
export type TeamStatResolvers = {
  // Ordered standings per group (index 0 = 1st place). Each entry needs `code`.
  // Return null/undefined for a form whose groups aren't fully predicted (its
  // group positions are then skipped). Submitted forms are always complete.
  standings: (form: Form) => Record<string, { code: string }[]> | null | undefined;
  // Loosely typed so the cached bracket helper's `Record<string, any[]>`
  // return value flows in without a cast; only the R32..F keys are read.
  advancing: (form: Form) => Record<string, string[] | undefined>;
  champion: (form: Form) => string | null;
};

export type TeamStats = Record<TeamStatKey, Voter[]>;

function emptyStats(): TeamStats {
  return {
    pos1: [],
    pos2: [],
    pos3: [],
    pos4: [],
    R32: [],
    R16: [],
    QF: [],
    SF: [],
    F: [],
    champion: [],
  };
}

const ADVANCING_ROUNDS: (keyof AdvancingRounds)[] = ["R32", "R16", "QF", "SF", "F"];

export function aggregateTeamStats(
  forms: Form[],
  resolvers: TeamStatResolvers,
): Record<string, TeamStats> {
  const out: Record<string, TeamStats> = {};
  const ensure = (code: string) => (out[code] ||= emptyStats());

  for (const f of forms) {
    const voter: Voter = {
      formId: f.formId || "",
      name: f.formName || "טופס ללא שם",
    };

    // --- Group finishing positions ---
    const standings = resolvers.standings(f);
    if (standings) {
      for (const group in standings) {
        const arr = standings[group];
        if (!arr) continue;
        for (let i = 0; i < arr.length && i < 4; i++) {
          const code = arr[i]?.code;
          if (!code) continue;
          ensure(code)[`pos${i + 1}` as TeamStatKey].push(voter);
        }
      }
    }

    // --- Knockout rounds reached ---
    const adv = resolvers.advancing(f);
    if (adv) {
      for (const round of ADVANCING_ROUNDS) {
        for (const code of adv[round] || []) {
          if (code) ensure(code)[round].push(voter);
        }
      }
    }

    // --- Champion ---
    const champ = resolvers.champion(f);
    if (champ) ensure(champ).champion.push(voter);
  }

  return out;
}
