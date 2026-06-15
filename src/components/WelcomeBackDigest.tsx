// "מאז הביקור האחרון" — a returning-visitor digest at the top of the locked
// home page (#1). Answers the two questions a user opens the app for during the
// tournament: what finished, and did I move?
//
// It keeps its OWN snapshot (beeri:home:lastSeen) rather than reusing the
// Leaderboard's per-visit rank snapshot — that one means "since my last
// Leaderboard visit", which is meaningless on the home page (see ScoreStrip's
// note about not writing to it). The
// snapshot captured at read time is the PREVIOUS visit's; the current visit's
// snapshot is written a few seconds in, so a refresh doesn't zero the delta.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, TrendingUp, TrendingDown } from "lucide-react";
import {
  useCurrentUser,
  useMatchResults,
  useAllPredictions,
  useUserDirectory,
  useActualBonuses,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { useNavigation } from "../hooks/useNavigation";

const SNAPSHOT_KEY = "beeri:home:lastSeen";
// Delay before overwriting the snapshot so a quick refresh keeps showing the
// same "since last visit" delta instead of resetting it to zero.
const WRITE_DELAY_MS = 4000;

type Snapshot = { resultsCount: number; bestRank: number | null };

function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s?.resultsCount === "number") return s;
  } catch { /* private mode / corrupt — ignore */ }
  return null;
}

export default function WelcomeBackDigest() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUserDirectory();
  const actualBonuses = useActualBonuses();
  const { navigate } = useNavigation();

  const { rankedLeaderboard } = useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  const resultsCount = Object.keys(results).length;
  const bestRank = useMemo(() => {
    if (!user?.id) return null;
    const mine = rankedLeaderboard.filter((e) => e.userId === user.id);
    return mine.length ? Math.min(...mine.map((e) => e.rank)) : null;
  }, [rankedLeaderboard, user?.id]);

  // Read the previous snapshot once (before this visit overwrites it).
  const [prev] = useState<Snapshot | null>(readSnapshot);

  // Persist the current snapshot a few seconds in. Guarded on real data so we
  // don't store a zeroed snapshot during the initial loading frames.
  const wroteRef = useRef(false);
  useEffect(() => {
    if (!user?.id || wroteRef.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ resultsCount, bestRank }));
        wroteRef.current = true;
      } catch { /* ignore */ }
    }, WRITE_DELAY_MS);
    return () => clearTimeout(t);
  }, [user?.id, resultsCount, bestRank]);

  // Nothing to compare on the very first visit, or for guests / form-less users.
  if (!user?.id || !prev || bestRank == null) return null;

  const newResults = Math.max(0, resultsCount - prev.resultsCount);
  // Lower rank number = better, so improvement is prev - current.
  const rankDelta = prev.bestRank != null ? prev.bestRank - bestRank : 0;

  if (newResults === 0 && rankDelta === 0) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(newResults > 0 ? "results" : "leaderboard")}
      className="card-duo w-full text-right mb-3 cursor-pointer tap-44"
      style={{ background: "var(--color-primary-soft)", borderColor: "var(--color-primary)" }}
      aria-label="מה קרה מאז הביקור האחרון"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold text-primary-dark mb-1">מאז הביקור האחרון 👋</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-ink">
            {newResults > 0 && (
              <span>⚽ {newResults} {newResults === 1 ? "תוצאה חדשה" : "תוצאות חדשות"}</span>
            )}
            {rankDelta > 0 && (
              <span className="inline-flex items-center gap-1 text-primary-dark">
                <TrendingUp size={16} aria-hidden="true" /> עלית {rankDelta} {rankDelta === 1 ? "מקום" : "מקומות"}
              </span>
            )}
            {rankDelta < 0 && (
              <span className="inline-flex items-center gap-1 text-danger">
                <TrendingDown size={16} aria-hidden="true" /> ירדת {-rankDelta} {(-rankDelta) === 1 ? "מקום" : "מקומות"}
              </span>
            )}
            {rankDelta === 0 && newResults > 0 && (
              <span className="text-ink-muted">המיקום שלך נשמר 💪</span>
            )}
          </div>
        </div>
        <ChevronLeft size={18} className="shrink-0 text-ink-light" aria-hidden="true" />
      </div>
    </button>
  );
}
