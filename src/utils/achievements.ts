// Derives "achievement" badges for a scored form (#9). Pure + side-effect free
// so it can be unit-tested directly and reused by any view (leaderboard detail,
// profile). Input is the per-form object produced by useLeaderboardComputed
// (scoredForms entry): it already carries the per-match breakdown and the
// aggregate counts, so badges are a cheap projection of existing data.

import { ALL_MATCHES } from "../data/matches";

export type Achievement = { id: string; emoji: string; label: string; desc: string };

type MatchScore = { points?: number; exactPoints?: number; outcomePoints?: number };
type ScoredForm = {
  totalPoints?: number;
  exactScoreCount?: number;
  outcomeCount?: number;
  correctChampion?: boolean;
  correctTopScorer?: boolean;
  advancingPoints?: Record<string, number>;
  matchScores?: Record<string, MatchScore>;
};

// Chronological match order (by FIFA match number) for streak detection —
// computed once, reused for every form.
const CHRONO_MATCH_IDS = [...ALL_MATCHES]
  .sort((a, b) => (a.fifaMatch || 0) - (b.fifaMatch || 0))
  .map((m) => m.id);

// Longest run of consecutive PLAYED matches (in schedule order) that the form
// nailed exactly. Only matches the form actually scored count toward the run;
// a played match with no exact score breaks the streak.
export function longestExactStreak(matchScores: Record<string, MatchScore> = {}): number {
  let best = 0;
  let cur = 0;
  for (const id of CHRONO_MATCH_IDS) {
    const ms = matchScores[id];
    if (!ms) continue; // match not played / not scored yet — skip, don't break
    if ((ms.exactPoints || 0) > 0) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

export function computeAchievements(scored: ScoredForm | null | undefined): Achievement[] {
  if (!scored) return [];
  const out: Achievement[] = [];
  const exact = scored.exactScoreCount || 0;
  const outcome = scored.outcomeCount || 0;
  const total = scored.totalPoints || 0;
  const advTotal = Object.values(scored.advancingPoints || {}).reduce((s, v) => s + (v || 0), 0);

  // Exact-score tiers — a single badge at the highest tier reached.
  if (exact >= 10) out.push({ id: "exact-machine", emoji: "🎯", label: "מכונת דיוק", desc: "10+ תוצאות מדויקות" });
  else if (exact >= 5) out.push({ id: "sharpshooter", emoji: "🎯", label: "צלף", desc: "5+ תוצאות מדויקות" });
  else if (exact >= 1) out.push({ id: "first-hit", emoji: "🎯", label: "פגיעה ראשונה", desc: "תוצאה מדויקת ראשונה" });

  const streak = longestExactStreak(scored.matchScores);
  if (streak >= 3) out.push({ id: "hot-streak", emoji: "🔥", label: `רצף לוהט ×${streak}`, desc: `${streak} תוצאות מדויקות ברצף` });

  if (outcome >= 20) out.push({ id: "outcome-master", emoji: "✅", label: "קורא משחקים", desc: "20+ ניחושי תוצאה נכונים" });

  if (advTotal > 0) out.push({ id: "knockout-prophet", emoji: "📈", label: "נביא הנוקאאוט", desc: "נקודות עלייה בשלבי הנוקאאוט" });

  if (scored.correctChampion) out.push({ id: "champion-caller", emoji: "👑", label: "ניחש אלופה", desc: "צדק בניחוש האלופה" });
  if (scored.correctTopScorer) out.push({ id: "golden-boot", emoji: "⚽", label: "מלך השערים", desc: "צדק בניחוש מלך השערים" });

  if (total >= 200) out.push({ id: "double-century", emoji: "💎", label: "200 נקודות", desc: "צבר 200+ נקודות" });
  else if (total >= 100) out.push({ id: "centurion", emoji: "💯", label: "100 נקודות", desc: "צבר 100+ נקודות" });

  return out;
}
