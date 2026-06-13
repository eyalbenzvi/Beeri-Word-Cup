// "הניקוד שלך" — home-page strip: official rank + today's points.
//
// Disambiguation contract (review finding): the LiveNow card above shows
// PROVISIONAL live verdicts ("כרגע"); this strip is OFFICIAL results only.
// The "לפי משחקים שנגמרו" label is what stops the "it says I'm exact, why
// didn't my rank move" support thread — do not remove it.
//
// Multi-form: headline = the user's best-RANKED form, named explicitly;
// 2+ forms get a per-form breakdown (name · rank · today). Rank/points come
// from the same useLeaderboardComputed pipeline as the Leaderboard page, so
// the two screens can never disagree.
//
// Deliberately NOT shown: rank movement (↑3). The localStorage snapshot the
// Leaderboard keeps means "since my last Leaderboard visit" — semantically
// mush on the home page. This component must never write to
// "beeri:prevRanks" (it would erase the Leaderboard's own delta display).

import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import {
  useCurrentUser,
  useMatchResults,
  useAllPredictions,
  useUserDirectory,
  useActualBonuses,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { useNavigation } from "../hooks/useNavigation";
import { computeDailyFormPoints, israelDateKeyForNow } from "../utils/dailyPoints";
import { SCORE_STRIP, LABELS } from "../constants/messages";

const DAY_MS = 24 * 3600 * 1000;

export default function ScoreStrip() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUserDirectory();
  const actualBonuses = useActualBonuses();
  const { navigate } = useNavigation();

  const { rankedLeaderboard, formBracketMap, actualBracket } =
    useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  const myForms = useMemo(() => {
    if (!user?.id) return [];
    return rankedLeaderboard.filter((e) => e.userId === user.id);
  }, [rankedLeaderboard, user?.id]);

  // Per-form "today: +N" (or, before any of today's matches finished,
  // "yesterday: +N" — the number a morning visitor opens the app for).
  // playedCount depends only on results+date (identical across forms), so
  // it's derived once, not inside the per-form loop.
  const dayLines = useMemo(() => {
    const now = Date.now();
    const todayKey = israelDateKeyForNow(now);
    const yesterdayKey = israelDateKeyForNow(now - DAY_MS);
    const todayPlayed = computeDailyFormPoints({
      formMatches: {},
      results,
      dateKey: todayKey,
    }).playedCount;
    const lines = {};
    for (const entry of myForms) {
      const formMatches = allPredictions[entry.formId]?.matches || {};
      const predBracket = formBracketMap[entry.formId]?.predBracket;
      const dateKey = todayPlayed > 0 ? todayKey : yesterdayKey;
      const day = computeDailyFormPoints({
        formMatches,
        results,
        dateKey,
        predBracket,
        actualBracket,
      });
      lines[entry.formId] =
        todayPlayed > 0
          ? SCORE_STRIP.todayPoints(day.points)
          : day.playedCount > 0
            ? SCORE_STRIP.yesterdayPoints(day.points)
            : null;
    }
    return lines;
  }, [myForms, allPredictions, formBracketMap, actualBracket, results]);

  if (!user || myForms.length === 0) return null;

  const total = rankedLeaderboard.length;
  const best = myForms[0]; // rankedLeaderboard is sorted best-first
  const dayLine = (formId) => dayLines[formId] || null;

  return (
    <button
      type="button"
      onClick={() => navigate("leaderboard")}
      className="card-duo w-full text-right mb-3 cursor-pointer tap-44"
      aria-label={SCORE_STRIP.toLeaderboard}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold text-ink-muted mb-1">
            {SCORE_STRIP.header}{" "}
            <span className="font-medium">({SCORE_STRIP.officialOnly})</span>
          </div>
          {myForms.length === 1 ? (
            <div className="text-sm font-bold text-ink">
              {SCORE_STRIP.rankOf(best.rank, total)}
              {dayLine(best.formId) && (
                <span className="text-ink-muted"> · {dayLine(best.formId)}</span>
              )}
            </div>
          ) : (
            <>
              <div className="text-sm font-bold text-ink">
                <span className="text-xs text-ink-muted">{SCORE_STRIP.leadingForm}: </span>
                <span className="truncate">{best.formName}</span>
                {" · "}
                {SCORE_STRIP.rankOf(best.rank, total)}
                {dayLine(best.formId) && (
                  <span className="text-ink-muted"> · {dayLine(best.formId)}</span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {myForms.slice(1).map((entry) => (
                  <div
                    key={entry.formId}
                    className="flex items-center justify-between gap-2 text-xs text-ink-muted"
                  >
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {entry.formName}
                    </span>
                    <span className="whitespace-nowrap">
                      {LABELS.rank} {entry.rank}
                      {dayLine(entry.formId) && <> · {dayLine(entry.formId)}</>}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <ChevronLeft size={18} className="shrink-0 text-ink-light" aria-hidden="true" />
      </div>
    </button>
  );
}
