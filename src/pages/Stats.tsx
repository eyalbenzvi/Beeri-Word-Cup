import { useState, useMemo, useEffect, useRef } from "react";
import EmptyState from "../components/EmptyState";
import {
  useAllPredictions,
  useMatchResults,
  useSettings,
  useCurrentUser,
} from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getFilteredMatches } from "../utils/matchFiltering";
import { getCachedChampion } from "../utils/bracketCache";
import { normalizeStatus } from "../utils/helpers";
import SimulatorPanel from "../components/SimulatorPanel";
import PageHeader from "../components/PageHeader";
import LoginPrompt from "../components/LoginPrompt";
import { getPlayerDisplayName, getPlayerByEitherName, resolvePlayerList } from "../utils/playerSearch";

const VALID_TABS = new Set(["matches", "teams", "forms"]);

const allMatches = [...groupMatches, ...knockoutMatches];

function Bar({ label, count, total, color = "bg-primary" }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const width = count > 0 ? Math.max(pct, 8) : 0;
  // A narrow fill can't contain the count label without clipping it —
  // below this width the count renders on the track, past the fill's tip.
  const countFitsInside = width >= 25;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-right text-ink font-bold truncate">
        {label}
      </span>
      <div className="relative flex-1 bg-bg-soft rounded-full h-6 overflow-hidden border border-border">
        <div
          className={`${color} h-full rounded-full transition-all duration-500 flex items-center justify-end px-2`}
          style={{ width: `${width}%` }}
        >
          {countFitsInside && (
            <span className="text-white text-xs font-extrabold">{count}</span>
          )}
        </div>
        {!countFitsInside && count > 0 && (
          <span
            className="absolute inset-y-0 flex items-center px-2 text-ink text-xs font-extrabold"
            style={{ insetInlineStart: `${width}%` }}
          >
            {count}
          </span>
        )}
      </div>
      <span className="w-10 text-left text-ink-muted text-xs font-bold">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

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
function MatchPredictions({ forms }) {
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [selectedMatch, setSelectedMatch] = useState(null);

  const filteredMatches = getFilteredMatches(selectedStage, selectedGroup);

  const matchStats = useMemo(() => {
    if (!selectedMatch) return null;
    const match = allMatches.find((m) => m.id === selectedMatch);
    if (!match) return null;

    const preds = forms.map((f) => f.matches?.[selectedMatch]).filter(Boolean);
    const homeWin = preds.filter((p) => p.homeScore > p.awayScore).length;
    const draw = preds.filter((p) => p.homeScore === p.awayScore).length;
    const awayWin = preds.filter((p) => p.homeScore < p.awayScore).length;

    // Most common scores
    const scoreCounts = {};
    preds.forEach((p) => {
      // RTL display: away first so the home digit is read first by Hebrew readers (right side).
      const key = `${p.awayScore}-${p.homeScore}`;
      scoreCounts[key] = (scoreCounts[key] || 0) + 1;
    });
    const topScores = Object.entries(scoreCounts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);

    // Average goals
    const totalGoals = preds.reduce(
      (s, p) => s + (p.homeScore || 0) + (p.awayScore || 0),
      0,
    );
    const avgGoals =
      preds.length > 0 ? (totalGoals / preds.length).toFixed(1) : "0";

    return {
      match,
      preds: preds.length,
      homeWin,
      draw,
      awayWin,
      topScores,
      avgGoals,
    };
  }, [selectedMatch, forms]);

  const home = matchStats?.match
    ? getTeamByCode(matchStats.match.homeTeam)
    : null;
  const away = matchStats?.match
    ? getTeamByCode(matchStats.match.awayTeam)
    : null;

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
          const h = getTeamByCode(m.homeTeam);
          const a = getTeamByCode(m.awayTeam);
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
              {h?.name || "טרם נקבע"} נגד {a?.name || "טרם נקבע"}
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

          {/* 1/X/2 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl p-3 border-2 border-secondary/30" style={{ background: "#F0F9FF" }}>
              <div className="text-xl font-extrabold text-secondary">
                {matchStats.homeWin}
              </div>
              <div className="text-xs text-secondary font-bold">
                1 {home?.name || ""}
              </div>
            </div>
            <div className="rounded-xl p-3 border-2 border-border" style={{ background: "var(--color-bg-soft)" }}>
              <div className="text-xl font-extrabold text-ink-muted">
                {matchStats.draw}
              </div>
              <div className="text-xs text-ink-muted font-bold">
                X תיקו
              </div>
            </div>
            <div className="rounded-xl p-3 border-2 border-danger/30" style={{ background: "var(--color-danger-soft)" }}>
              <div className="text-xl font-extrabold text-danger">
                {matchStats.awayWin}
              </div>
              <div className="text-xs text-danger font-bold">
                2 {away?.name || ""}
              </div>
            </div>
          </div>

          {/* Average goals */}
          <div className="text-center text-sm text-ink-muted font-bold">
            ⚽ ממוצע שערים:{" "}
            <span className="font-extrabold text-primary">
              {matchStats.avgGoals}
            </span>
          </div>

          {/* Top predictions */}
          <div>
            <p className="text-sm font-extrabold text-ink mb-2">
              תוצאות פופולריות:
            </p>
            <div className="space-y-1.5">
              {matchStats.topScores.map(([score, count]) => (
                <Bar
                  key={score}
                  label={score}
                  count={count}
                  total={matchStats.preds}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </StatCard>
  );
}

// ============ CHAMPION DISTRIBUTION ============
function ChampionStats({ forms }) {
  const distribution = useMemo(() => {
    const counts = {};
    forms.forEach((f) => {
      const predictions = f.matches || {};
      const champ = getCachedChampion(predictions);
      if (champ) {
        const name = getTeamByCode(champ)?.name || champ;
        counts[name] = (counts[name] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number));
  }, [forms]);

  if (distribution.length === 0) return null;

  return (
    <StatCard title="מי תהיה האלופה?" icon="🏆">
      <div className="space-y-1.5">
        {distribution.map(([name, count], i) => (
          <Bar
            key={name}
            label={`${i === 0 ? "👑 " : ""}${name}`}
            count={count}
            total={forms.length}
            color={
              i === 0 ? "bg-accent" : i < 3 ? "bg-primary" : "bg-ink-muted"
            }
          />
        ))}
      </div>
    </StatCard>
  );
}

// ============ TOP SCORER DISTRIBUTION ============
function TopScorerStats({ forms, playerList }) {
  const distribution = useMemo(() => {
    // Group by canonical Hebrew label so legacy English values merge with new Hebrew ones.
    const counts = {};
    forms.forEach((f) => {
      const ts = f.topScorer?.trim();
      if (!ts) return;
      const display = getPlayerDisplayName(ts, playerList) || ts;
      counts[display] = (counts[display] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 10);
  }, [forms, playerList]);

  if (distribution.length === 0) return null;

  return (
    <StatCard title="מי יהיה מלך השערים?" icon="⚽">
      <div className="space-y-1.5">
        {distribution.map(([name, count], i) => (
          <Bar
            key={name}
            label={name}
            count={count}
            total={forms.length}
            color={i === 0 ? "bg-accent" : "bg-primary"}
          />
        ))}
      </div>
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

  const playerList = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );

  if (!settings.predictionsLocked) {
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
                    <MatchPredictions forms={submittedForms} />
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
