import { computeAchievements } from "../utils/achievements";

// Renders the earned achievement badges for a scored form (#9). Returns null
// when none are earned, so callers can drop it in unconditionally.
export default function AchievementBadges({ scored }: { scored: any }) {
  const achievements = computeAchievements(scored);
  if (achievements.length === 0) return null;
  return (
    <div className="card-duo mb-4">
      <div className="text-sm font-extrabold text-ink mb-2">🏅 הישגים</div>
      <div className="flex flex-wrap gap-2">
        {achievements.map((a) => (
          <span
            key={a.id}
            title={a.desc}
            className="inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-1.5 rounded-full border-2 border-border bg-bg-soft text-ink"
          >
            <span aria-hidden="true">{a.emoji}</span>
            {a.label}
          </span>
        ))}
      </div>
    </div>
  );
}
