import { useState } from "react";
import {
  useCurrentUser,
  useMatchResults,
  useAllPredictions,
  useUsers,
  useActualBonuses,
  useSettings,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { getTeamByCode } from "../data/teams";
import MatchCard from "../components/MatchCard";

const allMatchesMap = Object.fromEntries(
  [...groupMatches, ...knockoutMatches].map((m) => [m.id, m]),
);

export default function Leaderboard({
  embedded = false,
  forceUnlockView = false,
}) {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const settings = useSettings();
  const locked = settings.predictionsLocked;
  const [selectedForm, setSelectedForm] = useState(null);

  const { formBracketMap, scoredForms, leaderboard, actualBracket } =
    useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  const renderFormDetail = () => {
    if (!selectedForm) return null;

    const predData = allPredictions[selectedForm] || {};
    const bracketData = formBracketMap[selectedForm];
    const predBracket = bracketData?.predBracket || {};
    const derivedChampion = bracketData?.champion || null;
    const scored = scoredForms.find((e) => e.formId === selectedForm);
    const score = scored || {
      totalPoints: 0,
      exactScoreCount: 0,
      outcomeCount: 0,
      correctChampion: false,
      correctTopScorer: false,
      advancingPoints: {},
      matchScores: {},
    };
    const playedMatches = Object.keys(results);

    const matchesByStage = {};
    for (const matchId of playedMatches) {
      const match = allMatchesMap[matchId];
      const result = results[matchId];
      const stage = result.stage || match?.stage || "group";
      if (!matchesByStage[stage]) matchesByStage[stage] = [];
      matchesByStage[stage].push({ matchId, match, result });
    }

    return (
      <div className="mt-4">
        <button
          onClick={() => setSelectedForm(null)}
          className="text-sm text-primary mb-3 flex items-center gap-1 bg-transparent border-none cursor-pointer font-medium p-0"
        >
          חזרה לטבלת הדירוג →
        </button>

        <h2 className="text-lg font-bold text-primary mb-0.5">
          {predData.formName || "טופס ללא שם"}
        </h2>

        <div className="bg-white rounded-2xl p-4 mb-4 border border-border shadow-sm grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xl font-extrabold text-primary tabular-nums">
              {score.totalPoints}
            </div>
            <div className="text-ink-muted">סה״כ</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xl font-extrabold text-green-600 tabular-nums">
              {score.exactScoreCount}
            </div>
            <div className="text-ink-muted">תוצאות מדויקות</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xl font-extrabold text-blue-600 tabular-nums">
              {score.outcomeCount}
            </div>
            <div className="text-ink-muted">הכרעות</div>
          </div>
        </div>

        {Object.values(score.advancingPoints).some((v) => v > 0) && (
          <div className="bg-white rounded-2xl p-4 mb-4 border border-border shadow-sm text-sm">
            <div className="text-xs font-semibold text-ink-muted mb-1">
              נקודות עליה:
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ["R32", "שמינית"],
                ["R16", "שמינית-16"],
                ["QF", "רבע"],
                ["SF", "חצי"],
                ["F", "גמר"],
              ].map(([round, label]) => {
                const pts = score.advancingPoints[round] || 0;
                if (!pts) return null;
                return (
                  <span
                    key={round}
                    className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full"
                  >
                    {label}: +{pts}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 mb-4 border border-border shadow-sm text-sm">
          <div className="flex justify-between py-1 border-b border-gray-50">
            <span className="text-ink-muted">ניחוש אלופה:</span>
            <span className="font-medium">
              {derivedChampion
                ? getTeamByCode(derivedChampion)?.name || "טרם נקבע"
                : "אין"}
              {score.correctChampion ? " ✅" : ""}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-muted">ניחוש מלך שערים:</span>
            <span className="font-medium">
              {predData.topScorer || "אין"}
              {score.correctTopScorer ? " ✅" : ""}
            </span>
          </div>
        </div>

        {Object.entries(matchesByStage).map(([stage, matches]) => (
          <div key={stage} className="mb-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">
              {STAGES[stage] || stage}
            </h3>
            {matches.map(({ matchId, match, result }) => {
              const prediction = predData.matches?.[matchId];
              const predTeams = predBracket[matchId] || null;
              const actTeams = actualBracket[matchId] || null;
              const pts = score.matchScores?.[matchId] || {
                points: 0,
                outcomePoints: 0,
                exactPoints: 0,
                breakdown: "",
                wrongMatchup: false,
              };
              const derivedMatch =
                match?.stage !== "group" && actTeams
                  ? {
                      ...match,
                      homeTeam: actTeams.home,
                      awayTeam: actTeams.away,
                    }
                  : match || {
                      homeTeam: result.homeTeam,
                      awayTeam: result.awayTeam,
                    };
              const predMatchup =
                stage !== "group" && predTeams?.home && predTeams?.away
                  ? {
                      home: getTeamByCode(predTeams.home),
                      away: getTeamByCode(predTeams.away),
                    }
                  : null;
              return (
                <div key={matchId}>
                  <MatchCard
                    match={derivedMatch}
                    prediction={prediction}
                    actualResult={result}
                    showPoints
                    points={pts}
                  />
                  {predMatchup && (
                    <div
                      className={`text-xs px-3 py-1.5 -mt-1 mb-2 rounded-b-xl ${
                        pts.wrongMatchup
                          ? "bg-red-50 text-red-500"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      ניחש: {predMatchup.home?.name || "טרם נקבע"} נגד{" "}
                      {predMatchup.away?.name || "טרם נקבע"}
                      {prediction
                        ? ` (${prediction.homeScore}-${prediction.awayScore})`
                        : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {playedMatches.length === 0 && (
          <p className="text-center text-gray-400 py-8">
            עדיין לא שוחקו משחקים
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      {!embedded && (
        <h1 className="text-xl font-extrabold text-primary mb-4 tracking-tight">
          🏆 טבלת דירוג
        </h1>
      )}
      {embedded && (
        <p className="text-sm font-semibold text-primary mb-3">
          תצוגה מקדימה (מנהל)
        </p>
      )}

      {selectedForm ? (
        renderFormDetail()
      ) : (
        <>
          <div className="bg-white rounded-2xl p-4 mb-4 border border-border shadow-sm">
            <div className="text-xs text-ink-muted text-center font-medium">
              {Object.keys(results).length} משחקים שוחקו • {leaderboard.length}{" "}
              טפסים
            </div>
          </div>

          <div className="space-y-1.5">
            {leaderboard.map((entry, index) => {
              const isTop3 = index < 3;
              const borderColor =
                index === 0
                  ? "border-yellow-300"
                  : index === 1
                    ? "border-gray-300"
                    : index === 2
                      ? "border-amber-400"
                      : "border-border";
              return (
                <button
                  key={entry.formId}
                  onClick={() => {
                    const canView =
                      forceUnlockView || locked || entry.userId === user?.id;
                    if (canView) setSelectedForm(entry.formId);
                  }}
                  className={`w-full bg-white rounded-2xl p-4 border shadow-sm flex items-center gap-3 text-right ${borderColor} ${
                    entry.userId === user?.id ? "ring-2 ring-primary/10" : ""
                  } ${
                    forceUnlockView || locked || entry.userId === user?.id
                      ? "cursor-pointer card-hover"
                      : "cursor-default opacity-80"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold tabular-nums ${
                      index === 0
                        ? "bg-gradient-to-br from-yellow-300 to-yellow-500 text-white shadow-sm"
                        : index === 1
                          ? "bg-gradient-to-br from-gray-300 to-gray-500 text-white"
                          : index === 2
                            ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white"
                            : "bg-gray-100 text-ink-muted"
                    }`}
                  >
                    {index === 0
                      ? "🥇"
                      : index === 1
                        ? "🥈"
                        : index === 2
                          ? "🥉"
                          : index + 1}
                  </div>

                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {entry.formName.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-medium text-sm truncate ${isTop3 ? "text-ink" : "text-ink-muted"}`}
                    >
                      {entry.formName}
                      {entry.userId === user?.id && (
                        <span className="text-[10px] text-primary mr-1 font-bold">
                          (שלי)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-muted/70 tabular-nums">
                      {entry.exactScoreCount} מדויקים • {entry.outcomeCount}{" "}
                      הכרעות
                    </div>
                  </div>

                  <div className="text-left min-w-[50px]">
                    <div
                      className={`text-xl font-extrabold tabular-nums ${isTop3 ? "text-primary" : "text-ink-muted"}`}
                    >
                      {entry.totalPoints}
                    </div>
                    <div className="text-[10px] text-ink-muted/60">נק׳</div>
                  </div>
                  {!forceUnlockView && !locked && entry.userId !== user?.id && (
                    <span className="text-gray-300 text-sm">🔒</span>
                  )}
                </button>
              );
            })}

            {leaderboard.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-5xl mb-3">🏟️</div>
                <p className="text-base font-medium text-gray-500 mb-1">
                  אין ניחושים עדיין
                </p>
                <p className="text-sm">היה הראשון להגיש טופס!</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
