import { useSettings, useCurrentUser, useMatchResults } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useCountdown } from "../hooks/useCountdown";
import { createForm } from "../store";
import TournamentCountdown from "../components/TournamentCountdown";
import UpcomingMatches from "../components/UpcomingMatches";
import MatchdayHero from "../components/MatchdayHero";
import { useToast } from "../components/Toast";
import { LOCK_MESSAGES, BRAND } from "../constants/messages";

export default function Home() {
  const settings = useSettings();
  const { user } = useCurrentUser();
  const { navigate } = useNavigation();
  const countdown = useCountdown();
  const results = useMatchResults();
  const showToast = useToast();

  return (
    <div className="text-center max-w-xl mx-auto">
      <div className="pt-1 pb-2 md:pt-6 md:pb-6">
        <h1 className="font-heading text-2xl md:text-4xl font-extrabold text-ink mb-1 tracking-tight leading-tight text-balance">
          <span aria-hidden="true">⚽</span> {BRAND.tournamentTitle}
        </h1>
        <p className="text-xs md:text-base font-bold text-ink-muted">
          {BRAND.subtitle}
        </p>
      </div>

      {settings.predictionsLocked && <MatchdayHero results={results} />}

      {!settings.predictionsLocked && (
        <button
          onClick={() => {
            if (user) {
              try { createForm(user.id); } catch (err) { showToast(err.message, "error"); }
            }
            navigate("predict");
          }}
          className="btn-duo btn-duo-primary btn-duo-cta mb-3 md:mb-7"
        >
          קדימה, מלאו טופס
        </button>
      )}

      {settings.predictionsLocked ? (
        <div className="mb-3">
          <UpcomingMatches />
        </div>
      ) : (
        <div className="card-duo mb-3">
          {countdown.started ? (
            <div className="text-xl md:text-2xl font-extrabold text-primary">
              המונדיאל רץ
            </div>
          ) : (
            <TournamentCountdown
              countdown={countdown}
              variant="compact"
              headerText={BRAND.countdownHeader}
              footerText={<>11 ביוני 2026 · <bdi>22:00</bdi> שעון ישראל · {BRAND.hosts}</>}
            />
          )}
        </div>
      )}

      <div
        className="rounded-2xl border-2 p-2.5"
        style={settings.predictionsLocked
          ? { background: "var(--color-accent-soft-2)", borderColor: "var(--color-accent)" }
          : { background: "var(--color-primary-soft)", borderColor: "var(--color-primary)" }}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ background: settings.predictionsLocked ? "var(--color-accent)" : "var(--color-primary)" }}
            aria-hidden="true"
          />
          <span className="sr-only">
            {settings.predictionsLocked ? `סטטוס: ${LOCK_MESSAGES.tournamentStarted}` : "סטטוס: ניתן להגיש ולערוך טפסים"}
          </span>
          <span
            className="text-sm font-extrabold"
            style={{ color: settings.predictionsLocked ? "var(--color-accent-text)" : "var(--color-primary-dark)" }}
          >
            {settings.predictionsLocked
              ? LOCK_MESSAGES.tournamentStarted
              : "ניתן להגיש ולערוך טפסים"}
          </span>
        </div>
      </div>
    </div>
  );
}
