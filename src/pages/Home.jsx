import { useMemo } from "react";
import { Newspaper } from "lucide-react";
import { useSettings, useCurrentUser, useMatchResults, useSummaries } from "../hooks/useStore";
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
  const summaries = useSummaries();
  const showToast = useToast();

  const latestSummary = useMemo(() => {
    const published = Object.values(summaries || {})
      .filter((s) => s.status === "published")
      .sort((a, b) => (a.number || 0) - (b.number || 0));
    return published.length > 0 ? published[published.length - 1] : null;
  }, [summaries]);

  return (
    <div className="text-center max-w-xl mx-auto">
      <div className="pt-2 pb-3 md:pt-6 md:pb-6">
        <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-ink mb-1 tracking-tight leading-tight text-balance">
          <span aria-hidden="true">⚽</span> {BRAND.tournamentTitle}
        </h1>
        <p className="text-sm md:text-base font-bold text-ink-muted">
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
          className="btn-duo btn-duo-primary btn-duo-cta mb-7"
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

      {latestSummary && (
        <button
          onClick={() => navigate("blog", { n: latestSummary.number })}
          className="w-full text-right card-duo-tight bg-transparent cursor-pointer transition hover:border-primary mb-3 flex items-center gap-3"
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--color-primary-soft)" }}
          >
            <Newspaper size={20} className="text-primary-dark" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-extrabold text-secondary tracking-wider uppercase">
              בלוג · סיכום #{latestSummary.number}
            </div>
            <div className="text-sm font-extrabold text-ink truncate">
              {latestSummary.title || `סיכום #${latestSummary.number}`}
            </div>
          </div>
          <span className="text-lg text-ink-muted" aria-hidden="true">‹</span>
        </button>
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
