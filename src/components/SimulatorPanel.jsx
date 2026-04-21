import { useState, useMemo, useCallback } from "react";
import {
  useMatchResults,
  useAllPredictions,
  useUsers,
  useActualBonuses,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { calcBracketTeams } from "../utils/bracket";
import GroupSelector from "./GroupSelector";

// Shared simulator: used by AdminToolsTab (admin) and Stats (users).
// No writes to the store/Firestore — all overrides are in-memory only.
export default function SimulatorPanel({
  leaderboardLimit = 5,
  highlightUserId = null,
  showWarningBanner = true,
  userMode = false,
}) {
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

  // Defensive merge: spread both objects into a new container so neither
  // realResults (store ref) nor override (local state) is mutated downstream.
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

  const clearOne = useCallback((matchId) => {
    setOverride((o) => {
      if (!Object.hasOwn(o, matchId)) return o;
      const next = { ...o };
      delete next[matchId];
      return next;
    });
  }, []);

  const clearSim = () => setOverride({});

  const STAGES_LIST = useMemo(() => ({ all: "הכל", ...STAGES }), []);

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

    // Resolve the teams for this match as of current simulation state
    const derived =
      match.stage !== "group" && bracketTeams[match.id]
        ? bracketTeams[match.id]
        : { home: match.homeTeam, away: match.awayTeam };

    if (isKnockout && homeScore === awayScore && !cur.advancingTeam) {
      setOverrideResult(match.id, {
        homeTeam: derived.home,
        awayTeam: derived.away,
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
      homeTeam: derived.home,
      awayTeam: derived.away,
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

  const overrideCount = Object.keys(override).length;
  const shownLeaderboard = useMemo(
    () =>
      leaderboardLimit > 0
        ? simLeaderboard.slice(0, leaderboardLimit)
        : simLeaderboard,
    [simLeaderboard, leaderboardLimit],
  );

  const userRank = useMemo(() => {
    if (!highlightUserId) return null;
    const idx = simLeaderboard.findIndex((e) => e.userId === highlightUserId);
    if (idx < 0) return null;
    return { rank: idx + 1, entry: simLeaderboard[idx] };
  }, [simLeaderboard, highlightUserId]);

  return (
    <div className="space-y-3">
      {showWarningBanner && (
        <div
          className={`${
            userMode
              ? "bg-indigo-50 border-indigo-200 text-indigo-900"
              : "bg-amber-50 border-amber-200 text-amber-900"
          } border rounded-xl p-3 text-xs`}
        >
          {userMode ? (
            <>
              🎮 מצב סימולציה — מלא תוצאות כדי לראות איך תיראה טבלת הדירוג.
              השינויים <strong>לא נשמרים</strong> ונמחקים ברענון הדף.
            </>
          ) : (
            <>
              שינויים כאן <strong>לא נשמרים בשרת</strong> — רק מחשבים דירוג
              לצורך בדיקה.
            </>
          )}
        </div>
      )}
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={clearSim}
          disabled={overrideCount === 0}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${
            overrideCount === 0
              ? "bg-gray-50 text-gray-300 cursor-not-allowed"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          איפוס סימולציה{overrideCount > 0 ? ` (${overrideCount})` : ""}
        </button>
      </div>
      <div className="flex overflow-x-auto gap-1 pb-1 -mx-1 px-1">
        {Object.entries(STAGES_LIST).map(([key, label]) => (
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
          const needsTeam =
            isKnockout && isTie && !result?.advancingTeam && isSimmed;

          return (
            <div
              key={match.id}
              className={`bg-white rounded-xl p-2 border text-xs ${
                needsTeam
                  ? "border-amber-300 bg-amber-50/60"
                  : result
                    ? "border-green-200 bg-green-50/30"
                    : "border-gray-100"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-gray-400">{match.id}</span>
                <div className="flex items-center gap-1">
                  {isSimmed && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded">
                      סימול
                    </span>
                  )}
                  {isSimmed && (
                    <button
                      type="button"
                      onClick={() => clearOne(match.id)}
                      className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded"
                      aria-label="בטל סימולציה למשחק זה"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
              {/* Team-per-row layout so each score clearly belongs to its team */}
              <div className="flex items-stretch gap-2">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 min-w-0 truncate flex items-center gap-1">
                      {homeTeam?.flag && (
                        <span aria-hidden="true">{homeTeam.flag}</span>
                      )}
                      <bdi className="truncate">{homeTeam?.name || "—"}</bdi>
                    </span>
                    {isEditing ? (
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
                        aria-label={`גולים ${homeTeam?.name || "ביתית"}`}
                        className="w-10 h-7 text-center border rounded text-xs tabular-nums flex-shrink-0"
                      />
                    ) : (
                      <span className="w-10 text-center font-bold text-primary tabular-nums flex-shrink-0">
                        {result ? result.homeScore : "—"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 min-w-0 truncate flex items-center gap-1">
                      {awayTeam?.flag && (
                        <span aria-hidden="true">{awayTeam.flag}</span>
                      )}
                      <bdi className="truncate">{awayTeam?.name || "—"}</bdi>
                    </span>
                    {isEditing ? (
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
                        aria-label={`גולים ${awayTeam?.name || "חוץ"}`}
                        className="w-10 h-7 text-center border rounded text-xs tabular-nums flex-shrink-0"
                      />
                    ) : (
                      <span className="w-10 text-center font-bold text-primary tabular-nums flex-shrink-0">
                        {result ? result.awayScore : "—"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-1 flex-shrink-0">
                  {isEditing ? (
                    <>
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
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        // Only allow editing when teams are resolvable.
                        if (!derived.home || !derived.away) return;
                        setEditingMatch(match.id);
                        setEditScores({
                          homeScore: result?.homeScore ?? "",
                          awayScore: result?.awayScore ?? "",
                        });
                      }}
                      disabled={!derived.home || !derived.away}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        !derived.home || !derived.away
                          ? "bg-gray-200 text-gray-400"
                          : "bg-primary text-white"
                      }`}
                    >
                      ערוך
                    </button>
                  )}
                </div>
              </div>
              {isKnockout &&
                isTie &&
                derived.home &&
                derived.away &&
                result && (
                  <div className="mt-1">
                    {needsTeam && (
                      <div className="text-[10px] text-amber-700 text-center mb-1">
                        בחר קבוצה שעולה לשלב הבא:
                      </div>
                    )}
                    <div className="flex gap-1 justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          setOverrideResult(match.id, {
                            ...result,
                            advancingTeam: derived.home,
                            needsAdvancingTeam: false,
                          })
                        }
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          result.advancingTeam === derived.home
                            ? "bg-primary text-white"
                            : "bg-gray-100"
                        }`}
                      >
                        {homeTeam?.name}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOverrideResult(match.id, {
                            ...result,
                            advancingTeam: derived.away,
                            needsAdvancingTeam: false,
                          })
                        }
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          result.advancingTeam === derived.away
                            ? "bg-primary text-white"
                            : "bg-gray-100"
                        }`}
                      >
                        {awayTeam?.name}
                      </button>
                    </div>
                  </div>
                )}
            </div>
          );
        })}
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <h4 className="text-xs font-bold text-primary mb-2">
          {leaderboardLimit > 0 && leaderboardLimit < simLeaderboard.length
            ? `דירוג על פי סימולציה (${leaderboardLimit} ראשונים)`
            : "דירוג על פי סימולציה"}
        </h4>
        {highlightUserId && userRank && userRank.rank > leaderboardLimit && (
          <div className="mb-2 text-[11px] bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
            המקום שלך: <strong>{userRank.rank}</strong> —{" "}
            {userRank.entry.formName} ({userRank.entry.totalPoints} נק׳)
          </div>
        )}
        <ol className="text-xs space-y-1">
          {shownLeaderboard.map((e, i) => {
            const isMine = highlightUserId && e.userId === highlightUserId;
            return (
              <li
                key={e.formId}
                className={`flex justify-between px-1 py-0.5 rounded ${
                  isMine ? "bg-indigo-100 font-semibold" : ""
                }`}
              >
                <span className="truncate">
                  {i + 1}. {e.formName}
                </span>
                <span className="font-mono">{e.totalPoints}</span>
              </li>
            );
          })}
        </ol>
        {simLeaderboard.length === 0 && (
          <div className="text-[11px] text-gray-400 text-center py-2">
            אין טפסים מאושרים לדירוג
          </div>
        )}
      </div>
    </div>
  );
}
