import { useState, useMemo } from "react";
import { useAllPredictions, useMatchResults, useSettings } from "../hooks/useStore";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getCachedChampion } from "../utils/bracketCache";
import { normalizeStatus } from "../utils/helpers";

const allMatches = [...groupMatches, ...knockoutMatches];

function Bar({ label, count, total, color = "bg-primary" }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-right text-gray-600 truncate font-medium">
        {label}
      </span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div
          className={`${color} h-5 rounded-full transition-all duration-500 flex items-center justify-end px-2`}
          style={{ width: `${count > 0 ? Math.max(pct, 8) : 0}%` }}
        >
          <span className="text-white text-[11px] font-bold">{count}</span>
        </div>
      </div>
      <span className="w-10 text-left text-gray-400 text-[11px]">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function StatCard({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-bold text-primary mb-3">
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

  const filteredMatches =
    selectedStage === "group"
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

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
      const key = `${p.homeScore}-${p.awayScore}`;
      scoreCounts[key] = (scoreCounts[key] || 0) + 1;
    });
    const topScores = Object.entries(scoreCounts)
      .sort((a, b) => b[1] - a[1])
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
      <div className="flex overflow-x-auto gap-1.5 mb-3 pb-1 -mx-1 px-1">
        {Object.entries(STAGES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setSelectedStage(key);
              setSelectedMatch(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border-none cursor-pointer transition-all flex-shrink-0 ${
              selectedStage === key
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-500"
            }`}
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
              className={`w-7 h-7 rounded-full text-[11px] font-bold border-none cursor-pointer ${
                selectedGroup === g
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Match list */}
      <div className="space-y-1 mb-3">
        {filteredMatches.map((m) => {
          const h = getTeamByCode(m.homeTeam);
          const a = getTeamByCode(m.awayTeam);
          return (
            <button
              key={m.id}
              onClick={() => setSelectedMatch(m.id)}
              className={`w-full text-xs py-2 px-3 rounded-xl border-none cursor-pointer text-right transition-all ${
                selectedMatch === m.id
                  ? "bg-primary text-white"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {h?.name || "טרם נקבע"} נגד {a?.name || "טרם נקבע"}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      {matchStats && (
        <div className="border-t border-gray-100 pt-3 space-y-3">
          <p className="text-xs text-gray-400 text-center">
            {matchStats.preds} ניחושים
          </p>

          {/* 1/X/2 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-blue-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-blue-600">
                {matchStats.homeWin}
              </div>
              <div className="text-[11px] text-blue-400 font-medium">
                1 {home?.name || ""}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-gray-500">
                {matchStats.draw}
              </div>
              <div className="text-[11px] text-gray-400 font-medium">
                X תיקו
              </div>
            </div>
            <div className="bg-red-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-red-500">
                {matchStats.awayWin}
              </div>
              <div className="text-[11px] text-red-400 font-medium">
                2 {away?.name || ""}
              </div>
            </div>
          </div>

          {/* Average goals */}
          <div className="text-center text-xs text-gray-500">
            ⚽ ממוצע שערים:{" "}
            <span className="font-bold text-primary">
              {matchStats.avgGoals}
            </span>
          </div>

          {/* Top predictions */}
          <div>
            <p className="text-[11px] font-bold text-gray-500 mb-1.5">
              תוצאות פופולריות:
            </p>
            <div className="space-y-1">
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
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
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
              i === 0 ? "bg-yellow-500" : i < 3 ? "bg-primary" : "bg-gray-400"
            }
          />
        ))}
      </div>
    </StatCard>
  );
}

// ============ TOP SCORER DISTRIBUTION ============
function TopScorerStats({ forms }) {
  const distribution = useMemo(() => {
    const counts = {};
    forms.forEach((f) => {
      const ts = f.topScorer?.trim();
      if (ts) counts[ts] = (counts[ts] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [forms]);

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
            color={i === 0 ? "bg-green-500" : "bg-primary"}
          />
        ))}
      </div>
    </StatCard>
  );
}

// ============ GENERAL STATS ============
function GeneralStats({ forms, results }) {
  const stats = useMemo(() => {
    let totalGoals = 0,
      totalMatches = 0;
    forms.forEach((f) => {
      Object.values(f.matches || {}).forEach((p) => {
        if (p?.homeScore != null) {
          totalGoals += (p.homeScore || 0) + (p.awayScore || 0);
          totalMatches++;
        }
      });
    });
    const avgGoals =
      totalMatches > 0 ? (totalGoals / totalMatches).toFixed(2) : "0";

    // Most predicted draw
    let draws = 0;
    forms.forEach((f) => {
      Object.values(f.matches || {}).forEach((p) => {
        if (p?.homeScore != null && p.homeScore === p.awayScore) draws++;
      });
    });
    const drawPct =
      totalMatches > 0 ? ((draws / totalMatches) * 100).toFixed(1) : "0";

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
        <div className="bg-primary/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-extrabold text-primary">
            {stats.totalForms}
          </div>
          <div className="text-[11px] text-gray-500 font-medium">
            טפסים הוגשו
          </div>
        </div>
        <div className="bg-primary/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-extrabold text-primary">
            {stats.playedResults}/{stats.totalPossible}
          </div>
          <div className="text-[11px] text-gray-500 font-medium">
            משחקים שוחקו
          </div>
        </div>
        <div className="bg-primary/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-extrabold text-primary">
            {stats.avgGoals}
          </div>
          <div className="text-[11px] text-gray-500 font-medium">
            ממוצע שערים לניחוש
          </div>
        </div>
        <div className="bg-primary/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-extrabold text-primary">
            {stats.drawPct}%
          </div>
          <div className="text-[11px] text-gray-500 font-medium">
            ניחושי תיקו
          </div>
        </div>
      </div>
    </StatCard>
  );
}

// ============ SEARCH ============
function SearchStats({ forms }) {
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
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
      if (f.topScorer?.toLowerCase().includes(q)) {
        teamMatches.push({
          formName: f.formName,
          type: "מלך שערים",
          value: f.topScorer,
        });
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
        Object.values(f.matches || {}).forEach((p) => {
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
  }, [query, forms]);

  return (
    <StatCard title="חיפוש חופשי" icon="💬">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='חפש קבוצה, שחקן, שם טופס או תוצאה (לדוגמה: "ברזיל", "מבאפה", "2-1")'
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 mb-3"
      />
      {searchResults && (
        <div className="space-y-3">
          {searchResults.map((group, i) => (
            <div key={group.title || i}>
              <p className="text-xs font-bold text-gray-600 mb-1">
                {group.title}
              </p>
              {group.items.length > 0 && (
                <div className="space-y-1">
                  {group.items.map((item, j) => (
                    <div
                      key={`${item.formName}-${item.type}-${item.value || j}`}
                      className="flex justify-between text-[11px] bg-gray-50 rounded-lg px-3 py-1.5"
                    >
                      <span className="text-gray-500">{item.type}</span>
                      <span className="font-medium text-gray-700">
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
  const [activeTab, setActiveTab] = useState("matches");

  if (!settings.predictionsLocked) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-primary mb-2">סטטיסטיקות</h2>
        <p className="text-sm text-ink-muted">הנתונים יהיו זמינים לאחר נעילת הניחושים</p>
      </div>
    );
  }

  const submittedForms = useMemo(() => {
    return Object.entries(allPredictions)
      .filter(([, f]) => normalizeStatus(f.status) === "submitted")
      .map(([formId, f]) => ({ formId, ...f }));
  }, [allPredictions]);

  return (
    <div>
      <h1 className="text-xl font-extrabold text-primary mb-4 tracking-tight">
        📈 סטטיסטיקות
      </h1>

      {submittedForms.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-gray-400 text-sm">
            אין מספיק נתונים להצגת סטטיסטיקות
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-1 mb-4 overflow-x-auto">
            {[
              { id: "matches", label: "📊 משחקים" },
              { id: "teams", label: "🏆 קבוצות" },
              { id: "forms", label: "📋 טפסים" },
              { id: "search", label: "🔍 חיפוש" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border-none cursor-pointer ${activeTab === tab.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {activeTab === "matches" && (
              <>
                <GeneralStats forms={submittedForms} results={results} />
                <MatchPredictions forms={submittedForms} />
              </>
            )}
            {activeTab === "teams" && (
              <>
                <ChampionStats forms={submittedForms} />
                <TopScorerStats forms={submittedForms} />
              </>
            )}
            {activeTab === "forms" && (
              <GeneralStats forms={submittedForms} results={results} />
            )}
            {activeTab === "search" && (
              <SearchStats forms={submittedForms} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
