import { computeAchievements } from "../utils/achievements";

// Maps each achievement to a brand badge variant (.badge-duo-*) so the row uses
// the canonical badge component language rather than a hand-rolled chip, and the
// tiers read at a glance by colour: gold-ish accent for the marquee calls
// (champion / milestones), green for the goal-scoring ones, red for the streak,
// blue for the volume/accuracy badges.
const VARIANT: Record<string, string> = {
  "champion-caller": "badge-duo-accent",
  "golden-boot": "badge-duo-primary",
  "knockout-prophet": "badge-duo-primary",
  "hot-streak": "badge-duo-danger",
  "first-hit": "badge-duo-secondary",
  sharpshooter: "badge-duo-secondary",
  "exact-machine": "badge-duo-secondary",
  "outcome-master": "badge-duo-secondary",
  centurion: "badge-duo-accent",
  "double-century": "badge-duo-accent",
};

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
          <span key={a.id} title={a.desc} className={`badge-duo ${VARIANT[a.id] || "badge-duo-muted"}`}>
            <span aria-hidden="true">{a.emoji}</span>
            {a.label}
          </span>
        ))}
      </div>
    </div>
  );
}
