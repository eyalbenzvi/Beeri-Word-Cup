import { useMemo, useState } from "react";
import {
  useAllPredictions,
  useMatchResults,
  useUserDirectory,
  useActualBonuses,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
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
import {
  FORM_METRICS,
  FORM_METRIC_MAP,
  FAMILY_TITLE,
  FAMILY_EYEBROW,
  MAX_SELECTED_METRICS,
  computeAdvancingCounts,
  computeMatchupHitsByStage,
  computeExactPositionTeamsByStage,
  computeFormMetricValues,
  sortFormMetricRows,
} from "../utils/formMetrics";
import type { MetricFamily } from "../utils/formMetrics";
import { VoterList, VoterBarList, AdvancingVoterBreakdown } from "./VoterList";
import EmptyState from "./EmptyState";

const METRIC_FAMILIES: MetricFamily[] = ["general", "advancing", "exact", "exactPos"];

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

// Forms analytics table. דירוג/ניקוד/מדויקים/הכרעות come from the leaderboard
// scoring core (so they match the public board); the per-stage team-advancement
// and correct-matchup columns are derived from the BRACKET (same results-gated
// bracket the Results tab uses), via the pure helpers in formMetrics.ts. The
// admin picks up to MAX_SELECTED_METRICS columns and sorts by any of them.
function FormsInsights() {
  const allPredictions = useAllPredictions();
  const results = useMatchResults();
  const users = useUserDirectory();
  const actualBonuses = useActualBonuses();

  const { rankedLeaderboard, formBracketMap } =
    useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  // Default columns: rank (the natural board order) + points. The first
  // selected metric is the initial sort key, per spec.
  const [selected, setSelected] = useState<string[]>(["rank", "points"]);
  const [sortKey, setSortKey] = useState<string>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");

  // The actual bracket, gated only on real results (identical to the Results
  // tab / KnockoutInsights). The per-stage team + matchup metrics read from
  // THIS — not from scoring's advancing derivation — so they reflect the live
  // bracket and don't wait for the whole group stage to finish.
  const actualBracketTeams = useMemo(
    () => getCachedBracket(results, true),
    [results],
  );
  const actualAdvancing = useMemo(
    () => deriveAdvancingTeams(actualBracketTeams),
    [actualBracketTeams],
  );

  const rows = useMemo(() => {
    return rankedLeaderboard.map((entry) => {
      const bracketInfo = formBracketMap[entry.formId];
      const advancingCounts = computeAdvancingCounts(
        bracketInfo?.advancing,
        actualAdvancing,
      );
      const matchupHits = computeMatchupHitsByStage(
        bracketInfo?.predBracket,
        actualBracketTeams,
      );
      const positionHits = computeExactPositionTeamsByStage(
        bracketInfo?.predBracket,
        actualBracketTeams,
      );
      const values = computeFormMetricValues(
        {
          rank: entry.rank,
          totalPoints: entry.totalPoints,
          exactScoreCount: entry.exactScoreCount,
          outcomeCount: entry.outcomeCount,
        },
        advancingCounts,
        matchupHits,
        positionHits,
      );
      const owner = users[entry.userId];
      const ownerName = owner?.firstName
        ? owner.lastName
          ? `${owner.firstName} ${owner.lastName}`
          : owner.firstName
        : owner?.displayName || "";
      return {
        formId: entry.formId,
        formName: entry.formName,
        ownerName,
        rank: entry.rank,
        values,
      };
    });
  }, [rankedLeaderboard, formBracketMap, actualAdvancing, actualBracketTeams, users]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.formName.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const sortedRows = useMemo(
    () => sortFormMetricRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  const selectedDefs = selected.map((k) => FORM_METRIC_MAP[k]);

  const toggleMetric = (key: string) => {
    if (selected.includes(key)) {
      const next = selected.filter((k) => k !== key);
      setSelected(next);
      // Removing the active sort key falls back to the new first column.
      if (sortKey === key && next.length > 0) {
        setSortKey(next[0]);
        setSortDir(FORM_METRIC_MAP[next[0]].dir);
      }
    } else {
      if (selected.length >= MAX_SELECTED_METRICS) return; // hard cap
      const wasEmpty = selected.length === 0;
      setSelected([...selected, key]);
      // First metric selected becomes the sort key (spec: sort by the first).
      if (wasEmpty) {
        setSortKey(key);
        setSortDir(FORM_METRIC_MAP[key].dir);
      }
    }
  };

  const applySort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(FORM_METRIC_MAP[key].dir);
    }
  };

  if (rankedLeaderboard.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="אין טפסים שהוגשו"
        description="הטבלה תופיע כאן ברגע שיוגשו טפסים."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="card-duo space-y-3">
        <div>
          <h3 className="text-base font-extrabold text-ink mb-1">📋 טבלת טפסים</h3>
          <p className="text-xs text-ink-muted font-bold">
            בחרו עד {MAX_SELECTED_METRICS} נתונים להצגה. הקישו על כותרת עמודה כדי
            למיין לפיה.
          </p>
        </div>

        {METRIC_FAMILIES.map((fam) => (
          <div key={fam}>
            <div className="text-2xs font-extrabold text-ink-muted mb-1.5">
              {FAMILY_TITLE[fam]}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FORM_METRICS.filter((m) => m.family === fam).map((m) => {
                const isSel = selected.includes(m.key);
                const capped =
                  !isSel && selected.length >= MAX_SELECTED_METRICS;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMetric(m.key)}
                    disabled={capped}
                    aria-pressed={isSel}
                    className={`chip-duo tap-44 text-xs ${isSel ? "active" : ""} ${
                      capped ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {selected.length >= MAX_SELECTED_METRICS && (
          <p className="text-2xs text-ink-muted font-bold">
            נבחרו {MAX_SELECTED_METRICS} מתוך {MAX_SELECTED_METRICS} — הסירו נתון
            כדי להחליף.
          </p>
        )}
        <p className="text-2xs text-ink-muted font-bold">
          עלו = קבוצות שניחשתם נכון שיגיעו לשלב · משחק = משחקים שניחשתם נכון את
          זהות שתי הקבוצות בהם · מיקום = קבוצות שניחשתם נכון את המיקום המדויק שלהן
          בבראקט
        </p>
      </div>

      {selected.length === 0 ? (
        <EmptyState
          icon="🔧"
          title="לא נבחרו נתונים"
          description={`בחרו עד ${MAX_SELECTED_METRICS} נתונים להצגה בטבלה`}
        />
      ) : (
        <div className="card-duo">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם טופס / משתמש..."
            className="input-duo w-full mb-2"
            maxLength={50}
            aria-label="חיפוש בטבלת הטפסים"
          />
          <p
            className="text-xs text-ink-muted font-bold mb-2"
            aria-live="polite"
          >
            {query.trim()
              ? `מציג ${sortedRows.length} מתוך ${rows.length} טפסים`
              : `${rows.length} טפסים`}
          </p>

          {/* Aligned header strip — each metric cell is a sort control. Sticky
              at the top of #app-scroll (post-#253 there's no nested scroller)
              so the sort arrows + column labels stay visible down a long list.
              top-0/z-20 mirror the app's other rebased in-page sticky bars. */}
          <div
            className="sticky top-0 z-20 flex items-stretch gap-1 border-b-2 border-border pt-1 pb-1.5 mb-1.5"
            style={{ background: "var(--color-card)" }}
          >
            <div className="flex-1 min-w-0 self-end pb-1 text-2xs font-extrabold text-ink-muted">
              טופס
            </div>
            {selectedDefs.map((m) => {
              const active = sortKey === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => applySort(m.key)}
                  aria-pressed={active}
                  title={m.label}
                  aria-label={`מיין לפי ${m.label}${
                    active ? (sortDir === "asc" ? " (עולה)" : " (יורד)") : ""
                  }`}
                  className={`tap-44 w-14 shrink-0 flex flex-col items-center justify-end rounded-lg px-0.5 py-1 cursor-pointer border-none ${
                    active ? "bg-primary-soft" : "bg-transparent"
                  }`}
                >
                  {FAMILY_EYEBROW[m.family] && (
                    <span
                      className={`text-3xs font-bold leading-none ${
                        active ? "text-primary-dark" : "text-ink-light"
                      }`}
                    >
                      {FAMILY_EYEBROW[m.family]}
                    </span>
                  )}
                  <span
                    className={`text-2xs font-extrabold leading-tight text-center ${
                      active ? "text-primary-dark" : "text-ink-muted"
                    }`}
                  >
                    {m.col}
                  </span>
                  <span
                    className={`text-3xs leading-none ${
                      active ? "text-primary" : "text-ink-light"
                    }`}
                    aria-hidden="true"
                  >
                    {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* No nested scroller: the rows flow in the app-shell's single
              inner scroll container (#app-scroll, since #253), like the sibling
              נבחרות/נוקאאוט views. content-visibility keeps long lists cheap. */}
          <div className="space-y-1">
            {sortedRows.map((r) => (
              <div
                key={r.formId}
                className="flex items-center gap-1 py-1.5 border-b border-border last:border-b-0"
                style={{ contentVisibility: "auto", containIntrinsicSize: "0 40px" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink truncate">
                    {r.formName}
                  </div>
                  <div className="text-2xs text-ink-muted truncate">
                    {r.ownerName ? `${r.ownerName} · ` : ""}
                    <bdi>#{r.rank}</bdi>
                  </div>
                </div>
                {selectedDefs.map((m) => {
                  const active = sortKey === m.key;
                  return (
                    <div
                      key={m.key}
                      className={`w-14 shrink-0 text-center text-sm font-extrabold tabular-nums ${
                        active ? "text-primary" : "text-ink"
                      }`}
                    >
                      <bdi>{r.values[m.key]}</bdi>
                    </div>
                  );
                })}
              </div>
            ))}
            {sortedRows.length === 0 && (
              <p className="text-center text-ink-muted py-6 text-sm">
                אין תוצאות
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminInsightsTab() {
  const allPredictions = useAllPredictions();
  const [view, setView] = useState<"teams" | "knockout" | "forms">("teams");

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
          { id: "forms", label: "📋 טפסים" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id as "teams" | "knockout" | "forms")}
            aria-pressed={view === t.id}
            className={`chip-duo flex-shrink-0 ${view === t.id ? "active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "teams" ? (
        <TeamInsights forms={submittedForms} />
      ) : view === "knockout" ? (
        <KnockoutInsights forms={submittedForms} />
      ) : (
        <FormsInsights />
      )}
    </div>
  );
}
