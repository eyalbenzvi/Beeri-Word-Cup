import { useState, useMemo, useCallback } from "react";
import {
  useMatchResults,
  useAllPredictions,
  useUsers,
  useActualBonuses,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import Leaderboard from "../pages/Leaderboard";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { calcBracketTeams } from "../utils/bracket";
import GroupSelector from "./GroupSelector";

function AdminExportReports({ leaderboard, users, allPredictions }) {
  const downloadCsv = () => {
    const header = "מקום,שם טופס,משתמש,תקציב,אלופה,מלך שערים,נקודות,מדויקים,הכרעות\n";
    const lines = leaderboard.map((e, i) => {
      const pred = allPredictions[e.formId] || {};
      return [
        i + 1,
        `"${(e.formName || "").replace(/"/g, '""')}"`,
        `"${(e.userName || "").replace(/"/g, '""')}"`,
        `"${pred.budgetNumber || ""}"`,
        `"${pred.champion || ""}"`,
        `"${pred.topScorer || ""}"`,
        e.totalPoints,
        e.exactScoreCount,
        e.outcomeCount,
      ].join(",");
    });
    const blob = new Blob(["\uFEFF" + header + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPerUserJson = () => {
    const byUser = {};
    for (const [fid, p] of Object.entries(allPredictions)) {
      const uid = p.userId;
      if (!byUser[uid]) {
        byUser[uid] = {
          displayName: users[uid]?.displayName || uid,
          forms: [],
        };
      }
      byUser[uid].forms.push({ formId: fid, ...p });
    }
    const blob = new Blob([JSON.stringify(byUser, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predictions-by-user-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-2">
          ייצוא טבלת דירוג (CSV)
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          קובץ עם דירוג, שמות טפסים ונקודות — לפתיחה באקסל / גוגל שיטס
        </p>
        <button
          type="button"
          onClick={downloadCsv}
          className="w-full bg-primary text-white py-2 rounded-xl text-sm font-semibold"
        >
          הורד CSV
        </button>
      </div>
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-2">
          סיכום ניחושים לפי משתמש (JSON)
        </h3>
        <button
          type="button"
          onClick={downloadPerUserJson}
          className="w-full bg-white border-2 border-primary text-primary py-2 rounded-xl text-sm font-semibold"
        >
          הורד JSON
        </button>
      </div>
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-2">
          הדפסה / שמירה כ-PDF
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          יפתח חלון הדפסה — אפשר &quot;שמור כ-PDF&quot; בדפדפן
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full bg-gray-100 text-gray-800 py-2 rounded-xl text-sm font-semibold"
        >
          הדפס / PDF
        </button>
      </div>
    </div>
  );
}

function AdminSimulatorPanel() {
  const realResults = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const [override, setOverride] = useState({});
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [editingMatch, setEditingMatch] = useState(null);
  const [editScores, setEditScores] = useState({
    homeScore: "",
    awayScore: "",
  });

  const effectiveResults = useMemo(() => {
    const merged = { ...realResults };
    for (const [id, r] of Object.entries(override)) {
      merged[id] = r;
    }
    return merged;
  }, [realResults, override]);

  const { leaderboard: simLeaderboard } = useLeaderboardComputed(
    effectiveResults,
    allPredictions,
    users,
    actualBonuses,
  );

  const setOverrideResult = useCallback((matchId, result) => {
    setOverride((o) => ({ ...o, [matchId]: result }));
  }, []);

  const clearSim = () => setOverride({});

  const ADMIN_STAGES = useMemo(() => ({ all: "הכל", ...STAGES }), []);

  const filteredMatches = useMemo(() => {
    if (selectedStage === "all") return [...groupMatches, ...knockoutMatches];
    if (selectedStage === "group") {
      return groupMatches.filter((m) => m.group === selectedGroup);
    }
    return knockoutMatches.filter((m) => m.stage === selectedStage);
  }, [selectedStage, selectedGroup]);

  const bracketTeams = useMemo(
    () => calcBracketTeams(effectiveResults),
    [effectiveResults],
  );

  const completedGroupCount = useMemo(() => {
    const counts = {};
    for (const matchId of Object.keys(effectiveResults)) {
      const m = matchId.match(/^group-([A-L])-/);
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    return Object.values(counts).filter((c) => c >= 6).length;
  }, [effectiveResults]);
  const allGroupsComplete = completedGroupCount >= 12;

  const handleSaveResult = (match) => {
    if (editScores.homeScore === "" || editScores.awayScore === "") return;
    const homeScore = parseInt(editScores.homeScore, 10);
    const awayScore = parseInt(editScores.awayScore, 10);
    if (
      !Number.isFinite(homeScore) ||
      !Number.isFinite(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    )
      return;
    const cur = effectiveResults[match.id] || {};
    const isKnockout = match.stage && match.stage !== "group";
    if (isKnockout && homeScore === awayScore && !cur.advancingTeam) {
      setOverrideResult(match.id, {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore,
        awayScore,
        advancingTeam: null,
        stage: match.stage || "group",
        group: match.group || null,
        played: true,
        needsAdvancingTeam: true,
      });
      setEditingMatch(null);
      setEditScores({ homeScore: "", awayScore: "" });
      return;
    }
    setOverrideResult(match.id, {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore,
      awayScore,
      stage: match.stage || "group",
      group: match.group || null,
      played: true,
      ...(isKnockout && homeScore === awayScore && cur.advancingTeam
        ? { advancingTeam: cur.advancingTeam }
        : {}),
    });
    setEditingMatch(null);
    setEditScores({ homeScore: "", awayScore: "" });
  };

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
        שינויים כאן <strong>לא נשמרים בשרת</strong> — רק מחשבים דירוג לצורך
        בדיקה.
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={clearSim}
          className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-xl text-sm font-medium"
        >
          איפוס סימולציה
        </button>
      </div>
      <div className="flex overflow-x-auto gap-1 pb-1 -mx-1 px-1">
        {Object.entries(ADMIN_STAGES).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedStage(key)}
            className={`px-2.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
              selectedStage === key
                ? "bg-primary text-white"
                : "bg-white text-gray-600 shadow-sm"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {selectedStage === "group" && (
        <GroupSelector
          groups={Object.keys(GROUPS)}
          selectedGroup={selectedGroup}
          onSelect={setSelectedGroup}
        />
      )}
      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {filteredMatches.map((match) => {
          const canShowTeams =
            match.stage === "group" ||
            (match.stage === "R32"
              ? allGroupsComplete
              : !!bracketTeams[match.id]);
          const derived =
            match.stage !== "group" && canShowTeams && bracketTeams[match.id]
              ? {
                  home: bracketTeams[match.id].home,
                  away: bracketTeams[match.id].away,
                }
              : match.stage === "group"
                ? { home: match.homeTeam, away: match.awayTeam }
                : { home: null, away: null };
          const homeTeam = getTeamByCode(derived.home);
          const awayTeam = getTeamByCode(derived.away);
          const result = effectiveResults[match.id];
          const isEditing = editingMatch === match.id;
          const isKnockout = match.stage !== "group";
          const isTie = result && result.homeScore === result.awayScore;
          const isSimmed = Object.hasOwn(override, match.id);

          return (
            <div
              key={match.id}
              className={`bg-white rounded-xl p-2 border text-xs ${
                result ? "border-green-200 bg-green-50/30" : "border-gray-100"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-gray-400">{match.id}</span>
                {isSimmed && (
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded">
                    סימול
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{homeTeam?.name || "—"}</div>
                  <div className="truncate">{awayTeam?.name || "—"}</div>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={editScores.homeScore}
                      onChange={(e) =>
                        setEditScores((s) => ({
                          ...s,
                          homeScore: e.target.value,
                        }))
                      }
                      className="w-9 h-7 text-center border rounded text-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      value={editScores.awayScore}
                      onChange={(e) =>
                        setEditScores((s) => ({
                          ...s,
                          awayScore: e.target.value,
                        }))
                      }
                      className="w-9 h-7 text-center border rounded text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveResult(match)}
                      className="bg-green-500 text-white px-2 py-1 rounded text-[10px]"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingMatch(null)}
                      className="bg-gray-200 px-2 py-1 rounded text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-primary">
                      {result ? `${result.homeScore}-${result.awayScore}` : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMatch(match.id);
                        setEditScores({
                          homeScore: result?.homeScore ?? "",
                          awayScore: result?.awayScore ?? "",
                        });
                      }}
                      className="bg-primary text-white px-2 py-0.5 rounded text-[10px]"
                    >
                      ערוך
                    </button>
                  </div>
                )}
              </div>
              {isKnockout &&
                isTie &&
                derived.home &&
                derived.away &&
                result && (
                  <div className="flex gap-1 mt-1 justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setOverrideResult(match.id, {
                          ...result,
                          advancingTeam: derived.home,
                        })
                      }
                      className="text-[10px] bg-gray-100 px-2 py-0.5 rounded"
                    >
                      {homeTeam?.name}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOverrideResult(match.id, {
                          ...result,
                          advancingTeam: derived.away,
                        })
                      }
                      className="text-[10px] bg-gray-100 px-2 py-0.5 rounded"
                    >
                      {awayTeam?.name}
                    </button>
                  </div>
                )}
            </div>
          );
        })}
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <h4 className="text-xs font-bold text-primary mb-2">
          דירוג על פי סימולציה (5 ראשונים)
        </h4>
        <ol className="text-xs space-y-1">
          {simLeaderboard.slice(0, 5).map((e, i) => (
            <li key={e.formId} className="flex justify-between">
              <span>
                {i + 1}. {e.formName}
              </span>
              <span className="font-mono">{e.totalPoints}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function AdminToolsTab() {
  const [sub, setSub] = useState("preview");
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const { leaderboard } = useLeaderboardComputed(
    results,
    allPredictions,
    users,
    actualBonuses,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {[
          { id: "preview", label: "תצוגת דירוג" },
          { id: "sim", label: "סימולטור" },
          { id: "export", label: "ייצוא" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold ${
              sub === t.id
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "preview" && (
        <div className="admin-embed-leaderboard">
          <Leaderboard embedded forceUnlockView />
        </div>
      )}
      {sub === "sim" && <AdminSimulatorPanel />}
      {sub === "export" && (
        <AdminExportReports
          leaderboard={leaderboard}
          users={users}
          allPredictions={allPredictions}
        />
      )}
    </div>
  );
}
