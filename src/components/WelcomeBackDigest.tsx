// "מאז הביקור האחרון" — a returning-visitor digest at the top of the locked
// home page (#1). It reports what FINISHED since the last visit (count of new
// results) and links into Results.
//
// Rank movement is deliberately NOT shown here: ScoreStrip is the single source
// of truth for the user's standing (and it intentionally omits deltas to avoid
// a "why didn't my rank move" confusion). Surfacing a rank delta here too would
// stack three rank numbers on one screen, so this strip stays purely about
// "what's new". It keeps its OWN snapshot key (not the Leaderboard's per-visit
// rank snapshot); the current visit's snapshot is written a few seconds in so a
// quick refresh doesn't zero the delta.

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useCurrentUser, useMatchResults } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";

const SNAPSHOT_KEY = "beeri:home:lastSeen";
// Delay before overwriting the snapshot so a quick refresh keeps showing the
// same "since last visit" count instead of resetting it to zero.
const WRITE_DELAY_MS = 4000;

type Snapshot = { resultsCount: number };

function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s?.resultsCount === "number") return { resultsCount: s.resultsCount };
  } catch { /* private mode / corrupt — ignore */ }
  return null;
}

export default function WelcomeBackDigest() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const { navigate } = useNavigation();

  const resultsCount = Object.keys(results).length;

  // Read the previous snapshot once (before this visit overwrites it).
  const [prev] = useState<Snapshot | null>(readSnapshot);

  // Persist the current snapshot a few seconds in. Guarded on a logged-in user
  // so we don't store a zeroed snapshot during the initial loading frames.
  const wroteRef = useRef(false);
  useEffect(() => {
    if (!user?.id || wroteRef.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ resultsCount }));
        wroteRef.current = true;
      } catch { /* ignore */ }
    }, WRITE_DELAY_MS);
    return () => clearTimeout(t);
  }, [user?.id, resultsCount]);

  // Nothing to compare on the very first visit; nothing to show with no new
  // results.
  if (!user?.id || !prev) return null;
  const newResults = Math.max(0, resultsCount - prev.resultsCount);
  if (newResults === 0) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("results")}
      className="alert-primary-soft w-full text-right mb-3 cursor-pointer tap-44"
      aria-label="מה קרה מאז הביקור האחרון"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold text-primary-dark mb-1">מאז הביקור האחרון 👋</div>
          <div className="text-sm font-bold text-ink">
            ⚽ {newResults} {newResults === 1 ? "תוצאה חדשה" : "תוצאות חדשות"}
          </div>
        </div>
        <ChevronLeft size={18} className="shrink-0 text-ink-light" aria-hidden="true" />
      </div>
    </button>
  );
}
