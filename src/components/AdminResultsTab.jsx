import { useState, useMemo, useCallback } from "react";
import { useMatchResults } from "../hooks/useStore";
import { saveMatchResult, deleteMatchResult } from "../store";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { calcBracketTeams } from "../utils/bracket";
import { randomScore } from "../utils/helpers";
import GroupTable from "./GroupTable";
import GroupSelector from "./GroupSelector";

const ADMIN_STAGES = { all: "הכל", ...STAGES };

export default function AdminResultsTab() {
  const results = useMatchResults();
  const [undoStack, setUndoStack] = useState([]);
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [editingMatch, setEditingMatch] = useState(null);
  const [editScores, setEditScores] = useState({
    homeScore: "",
    awayScore: "",
  });

  const bracketTeams = useMemo(() => calcBracketTeams(results), [results]);

  const completedGroupCount = useMemo(() => {
    const counts = {};
    for (const matchId of Object.keys(results)) {
      const m = matchId.match(/^group-([A-L])-/);
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    return Object.values(counts).filter((c) => c >= 6).length;
  }, [results]);
  const allGroupsComplete = completedGroupCount >= 12;

  const saveWithUndo = useCallback(
    (matchId, result) => {
      const prev = results[matchId] ? { ...results[matchId] } : undefined;
      setUndoStack((stack) => [
        ...stack.slice(-19),
        { matchId, previousResult: prev },
      ]);
      saveMatchResult(matchId, result);
    },
    [results],
  );

  const deleteWithUndo = useCallback(
    (matchId) => {
      const prev = results[matchId] ? { ...results[matchId] } : undefined;
      setUndoStack((stack) => [
        ...stack.slice(-19),
        { matchId, previousResult: prev },
      ]);
      deleteMatchResult(matchId);
    },
    [results],
  );

  const undoLast = useCallback(() => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const last = stack[stack.length - 1];
      if (last.previousResult === undefined) {
        deleteMatchResult(last.matchId);
      } else {
        saveMatchResult(last.matchId, last.previousResult);
      }
      return stack.slice(0, -1);
    });
  }, []);

  const filteredMatches = useMemo(() => {
    if (selectedStage === "all") return [...groupMatches, ...knockoutMatches];
    if (selectedStage === "group") {
      return groupMatches.filter((m) => m.group === selectedGroup);
    }
    return knockoutMatches.filter((m) => m.stage === selectedStage);
  }, [selectedStage, selectedGroup]);

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
    const isKnockout = match.stage && match.stage !== "group";
    if (isKnockout && homeScore === awayScore) {
      const existing = results[match.id];
      if (!existing?.advancingTeam) {
        saveWithUndo(match.id, {
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
      saveWithUndo(match.id, {
        ...existing,
        homeScore,
        awayScore,
        played: true,
      });
      setEditingMatch(null);
      setEditScores({ homeScore: "", awayScore: "" });
      return;
    }
    saveWithUndo(match.id, {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore,
      awayScore,
      stage: match.stage || "group",
      group: match.group || null,
      played: true,
    });
    setEditingMatch(null);
    setEditScores({ homeScore: "", awayScore: "" });
  };

  const handleRandomizeResults = () => {
    if (
      !window.confirm("פעולה זו תדרוס את כל התוצאות בתוצאות אקראיות. להמשיך?")
    )
      return;

    const allResults = {};

    groupMatches.forEach((match) => {
      const r = {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: randomScore(),
        awayScore: randomScore(),
        stage: "group",
        group: match.group,
        played: true,
      };
      allResults[match.id] = r;
      saveMatchResult(match.id, r);
    });

    knockoutMatches.forEach((match) => {
      const r = {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: randomScore(),
        awayScore: randomScore(),
        stage: match.stage || "group",
        group: null,
        played: true,
      };
      allResults[match.id] = r;
      saveMatchResult(match.id, r);
    });

    const knockoutStageOrder = ["R32", "R16", "QF", "SF", "3RD", "F"];
    for (const stage of knockoutStageOrder) {
      const bracket = calcBracketTeams(allResults);
      for (const match of knockoutMatches.filter((m) => m.stage === stage)) {
        const r = allResults[match.id];
        if (r.homeScore === r.awayScore) {
          const teams = bracket[match.id];
          if (teams?.home && teams?.away) {
            r.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
            saveMatchResult(match.id, r);
          }
        }
      }
    }
  };

  const unresolvedKnockoutTies = useMemo(() => {
    return Object.entries(results).filter(
      ([, r]) =>
        r.stage &&
        r.stage !== "group" &&
        r.homeScore === r.awayScore &&
        !r.advancingTeam,
    );
  }, [results]);

  return (
    <>
      {unresolvedKnockoutTies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-center">
          <div className="text-sm font-semibold text-red-600">
            ⚠️ {unresolvedKnockoutTies.length} משחקי נוקאאוט בתיקו ללא בחירת מי
            עולה
          </div>
          <div className="text-xs text-red-500 mt-1">
            יש לבחור מי עולה בכל משחק תיקו כדי שהניקוד יחושב נכון
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={handleRandomizeResults}
          className="flex-1 bg-white text-primary font-semibold py-2.5 rounded-xl border-2 border-primary shadow-sm hover:bg-gray-50 active:bg-gray-100 transition text-sm"
        >
          🎲 הגרלת כל התוצאות
        </button>
        <button
          type="button"
          onClick={undoLast}
          disabled={undoStack.length === 0}
          className={`px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 ${undoStack.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
          title="בטל את השינוי האחרון בתוצאה בודדת"
        >
          ↩︎ ביטול
        </button>
      </div>
      <div className="flex overflow-x-auto gap-1.5 mb-3 pb-1 -mx-1 px-1 scrollbar-hide">
        {Object.entries(ADMIN_STAGES).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedStage(key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0 border-none cursor-pointer ${
              selectedStage === key
                ? "bg-primary text-white shadow-md"
                : "bg-white text-ink-muted shadow-sm hover:text-primary"
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
      {selectedStage === "group" && (
        <GroupTable matchData={results} group={selectedGroup} />
      )}
      <div className="space-y-2">
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
          const result = results[match.id];
          const isEditing = editingMatch === match.id;
          const isKnockout = match.stage !== "group";
          const isTie = result && result.homeScore === result.awayScore;
          return (
            <div
              key={match.id}
              className={`bg-white rounded-xl p-3 border ${result ? "border-green-200 bg-green-50/30" : "border-gray-100"}`}
            >
              <div className="flex justify-end mb-1">
                {result ? (
                  <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    הוזן
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    ממתין
                  </span>
                )}
              </div>
              {match.date && (
                <div className="flex justify-between items-center mb-1.5">
                  {isKnockout && match.label && !/^W\d+\s+vs\s+W\d+$/.test(match.label) ? (
                    <span className="text-xs text-gray-400 font-medium">
                      {match.label}
                    </span>
                  ) : <span />}
                  <span className="text-xs text-gray-300">
                    {[match.date, match.time, match.venue].filter(Boolean).join(" · ")}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="font-medium">
                      {homeTeam?.name || "טרם נקבע"}
                    </span>
                  </div>
                  <div className="text-sm mt-1">
                    <span className="font-medium">
                      {awayTeam?.name || "טרם נקבע"}
                    </span>
                  </div>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
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
                        className="w-12 h-8 text-center border rounded text-sm"
                        placeholder="0"
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
                        className="w-12 h-8 text-center border rounded text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleSaveResult(match)}
                        className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingMatch(null)}
                        className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {result ? (
                      <span className="font-bold text-primary text-lg">
                        {result.homeScore} - {result.awayScore}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">לא שוחק</span>
                    )}
                    <button
                      onClick={() => {
                        setEditingMatch(match.id);
                        setEditScores({
                          homeScore: result?.homeScore ?? "",
                          awayScore: result?.awayScore ?? "",
                        });
                      }}
                      className="text-xs bg-primary text-white px-2 py-1.5 rounded hover:bg-primary-light"
                    >
                      {result ? "ערוך" : "הכנס"}
                    </button>
                    {result && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("למחוק תוצאה זו?"))
                            deleteWithUndo(match.id);
                        }}
                        className="text-xs bg-red-50 text-red-500 px-2 py-1.5 rounded hover:bg-red-100"
                      >
                        מחק
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isKnockout && isTie && derived.home && derived.away && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500 text-center mb-1.5">
                    מי עולה? (בעיטות הכרעה)
                  </div>
                  {!result?.advancingTeam && (
                    <div className="text-xs text-red-500 text-center mb-1.5 font-medium">
                      חובה לבחור מי עולה
                    </div>
                  )}
                  <div className="flex gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        saveWithUndo(match.id, {
                          ...result,
                          advancingTeam: derived.home,
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        result?.advancingTeam === derived.home
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {homeTeam?.name || "טרם נקבע"}
                    </button>
                    <button
                      onClick={() =>
                        saveMatchResult(match.id, {
                          ...result,
                          advancingTeam: derived.away,
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        result?.advancingTeam === derived.away
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {awayTeam?.name || "טרם נקבע"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
