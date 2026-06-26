import { useMemo, useState } from "react";
import { useAllPredictions, useMatchResults } from "../hooks/useStore";
import { GROUPS, getTeamByCode } from "../data/teams";
import { knockoutMatches, STAGES } from "../data/matches";
import { normalizeStatus } from "../utils/helpers";
import { deriveAdvancingTeams } from "../utils/bracket";
import {
  getCachedBracket,
  getCachedStandings,
  getCachedChampion,
} from "../utils/bracketCache";
import {
  aggregateTeamStats,
  TEAM_STAT_KEYS,
  TEAM_STAT_LABELS,
} from "../utils/teamPredictionStats";
import { aggregateMatchPredictions } from "../utils/matchPredictionStats";
import type { Voter } from "../utils/matchPredictionStats";
import { VoterList, VoterBarList, AdvancingVoterBreakdown } from "./VoterList";
import EmptyState from "./EmptyState";

// Admin "מידע ונתונים" tab. Two analyses over the submitted forms:
//   1) Team-level: for every team, how many forms placed it 1st–4th in its
//      group, advanced it to each knockout round, or picked it as champion —
//      each parameter expands to the forms behind it.
//   2) Knockout-match-level (only for matches already DETERMINED by real
//      results): how many forms predicted the match's exact pairing, and the
//      distribution of predicted scores among those forms.
//
// All heavy computation reuses the cached bracket helpers and the same pure
// aggregators / voter-list UI the public Stats page uses — no duplication.

// Per-parameter accent colours, mirroring the tournament-progress palette.
const STAT_COLORS: Record<string, string> = {
  pos1: "bg-accent",
  pos2: "bg-primary",
  pos3: "bg-primary",
  pos4: "bg-ink-muted",
  R32: "bg-primary",
  R16: "bg-primary",
  QF: "bg-primary",
  SF: "bg-secondary",
  F: "bg-secondary",
  champion: "bg-accent",
};

