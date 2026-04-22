import { useSettings, useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useCountdown } from "../hooks/useCountdown";
import { createForm } from "../store";
import CountdownUnit from "../components/CountdownUnit";
import UpcomingMatches from "../components/UpcomingMatches";
import { useToast } from "../components/Toast";

export default function Home() {
  const settings = useSettings();
  const { user } = useCurrentUser();
  const { navigate } = useNavigation();
  const countdown = useCountdown();
  const showToast = useToast();

  return (
    <div className="text-center max-w-xl mx-auto">
      <div className="pt-2 pb-3 md:pt-8 md:pb-5">
        <div className="text-5xl md:text-7xl mb-3 animate-pop-in">⚽🏆</div>
        <h1 className="text-2xl md:text-4xl font-extrabold text-ink mb-1 tracking-tight">
          טורניר הניחושים של בארי
        </h1>
        <p className="text-sm md:text-base font-bold text-ink-muted">
          מונדיאל 2026
        </p>
      </div>

      {!settings.predictionsLocked && (
        <button
          onClick={() => {
            if (user) {
              try { createForm(user.id); } catch (err) { showToast(err.message, "error"); }
            }
            navigate("predict");
          }}
          className="btn-duo btn-duo-primary w-full mb-4"
          style={{ padding: "1rem 1.5rem", fontSize: "1rem" }}
        >
          צור את הטופס המנצח שלך
        </button>
      )}

      {settings.predictionsLocked ? (
        <div className="mb-3">
          <UpcomingMatches />
        </div>
      ) : (
        <div className="card-duo-lg mb-4">
          {countdown.started ? (
            <div className="text-xl md:text-2xl font-extrabold text-primary">
              🎉 המונדיאל התחיל!
            </div>
          ) : (
            <>
              <p className="text-sm md:text-base font-extrabold text-ink-muted mb-3">
                שריקת הפתיחה בעוד
              </p>
              <div className="flex justify-center gap-2.5 md:gap-4" dir="ltr">
                <CountdownUnit
                  value={countdown.days}
                  label="ימים"
                  accent="bg-secondary"
                />
                <CountdownUnit value={countdown.hours} label="שעות" />
                <CountdownUnit value={countdown.minutes} label="דקות" accent="bg-accent" />
                <CountdownUnit value={countdown.seconds} label="שניות" />
              </div>
              <p className="text-xs text-ink-muted mt-3 font-medium">
                11 ביוני 2026 · 22:00 שעון ישראל · ארה״ב • מקסיקו • קנדה
              </p>
            </>
          )}
        </div>
      )}

      <div
        className="rounded-2xl border-2 p-3"
        style={settings.predictionsLocked
          ? { background: "#FFF3D6", borderColor: "var(--color-accent)" }
          : { background: "#F0FFE4", borderColor: "var(--color-primary)" }}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ background: settings.predictionsLocked ? "var(--color-accent)" : "var(--color-primary)" }}
            aria-hidden="true"
          />
          <span className="sr-only">
            {settings.predictionsLocked ? "סטטוס: המשחקים התחילו — ההגשה נסגרה" : "סטטוס: ניתן להגיש ולערוך טפסים"}
          </span>
          <span
            className="text-sm font-extrabold"
            style={{ color: settings.predictionsLocked ? "var(--color-accent-text)" : "var(--color-primary-dark)" }}
          >
            {settings.predictionsLocked
              ? "המשחקים התחילו — ההגשה נסגרה"
              : "ניתן להגיש ולערוך טפסים"}
          </span>
        </div>
      </div>
    </div>
  );
}
