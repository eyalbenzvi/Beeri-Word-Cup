import { useState, useMemo, useEffect } from "react";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import EmptyState from "../components/EmptyState";
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
import PageHeader from "../components/PageHeader";
import FormAvatar from "../components/FormAvatar";
import FormSummaryLines from "../components/FormSummaryLines";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";
import { LABELS } from "../constants/messages";

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
  const playerList = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );
  const [selectedForm, setSelectedForm] = useState(null);
  const [showCount, setShowCount] = useState(20);

  const { formBracketMap, scoredForms, leaderboard, rankedLeaderboard, actualBracket } =
    useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  // Rank delta: compare current rank per formId with the rank we saw last
  // visit. Stored in localStorage under "beeri:prevRanks". Deltas show for 3s
  // before we overwrite the snapshot.
  const [prevRanks, setPrevRanks] = useState({});
  useEffect(() => {
    if (embedded) return;
    try {
      const raw = localStorage.getItem("beeri:prevRanks");
      if (raw) setPrevRanks(JSON.parse(raw));
    } catch { /* Private mode / quota — ignore */ }
  }, [embedded]);
  useEffect(() => {
    if (embedded || rankedLeaderboard.length === 0) return;
    const t = setTimeout(() => {
      try {
        const snap = {};
        for (const e of rankedLeaderboard) snap[e.formId] = e.rank;
        localStorage.setItem("beeri:prevRanks", JSON.stringify(snap));
      } catch { /* ignore */ }
    }, 3000);
    return () => clearTimeout(t);
  }, [rankedLeaderboard, embedded]);

  const renderFormDetail = () => {
    if (!selectedForm) return null;

    // Don't show other users' form details before predictions are locked
    const formOwner = allPredictions[selectedForm]?.userId;
    if (!settings.predictionsLocked && formOwner !== user?.id) {
      return null;
    }

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
          className="text-sm text-secondary mb-3 flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0 hover:text-secondary-dark"
        >
          <ArrowRight size={16} aria-hidden="true" />
          חזרה לטבלת הדירוג
        </button>

        <h2 className="text-xl font-extrabold text-ink mb-2">
          {predData.formName || "טופס ללא שם"}
        </h2>

        <div className="card-duo mb-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-bg-soft rounded-xl p-3">
            <div className="text-2xl font-extrabold text-primary tabular-nums">
              <bdi>{score.totalPoints}</bdi>
            </div>
            <div className="text-ink-muted font-bold">סה״כ</div>
          </div>
          <div className="bg-bg-soft rounded-xl p-3">
            <div className="text-2xl font-extrabold text-primary tabular-nums">
              <bdi>{score.exactScoreCount}</bdi>
            </div>
            <div className="text-ink-muted font-bold">{LABELS.exactCount}</div>
          </div>
          <div className="bg-bg-soft rounded-xl p-3">
            <div className="text-2xl font-extrabold text-secondary tabular-nums">
              <bdi>{score.outcomeCount}</bdi>
            </div>
            <div className="text-ink-muted font-bold">{LABELS.outcomeCount}</div>
          </div>
        </div>

        {Object.values(score.advancingPoints).some((v) => v > 0) && (
          <div className="card-duo mb-4 text-sm">
            <div className="text-sm font-extrabold text-ink mb-2">
              נקודות עליה:
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ["R32", "שלב ה-32"],
                ["R16", "שמינית"],
                ["QF", "רבע"],
                ["SF", "חצי"],
                ["F", "גמר"],
              ].map(([round, label]) => {
                const pts = score.advancingPoints[round] || 0;
                if (!pts) return null;
                return (
                  <span
                    key={round}
                    className="bg-primary text-white font-extrabold px-2.5 py-1 rounded-full"
                  >
                    {label}: <bdi>+{pts}</bdi>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="card-duo mb-4 text-sm">
          <div className="flex justify-between py-1.5 border-b border-border">
            <span className="text-ink-muted font-bold">{LABELS.guessChampion}:</span>
            <span className="font-extrabold text-ink">
              {derivedChampion
                ? getTeamByCode(derivedChampion)?.name || "טרם נקבע"
                : "אין"}
              {score.correctChampion ? " ✅" : ""}
            </span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-ink-muted font-bold">{LABELS.guessTopScorer}:</span>
            <span className="font-extrabold text-ink">
              {predData.topScorer ? getPlayerDisplayName(predData.topScorer, playerList) : "אין"}
              {score.correctTopScorer ? " ✅" : ""}
            </span>
          </div>
        </div>

        {Object.entries(matchesByStage).map(([stage, matches]) => (
          <div key={stage} className="mb-4">
            <h3 className="text-sm font-extrabold text-ink mb-2">
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
                      className={`text-xs px-3 py-1.5 -mt-1 mb-2 rounded-b-xl font-bold ${
                        pts.wrongMatchup
                          ? "text-danger"
                          : "text-secondary"
                      }`}
                      style={{ background: pts.wrongMatchup ? "var(--color-danger-soft)" : "#F0F9FF" }}
                    >
                      ניחש: {predMatchup.home?.name || "טרם נקבע"} נגד{" "}
                      {predMatchup.away?.name || "טרם נקבע"}
                      {prediction
                        ? <>{" "}<bdi>({prediction.awayScore}-{prediction.homeScore})</bdi></>
                        : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {playedMatches.length === 0 && (
          <p className="text-center text-ink-muted font-medium py-8">
            עדיין לא שוחקו משחקים
          </p>
        )}
      </div>
    );
  };

  if (!embedded && !forceUnlockView && !locked) {
    return (
      <div className="text-center py-16 card-duo-lg max-w-md mx-auto">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-extrabold text-ink mb-2">טבלת דירוג</h2>
        <p className="text-sm text-ink-muted font-medium">הדירוג יתגלה כשהמשחקים יתחילו.</p>
      </div>
    );
  }

  return (
    <div>
      {!embedded && <PageHeader title="טבלת דירוג" />}
      {embedded && (
        <p className="text-sm font-extrabold text-ink mb-3">
          תצוגה מקדימה (מנהל)
        </p>
      )}

      {selectedForm ? (
        renderFormDetail()
      ) : (
        <>
          <div className="space-y-2">
            {rankedLeaderboard.slice(0, showCount).map((entry) => {
              const currentRank = entry.rank;
              const isTop3 = currentRank <= 3;
              const canView =
                forceUnlockView || locked || entry.userId === user?.id;
              const championCode = formBracketMap[entry.formId]?.champion;
              const championName = championCode
                ? getTeamByCode(championCode)?.name
                : null;
              const topScorerRaw = allPredictions[entry.formId]?.topScorer;
              const topScorerDisplay = topScorerRaw
                ? getPlayerDisplayName(topScorerRaw, playerList)
                : null;
              const borderColor =
                currentRank === 1
                  ? "border-gold"
                  : currentRank === 2
                    ? "border-silver"
                    : currentRank === 3
                      ? "border-bronze"
                      : "border-border";
              return (
                <button
                  key={entry.formId}
                  onClick={() => {
                    if (canView) setSelectedForm(entry.formId);
                  }}
                  aria-disabled={!canView}
                  tabIndex={canView ? 0 : -1}
                  title={canView ? undefined : "הניחושים יוצגו לאחר נעילת הטורניר"}
                  className={`w-full bg-white rounded-2xl p-4 border-2 flex items-center gap-3 text-right ${borderColor} ${
                    entry.userId === user?.id ? "ring-2 ring-primary" : ""
                  } ${
                    canView
                      ? "cursor-pointer card-duo-hover"
                      : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-extrabold tabular-nums text-center inline-block flex-shrink-0 ${
                      currentRank === 1
                        ? "podium-gold text-white"
                        : currentRank === 2
                          ? "podium-silver text-white"
                          : currentRank === 3
                            ? "podium-bronze text-white"
                            : "bg-bg-soft text-ink-muted"
                    }`}
                  >
                    {currentRank === 1
                      ? "🥇"
                      : currentRank === 2
                        ? "🥈"
                        : currentRank === 3
                          ? "🥉"
                          : currentRank}
                  </span>

                  <FormAvatar form={{ formName: entry.formName, status: "submitted" }} size="md" />

                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm truncate text-ink">
                      {entry.formName}
                    </div>
                    {(() => {
                      const u = users[entry.userId];
                      const name = u?.firstName
                        ? (u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName)
                        : u?.displayName || null;
                      return name ? (
                        <div className="text-xs text-ink-muted font-medium truncate">{name}</div>
                      ) : null;
                    })()}
                    {canView && (
                      <FormSummaryLines
                        championName={championName}
                        topScorerName={topScorerDisplay}
                      />
                    )}
                    <div className="text-xs text-ink-muted tabular-nums font-bold">
                      <bdi>{entry.exactScoreCount}</bdi> {LABELS.exactCount} • <bdi>{entry.outcomeCount}</bdi>{" "}
                      {LABELS.outcomeCount}
                    </div>
                  </div>

                  <div className="text-left min-w-[50px] flex flex-col items-start gap-0.5">
                    {!embedded && prevRanks[entry.formId] != null && prevRanks[entry.formId] !== currentRank && (() => {
                      const delta = prevRanks[entry.formId] - currentRank;
                      if (delta === 0) return null;
                      const up = delta > 0;
                      return (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full tabular-nums animate-pop-in ${
                            up ? "bg-primary/10 text-primary-dark" : "bg-danger/10 text-danger"
                          }`}
                          aria-label={up ? `עלית ${delta} מקומות` : `ירדת ${-delta} מקומות`}
                        >
                          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {Math.abs(delta)}
                        </span>
                      );
                    })()}
                    <div
                      className={`text-2xl font-extrabold tabular-nums ${isTop3 ? "text-primary" : "text-ink"}`}
                    >
                      <bdi>{entry.totalPoints}</bdi>
                    </div>
                    <div className="text-xs text-ink-muted font-bold">{LABELS.pointsShort}</div>
                  </div>
                </button>
              );
            })}

            {showCount < leaderboard.length && (
              <button onClick={() => setShowCount(s => s + 20)} className="btn-duo btn-duo-ghost btn-duo-cta mt-2">
                הצג {Math.min(20, leaderboard.length - showCount)} נוספים (נותרו {leaderboard.length - showCount})
              </button>
            )}

            {leaderboard.length === 0 && (
              <EmptyState
                icon="🏟️"
                title="אין ניחושים עדיין"
                description="היה הראשון להגיש טופס"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