function TeamInsights({ forms }: { forms: any[] }) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const teamStats = useMemo(
    () =>
      aggregateTeamStats(forms, {
        standings: (f) => getCachedStandings(f.matches || {}),
        advancing: (f) => deriveAdvancingTeams(getCachedBracket(f.matches || {})),
        champion: (f) => getCachedChampion(f.matches || {}),
      }),
    [forms],
  );

  const items = useMemo(() => {
    if (!selectedTeam) return [];
    const stats = teamStats[selectedTeam];
    return TEAM_STAT_KEYS.map((key) => ({
      key,
      label: TEAM_STAT_LABELS[key],
      voters: stats?.[key] || [],
      color: STAT_COLORS[key],
    }));
  }, [selectedTeam, teamStats]);

  const selectedTeamObj = selectedTeam ? getTeamByCode(selectedTeam) : null;

  return (
    <div className="space-y-3">
      {/* Team picker — grouped by group letter */}
      <div className="card-duo">
        <h3 className="text-base font-extrabold text-ink mb-1">🏳️ בחירת נבחרת</h3>
        <p className="text-xs text-ink-muted font-bold mb-3">
          בחרו נבחרת כדי לראות כמה טפסים ניחשו כל פרמטר.
        </p>
        <div className="space-y-2">
          {Object.entries(GROUPS).map(([group, teams]) => (
            <div key={group} className="flex items-center gap-2">
              <span className="w-5 text-xs font-extrabold text-ink-muted shrink-0">
                {group}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {teams.map((t) => (
                  <button
                    key={t.code}
                    onClick={() => setSelectedTeam(t.code)}
                    aria-pressed={selectedTeam === t.code}
                    className={`text-xs font-bold py-1.5 px-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedTeam === t.code
                        ? "bg-primary text-white border-primary-dark"
                        : "bg-white text-ink border-border hover:border-border-strong"
                    }`}
                  >
                    {t.flag} {t.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected team breakdown */}
      {selectedTeamObj && (
        <div className="card-duo">
          <h3 className="text-base font-extrabold text-ink mb-1">
            {selectedTeamObj.flag} {selectedTeamObj.name}
          </h3>
          <p className="text-xs text-ink-muted font-bold mb-3">
            לחצו על פרמטר כדי לראות מי ניחש אותו · מתוך {forms.length} טפסים
          </p>
          <VoterBarList items={items} total={forms.length} />
        </div>
      )}
    </div>
  );
}

function KnockoutInsights({ forms }: { forms: any[] }) {
  const results = useMatchResults();
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);

  // Bracket derived from REAL results (gated): only matches with both teams
  // resolved are "determined" and shown here.
  const actualBracketTeams = useMemo(
    () => getCachedBracket(results, true),
    [results],
  );

  const determinedMatches = useMemo(
    () =>
      knockoutMatches.filter((m) => {
        const bt = actualBracketTeams[m.id];
        return bt?.home && bt?.away;
      }),
    [actualBracketTeams],
  );

  const matchStats = useMemo(() => {
    if (!selectedMatch) return null;
    const bt = actualBracketTeams[selectedMatch];
    if (!bt?.home || !bt?.away) return null;
    const stats = aggregateMatchPredictions(
      forms,
      selectedMatch,
      actualBracketTeams,
      (form) => getCachedBracket(form.matches || {}),
    );
    // Forms that predicted this exact pairing (any score) = "guessed the match
    // existence". For submitted (complete) forms this is the union of the
    // outcome buckets.
    const existenceVoters: Voter[] = [
      ...stats.outcomeVoters.home,
      ...stats.outcomeVoters.draw,
      ...stats.outcomeVoters.away,
    ];
    return { stats, existenceVoters, home: bt.home, away: bt.away };
  }, [selectedMatch, forms, actualBracketTeams]);

  const scoreItems = useMemo(() => {
    if (!matchStats) return [];
    // No per-score colour ranking — mirrors the public Stats score bars and
    // avoids painting every score tied for the lead with the "winner" accent.
    return matchStats.stats.scores.map(([score]) => ({
      key: score,
      label: score,
      voters: matchStats.stats.scoreVoters[score] || [],
    }));
  }, [matchStats]);

  if (determinedMatches.length === 0) {
    return (
      <EmptyState
        icon="🧩"
        title="אין עדיין משחקי נוקאאוט שנקבעו"
        description="הנתונים יופיעו כאן ברגע שיוזנו תוצאות שמרכיבות משחקי נוקאאוט."
      />
    );
  }

  const existenceId = "existence";

  return (
    <div className="space-y-3">
      <div className="card-duo">
        <h3 className="text-base font-extrabold text-ink mb-1">
          🧩 משחקי נוקאאוט שנקבעו
        </h3>
        <p className="text-xs text-ink-muted font-bold mb-3">
          בחרו משחק כדי לראות כמה ניחשו אותו ואילו תוצאות נוחשו.
        </p>
        <div className="space-y-1.5">
          {determinedMatches.map((m) => {
            const bt = actualBracketTeams[m.id];
            const h = getTeamByCode(bt.home);
            const a = getTeamByCode(bt.away);
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMatch(m.id)}
                aria-pressed={selectedMatch === m.id}
                className={`w-full text-sm py-2.5 px-3 rounded-xl border-2 cursor-pointer text-right font-bold transition-all ${
                  selectedMatch === m.id
                    ? "bg-primary text-white border-primary-dark"
                    : "bg-white text-ink border-border hover:border-border-strong"
                }`}
              >
                <span className="text-xs font-extrabold opacity-70">
                  {STAGES[m.stage] || m.stage}
                </span>{" "}
                · {h?.name || bt.home} נגד {a?.name || bt.away}
              </button>
            );
          })}
        </div>
      </div>

      {matchStats && (
        <div className="card-duo">
          <h3 className="text-base font-extrabold text-ink mb-1">
            {getTeamByCode(matchStats.home)?.name || matchStats.home} נגד{" "}
            {getTeamByCode(matchStats.away)?.name || matchStats.away}
          </h3>

          {/* Match-existence count + voters */}
          <div className="mt-3 mb-4">
            <p className="text-sm font-extrabold text-ink mb-2">
              ניחשו את קיום המשחק (שתי הקבוצות במדויק):
            </p>
            <VoterBarList
              items={[
                {
                  key: existenceId,
                  label: "ניחשו את המשחק",
                  voters: matchStats.existenceVoters,
                  color: "bg-secondary",
                },
              ]}
              total={forms.length}
            />
          </div>

          {/* Tie predictors split by the team they advance on penalties */}
          {matchStats.stats.draw > 0 && (
            <div className="border-t-2 border-border pt-3 mb-4">
              <p className="text-sm font-extrabold text-ink mb-2">
                תיקו — מי עולה? ({matchStats.stats.draw})
              </p>
              <AdvancingVoterBreakdown voters={matchStats.stats.outcomeVoters.draw} />
            </div>
          )}

          {/* Predicted-score distribution among those forms */}
          <div className="border-t-2 border-border pt-3">
            <p className="text-sm font-extrabold text-ink mb-1">
              התוצאות שנוחשו ({matchStats.stats.scores.length}):
            </p>
            {matchStats.stats.scores.length === 0 ? (
              <VoterList voters={[]} />
            ) : (
              <>
                <p className="text-xs text-ink-muted font-bold mb-2">
                  לחצו על תוצאה כדי לראות מי ניחש אותה
                </p>
                <VoterBarList items={scoreItems} total={matchStats.stats.preds} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminInsightsTab() {
  const allPredictions = useAllPredictions();
  const [view, setView] = useState<"teams" | "knockout">("teams");

  const submittedForms = useMemo(
    () =>
      Object.entries(allPredictions)
        .filter(([, f]) => normalizeStatus((f as any).status) === "submitted")
        .map(([formId, f]) => ({ formId, ...(f as any) })),
    [allPredictions],
  );

  if (submittedForms.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="אין טפסים שהוגשו"
        description="המידע יופיע כאן ברגע שיוגשו טפסים."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[
          { id: "teams", label: "🏳️ נבחרות" },
          { id: "knockout", label: "🧩 נוקאאוט" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id as "teams" | "knockout")}
            aria-pressed={view === t.id}
            className={`chip-duo flex-shrink-0 ${view === t.id ? "active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "teams" ? (
        <TeamInsights forms={submittedForms} />
      ) : (
        <KnockoutInsights forms={submittedForms} />
      )}
    </div>
  );
}
