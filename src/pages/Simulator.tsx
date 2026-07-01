import { ArrowRight } from "lucide-react";
import SimulatorPanel from "../components/SimulatorPanel";
import PageHeader from "../components/PageHeader";
import { useCurrentUser, useSettings, useSettingsServerConfirmed } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";

export default function Simulator() {
  const { user } = useCurrentUser();
  const settings = useSettings();
  // Gate the lock screen on SERVER-confirmed settings so a stale pre-lock
  // offline-cache read doesn't falsely show "simulator revealed when matches
  // start" once the tournament is running. See cache.ts / Leaderboard.tsx.
  const settingsConfirmed = useSettingsServerConfirmed();
  const { navigate } = useNavigation();

  if (settingsConfirmed && !settings.predictionsLocked) {
    return (
      <div className="text-center py-16 card-duo-lg max-w-md mx-auto">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-extrabold text-ink mb-2">סימולטור</h2>
        <p className="text-sm text-ink-muted font-medium">
          הסימולטור יתגלה כשהמשחקים יתחילו.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate("stats")}
        className="text-sm text-secondary mb-3 flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0 hover:text-secondary-dark"
      >
        <ArrowRight size={16} aria-hidden="true" />
        חזרה לסטטיסטיקות
      </button>
      <PageHeader
        eyebrow="מה אם"
        title="סימולטור"
        subtitle="שנה תוצאות עתידיות וראה איך הדירוג זז"
      />
      <SimulatorPanel
        userMode
        acceptSeed
        highlightUserId={user?.id || null}
        leaderboardLimit={0}
      />
    </div>
  );
}
