import { useState, useMemo, useEffect, useRef } from "react";
import EmptyState from "../components/EmptyState";
import {
  useAllPredictions,
  useMatchResults,
  useSettings,
  useSettingsServerConfirmed,
  useCurrentUser,
} from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getFilteredMatches } from "../utils/matchFiltering";
import { getCachedChampion, getCachedBracket } from "../utils/bracketCache";
import { r32SlotLabel } from "../utils/matchSlot";
import { normalizeStatus } from "../utils/helpers";
import SimulatorPanel from "../components/SimulatorPanel";
import PageHeader from "../components/PageHeader";
import LoginPrompt from "../components/LoginPrompt";
import { getPlayerDisplayName, getPlayerByEitherName, resolvePlayerList } from "../utils/playerSearch";
import { aggregateMatchPredictions } from "../utils/matchPredictionStats";
import type { Voter, BracketEntry } from "../utils/matchPredictionStats";
import { Bar, VoterList, VoterBarList } from "../components/VoterList";

const VALID_TABS = new Set(["matches", "teams", "forms"]);

const allMatches = [...groupMatches, ...knockoutMatches];

function StatCard({ title, icon, children }) {
  return (
    <div className="card-duo">
      <h3 className="text-base font-extrabold text-ink mb-3">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

// ============ MATCH PREDICTIONS SECTION ============
function MatchPredictions({ forms, actualBracketTeams }: { forms: any[]; actualBracketTeams?: Record<string, BracketEntry> }) {
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [selectedMatch, setSelectedMatch] = useState(null);
  // Which result/outcome accordion is open. ids: `score:${key}` or
  // `outcome:home|draw|away`. Reset whenever the selected match changes.
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(null);
  }, [selectedMatch]);

  const filteredMatches = getFilteredMatches(selectedStage, selectedGroup);

  const matchStats = useMemo(() => {
    if (!selectedMatch) return null;
    const match = allMatches.find((m) => m.id === selectedMatch);
    if (!match) return null;
    return { match, ...aggregateMatchPredictions(forms, selectedMatch, actualBracketTeams, (form) => getCachedBracket(form.matches || {})) };
  }, [selectedMatch, forms, actualBracketTeams]);

  // Resolve the selected match's teams the same way the list does: knockout
  // slots come from the actual (results-gated) bracket so a qualified team
  // shows its real name, falling back to the raw fixture for group matches.
  const selectedDerived = matchStats?.match
    ? matchStats.match.stage !== "group" && actualBracketTeams?.[matchStats.match.id]
      ? {
          home: actualBracketTeams[matchStats.match.id].home,
          away: actualBracketTeams[matchStats.match.id].away,
        }
      : { home: matchStats.match.homeTeam, away: matchStats.match.awayTeam }
    : { home: null, away: null };
  const home = getTeamByCode(selectedDerived.home);
  const away = getTeamByCode(selectedDerived.away);

  return (
    <StatCard title="ניחושים למשחק" icon="🔍">
      {/* Stage selector */}
      <div className="flex overflow-x-auto gap-2 mb-3 pb-1 -mx-1 px-1">
        {Object.entries(STAGES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setSelectedStage(key);
              setSelectedMatch(null);
            }}
            className={`chip-duo flex-shrink-0 ${selectedStage === key ? "active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Group selector */}
      {selectedStage === "group" && (
        <div className="flex flex-wrap gap-1 mb-3 justify-center">
          {Object.keys(GROUPS).map((g) => (
            <button
              key={g}
              onClick={() => {
                setSelectedGroup(g);
                setSelectedMatch(null);
              }}
              className={`w-8 h-8 rounded-full text-xs font-extrabold border-2 cursor-pointer ${
                selectedGroup === g
                  ? "bg-primary text-white border-primary-dark"
                  : "bg-white text-ink-muted border-border"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Match list */}
      <div className="space-y-1.5 mb-3">
        {filteredMatches.map((m) => {
          // Knockout slots resolve from the ACTUAL bracket (gated on results),
          // so a team that already qualified for the slot shows its real name
          // rather than the "1A" placeholder — matching the Results tab. The
          // r32SlotLabel fallback only kicks in while the slot is undecided.
          const derived =
            m.stage !== "group" && actualBracketTeams?.[m.id]
              ? { home: actualBracketTeams[m.id].home, away: actualBracketTeams[m.id].away }
              : { home: m.homeTeam, away: m.awayTeam };
          const h = getTeamByCode(derived.home);
          const a = getTeamByCode(derived.away);
          return (
            <button
              key={m.id}
              onClick={() => setSelectedMatch(m.id)}
              className={`w-full text-sm py-2.5 px-3 rounded-xl border-2 cursor-pointer text-right font-bold transition-all ${
                selectedMatch === m.id
                  ? "bg-primary text-white border-primary-dark"
                  : "bg-white text-ink border-border hover:border-border-strong"
              }`}
            >
              {h?.name || r32SlotLabel(m, "home") || "טרם נקבע"} נגד{" "}
              {a?.name || r32SlotLabel(m, "away") || "טרם נקבע"}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      {matchStats && (
        <div className="border-t-2 border-border pt-3 space-y-3">
          <p className="text-sm text-ink-muted text-center font-bold">
            {matchStats.preds} ניחושים
          </p>

          {/* 1/X/2 — click a card to see who predicted that outcome */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <button
              type="button"
              onClick={() => setExpanded(expanded === "outcome:home" ? null : "outcome:home")}
              aria-expanded={expanded === "outcome:home"}
              className={`rounded-xl p-3 border-2 cursor-pointer transition-all ${expanded === "outcome:home" ? "border-secondary ring-2 ring-secondary/40" : "border-secondary/30"}`}
              style={{ background: "var(--color-secondary-soft)" }}
            >
              <div className="text-xl font-extrabold text-secondary">
                {matchStats.homeWin}
              </div>
              <div className="text-xs text-secondary font-bold">
                1 {home?.name || (matchStats?.match ? r32SlotLabel(matchStats.match, "home") : "") || ""}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(expanded === "outcome:draw" ? null : "outcome:draw")}
              aria-expanded={expanded === "outcome:draw"}
              className={`rounded-xl p-3 border-2 cursor-pointer transition-all ${expanded === "outcome:draw" ? "border-border-strong ring-2 ring-border-strong/40" : "border-border"}`}
              style={{ background: "var(--color-bg-soft)" }}
            >
              <div className="text-xl font-extrabold text-ink-muted">
                {matchStats.draw}
              </div>
              <div className="text-xs text-ink-muted font-bold">
                X תיקו
              </div>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(expanded === "outcome:away" ? null : "outcome:away")}
              aria-expanded={expanded === "outcome:away"}
              className={`rounded-xl p-3 border-2 cursor-pointer transition-all ${expanded === "outcome:away" ? "border-danger ring-2 ring-danger/40" : "border-danger/30"}`}
              style={{ background: "var(--color-danger-soft)" }}
            >
              <div className="text-xl font-extrabold text-danger">
                {matchStats.awayWin}
              </div>
              <div className="text-xs text-danger font-bold">
                2 {away?.name || (matchStats?.match ? r32SlotLabel(matchStats.match, "away") : "") || ""}
              </div>
            </button>
          </div>
          {expanded === "outcome:home" && (
            <VoterList voters={matchStats.outcomeVoters.home} />
          )}
          {expanded === "outcome:draw" && (
            <VoterList voters={matchStats.outcomeVoters.draw} />
          )}
          {expanded === "outcome:away" && (
            <VoterList voters={matchStats.outcomeVoters.away} />
          )}

          {/* Average goals */}
          <div className="text-center text-sm text-ink-muted font-bold">
            ⚽ ממוצע שערים:{" "}
            <span className="font-extrabold text-primary">
              {matchStats.avgGoals}
            </span>
          </div>

          {/* All predicted scores — click a result to see who predicted it */}
          <div>
            <p className="text-sm font-extrabold text-ink mb-1">
              כל התוצאות שנוחשו ({matchStats.scores.length}):
            </p>
            <p className="text-xs text-ink-muted font-bold mb-2">
              לחצו על תוצאה כדי לראות מי ניחש אותה
            </p>
            <div className="space-y-1.5">
              {matchStats.scores.map(([score, count]) => {
                const id = `score:${score}`;
                const open = expanded === id;
                return (
                  <div key={score}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : id)}
                      aria-expanded={open}
                      className="w-full flex items-center gap-1.5 cursor-pointer"
                    >
                      <span
                        className={`text-ink-muted text-xs transition-transform ${open ? "rotate-180" : ""}`}
                      >
                        ▾
                      </span>
                      <div className="flex-1">
                        <Bar
                          label={score}
                          count={count}
                          total={matchStats.preds}
                        />
                      </div>
                    </button>
                    {open && <VoterList voters={matchStats.scoreVoters[score] || []} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </StatCard>
  );
}

// ============ CHAMPION DISTRIBUTION ============
function ChampionStats({ forms }) {
  const items = useMemo(() => {
    // Track the voters per champion so each bar can reveal who predicted it.
    const voters: Record<string, Voter[]> = {};
    forms.forEach((f) => {
      const champ = getCachedChampion(f.matches || {});
      if (champ) {
        const name = getTeamByCode(champ)?.name || champ;
        (voters[name] ||= []).push({ formId: f.formId || "", name: f.formName || "טופס ללא שם" });
      }
    });
    return Object.entries(voters)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([name, vts], i) => ({
        key: name,
        label: `${i === 0 ? "👑 " : ""}${name}`,
        voters: vts,
        color: i === 0 ? "bg-accent" : i < 3 ? "bg-primary" : "bg-ink-muted",
      }));
  }, [forms]);

  if (items.length === 0) return null;

  return (
    <StatCard title="מי תהיה האלופה?" icon="🏆">
      <p className="text-xs text-ink-muted font-bold mb-2">
        לחצו על קבוצה כדי לראות מי ניחש אותה
      </p>
      <VoterBarList items={items} total={forms.length} />
    </StatCard>
  );
}

// ============ TOP SCORER DISTRIBUTION ============
function TopScorerStats({ forms, playerList }) {
  const items = useMemo(() => {
    // Group by canonical Hebrew label so legacy English values merge with new
    // Hebrew ones, and track the voters so each bar can reveal who predicted it.
    const voters: Record<string, Voter[]> = {};
    forms.forEach((f) => {
      const ts = f.topScorer?.trim();
      if (!ts) return;
      const display = getPlayerDisplayName(ts, playerList) || ts;
      (voters[display] ||= []).push({ formId: f.formId || "", name: f.formName || "טופס ללא שם" });
    });
    return Object.entries(voters)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([name, vts], i) => ({
        key: name,
        label: name,
        voters: vts,
        color: i === 0 ? "bg-accent" : "bg-primary",
      }));
  }, [forms, playerList]);

  if (items.length === 0) return null;

  return (
    <StatCard title="מי יהיה מלך השערים?" icon="⚽">
      <p className="text-xs text-ink-muted font-bold mb-2">
        לחצו על שחקן כדי לראות מי ניחש אותו
      </p>
      <VoterBarList items={items} total={forms.length} />
    </StatCard>
  );
}

// ============ GENERAL STATS ============
function GeneralStats({ forms, results }) {
  const stats = useMemo(() => {
    let totalGoals = 0, totalMatches = 0, draws = 0;
    for (const f of forms) {
      for (const pAny of Object.values(f.matches || {})) {
        const p = pAny as any;
        if (p?.homeScore != null) {
          totalGoals += (p.homeScore || 0) + (p.awayScore || 0);
          totalMatches++;
          if (p.homeScore === p.awayScore) draws++;
        }
      }
    }
    const avgGoals = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(2) : "0";
    const drawPct = totalMatches > 0 ? ((draws / totalMatches) * 100).toFixed(1) : "0";

    return {
      totalForms: forms.length,
      playedResults: Object.keys(results).length,
      totalPossible: allMatches.length,
      avgGoals,
      drawPct,
    };
  }, [forms, results]);

  return (
    <StatCard title="מספרים" icon="📊">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3 text-center border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
          <div className="text-3xl font-extrabold text-primary-dark">
            {stats.totalForms}
          </div>
          <div className="text-xs text-ink-muted font-bold">
            טפסים הוגשו
          </div>
        </div>
        <div className="rounded-xl p-3 text-center border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
          <div className="text-3xl font-extrabold text-primary-dark">
            {stats.playedResults}/{stats.totalPossible}
          </div>
          <div className="text-xs text-ink-muted font-bold">
            משחקים שוחקו
          </div>
        </div>
        <div className="rounded-xl p-3 text-center border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
          <div className="text-3xl font-extrabold text-primary-dark">
            {stats.avgGoals}
          </div>
          <div className="text-xs text-ink-muted font-bold">
            ממוצע שערים לניחוש
          </div>
        </div>
        <div className="rounded-xl p-3 text-center border-2 border-primary/30" style={{ background: "var(--color-primary-soft)" }}>
          <div className="text-3xl font-extrabold text-primary-dark">
            {stats.drawPct}%
          </div>
          <div className="text-xs text-ink-muted font-bold">
            ניחושי תיקו
          </div>
        </div>
      </div>
    </StatCard>
  );
}

// ============ SEARCH ============
function SearchStats({ forms, playerList, externalQuery }: { forms: any; playerList: any; externalQuery?: string }) {
  // When `externalQuery` is provided (driven from the global Stats search
  // field), this component skips its own input and reads the query from
  // props. This lets the global field act as the canonical search UI while
  // keeping result rendering co-located with the rest of the analysis.
  const [internalQuery, setInternalQuery] = useState("");
  const query = externalQuery !== undefined ? externalQuery : internalQuery;
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const searchResults = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q || q.length < 2) return null;

    const results = [];

    // Search by team name — who predicted this team as champion?
    const teamMatches = [];
    forms.forEach((f) => {
      const predictions = f.matches || {};
      const champ = getCachedChampion(predictions);
      const champName = champ ? getTeamByCode(champ)?.name || "" : "";
      if (champName.toLowerCase().includes(q)) {
        teamMatches.push({
          formName: f.formName,
          type: "אלופה",
          value: champName,
        });
      }
      if (f.topScorer) {
        const raw = String(f.topScorer);
        const display = getPlayerDisplayName(raw, playerList) || raw;
        const hit =
          raw.toLowerCase().includes(q) ||
          display.toLowerCase().includes(q) ||
          // Also allow finding by the other language: if stored Hebrew, search English name too.
          (() => {
            const p = getPlayerByEitherName(raw, playerList);
            return p ? `${p.name} ${p.nameHe || ""}`.toLowerCase().includes(q) : false;
          })();
        if (hit) {
          teamMatches.push({
            formName: f.formName,
            type: "מלך שערים",
            value: display,
          });
        }
      }
    });
    if (teamMatches.length > 0) {
      results.push({
        title: `${teamMatches.length} טפסים מכילים "${query}"`,
        items: teamMatches.slice(0, 15),
      });
    }

    // Search by score
    const scoreMatch = q.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
    if (scoreMatch) {
      const [, h, a] = scoreMatch;
      let count = 0;
      forms.forEach((f) => {
        Object.values(f.matches || {}).forEach((pAny) => {
          const p = pAny as any;
          if (p?.homeScore === parseInt(h) && p?.awayScore === parseInt(a))
            count++;
        });
      });
      results.push({
        title: `תוצאה ${h}-${a} נוחשה ${count} פעמים`,
        items: [],
      });
    }

    // Search form names
    const formMatches = forms.filter((f) =>
      f.formName?.toLowerCase().includes(q),
    );
    if (formMatches.length > 0 && !teamMatches.length) {
      results.push({
        title: `${formMatches.length} טפסים נמצאו`,
        items: formMatches.map((f) => ({
          formName: f.formName,
          type: "טופס",
          value: "",
        })),
      });
    }

    return results.length > 0
      ? results
      : [{ title: "לא נמצאו תוצאות", items: [] }];
  }, [debouncedQuery, forms]);

  const showInternalInput = externalQuery === undefined;

  return (
    <StatCard title="חיפוש חופשי" icon="💬">
      {showInternalInput && (
        <input
          type="text"
          value={internalQuery}
          onChange={(e) => setInternalQuery(e.target.value)}
          placeholder='חפש קבוצה, שחקן, שם טופס או תוצאה (לדוגמה: "ברזיל", "מבאפה", "2-1")'
          className="input-duo mb-3"
        />
      )}
      {searchResults && (
        <div className="space-y-3">
          {searchResults.map((group, i) => (
            <div key={group.title || i}>
              <p className="text-sm font-extrabold text-ink mb-2">
                {group.title}
              </p>
              {group.items.length > 0 && (
                <div className="space-y-1">
                  {group.items.map((item, j) => (
                    <div
                      key={`${item.formName}-${item.type}-${item.value || j}`}
                      className="flex justify-between text-xs rounded-xl px-3 py-2 border-2 border-border"
                      style={{ background: "var(--color-bg-soft)" }}
                    >
                      <span className="text-ink-muted font-bold">{item.type}</span>
                      <span className="font-extrabold text-ink">
                        {item.formName} {item.value && `— ${item.value}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </StatCard>
  );
}

// ============ MAIN PAGE ============
export default function Stats() {
  const allPredictions = useAllPredictions();
  const results = useMatchResults();
  const settings = useSettings();
  // Gate the lock screen on SERVER-confirmed settings so a stale pre-lock
  // offline-cache read doesn't falsely show "data revealed when matches
  // start" once the tournament is running. See cache.ts / Leaderboard.tsx.
  const settingsConfirmed = useSettingsServerConfirmed();
  const { user: currentUser } = useCurrentUser();
  const { params, setParamsPatch, navigate } = useNavigation();
  // Tab is URL-driven; falls back to "matches" for fresh entries or invalid
  // values. Legacy `?tab=search` users land on the matches tab — the global
  // search field at the top still works.
  const activeTab = VALID_TABS.has(params?.tab as string)
    ? (params!.tab as string)
    : "matches";
  // Top-of-page search: when the user is typing, the query takes over the
  // page and renders SearchStats below the input. Empty string returns to
  // tab view.
  const [searchQuery, setSearchQuery] = useState("");

  // All hooks must run on every render before any early return — React's
  // hook-call-order invariant. Otherwise toggling `predictionsLocked` swaps
  // the hook count between renders and React throws.
  const submittedForms = useMemo(() => {
    return Object.entries(allPredictions)
      .filter(([, fAny]) => normalizeStatus((fAny as any).status) === "submitted")
      .map(([formId, fAny]) => ({ formId, ...(fAny as any) }));
  }, [allPredictions]);

  const actualBracketTeams = useMemo(() => getCachedBracket(results, true), [results]);

  const playerList = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );

  if (settingsConfirmed && !settings.predictionsLocked) {
    return (
      <>
        <div className="text-center py-16 card-duo-lg max-w-md mx-auto">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-extrabold text-ink mb-2">סטטיסטיקות</h2>
          <p className="text-sm text-ink-muted font-medium">הנתונים יתגלו כשהמשחקים יתחילו.</p>
        </div>
        {!currentUser && (
          <LoginPrompt
            title="עדיין לא הצטרפת?"
            subtitle="התחבר עכשיו וצור טפסים — הסטטיסטיקות ייפתחו בשריקת הפתיחה"
          />
        )}
      </>
    );
  }

  const isSearching = searchQuery.trim().length > 0;
  const isGuest = !currentUser;

  return (
    <div>
      <PageHeader
        eyebrow="המספרים מאחורי הטפסים"
        title="סטטיסטיקות"
        subtitle={submittedForms.length > 0 ? `${submittedForms.length} טפסים הוגשו` : undefined}
      />
      {isGuest && (
        <LoginPrompt
          variant="banner"
          title="התחבר לחוויה מלאה"
          subtitle="הסטטיסטיקות גלויות לכולם. התחבר כדי להגיש טופס משלך."
        />
      )}


      {submittedForms.length === 0 ? (
        <EmptyState icon="📊" title="אין מספיק נתונים להצגת סטטיסטיקות" />
      ) : (
        <>
          {/* Global search field — replaces the per-tab "search" tab */}
          <div className="card-duo mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='חפש קבוצה, שחקן, שם טופס או תוצאה (לדוגמה: "ברזיל", "מבאפה", "2-1")'
              className="input-duo"
              aria-label="חיפוש חופשי"
            />
          </div>

          {!isSearching && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 items-center">
              {[
                { id: "matches", label: "📊 משחקים" },
                { id: "teams", label: "🏆 קבוצות" },
                { id: "forms", label: "📋 טפסים" },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setParamsPatch({ tab: tab.id === "matches" ? null : tab.id })}
                  aria-pressed={activeTab === tab.id}
                  className={`chip-duo flex-shrink-0 ${activeTab === tab.id ? "active" : ""}`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                onClick={() => navigate("simulator")}
                className="chip-duo flex-shrink-0"
                style={{ marginInlineStart: "auto" }}
              >
                🎮 סימולטור
              </button>
            </div>
          )}

          <div className="space-y-3">
            {isSearching ? (
              <SearchStats
                forms={submittedForms}
                playerList={playerList}
                externalQuery={searchQuery}
              />
            ) : (
              <>
                {activeTab === "matches" && (
                  <>
                    <GeneralStats forms={submittedForms} results={results} />
                    <MatchPredictions forms={submittedForms} actualBracketTeams={actualBracketTeams} />
                  </>
                )}
                {activeTab === "teams" && (
                  <>
                    <ChampionStats forms={submittedForms} />
                    <TopScorerStats forms={submittedForms} playerList={playerList} />
                  </>
                )}
                {activeTab === "forms" && (
                  <GeneralStats forms={submittedForms} results={results} />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
