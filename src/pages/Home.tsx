import { useSettings, useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useCountdown } from "../hooks/useCountdown";
import { createForm } from "../store";
import TournamentCountdown from "../components/TournamentCountdown";
import UpcomingMatches from "../components/UpcomingMatches";
import LiveNowCard from "../components/LiveNowCard";
import RecentlyFinishedMatches from "../components/RecentlyFinishedMatches";
import ScoreStrip from "../components/ScoreStrip";
import WelcomeBackDigest from "../components/WelcomeBackDigest";
import SummaryTeaser from "../components/SummaryTeaser";
import { useToast } from "../components/Toast";
import KickoffFooter from "../components/KickoffFooter";
import { BRAND } from "../constants/messages";

export default function Home() {
  const settings = useSettings();
  const { user } = useCurrentUser();
  const { navigate } = useNavigation();
  const countdown = useCountdown();
  const showToast = useToast();

  // Locked (tournament running) home, top to bottom:
  //   1. LiveNowCard  — live scores + per-form verdicts / next-match strip
  //   2. RecentlyFinishedMatches — matches ended in the last ~4h (result +
  //      points), placed above the upcoming list so a fresh result stays seen
  //   3. SummaryTeaser — latest daily recap (the morning visit's question)
  //   4. ScoreStrip   — official rank + today's points
  //   5. UpcomingMatches — next 24h, minus matches the hero already shows
  if (settings.predictionsLocked) {
    return (
      <div className="text-center max-w-xl mx-auto">
        <div className="pt-1 pb-2 md:pt-6 md:pb-4">
          <h1 className="font-heading text-2xl md:text-4xl font-extrabold text-ink mb-1 tracking-tight leading-tight text-balance">
            <span aria-hidden="true">⚽</span> {BRAND.tournamentTitle}
          </h1>
          <p className="text-xs md:text-base font-bold text-ink-muted">
            {BRAND.subtitle}
          </p>
        </div>
        <WelcomeBackDigest />
        <LiveNowCard />
        <RecentlyFinishedMatches />
        <SummaryTeaser />
        <ScoreStrip />
        <div className="mb-3">
          <UpcomingMatches excludeLive />
        </div>
      </div>
    );
  }

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

      <button
        onClick={() => {
          if (user) {
            try {
              const formId = createForm(user.id);
              if (formId) {
                navigate("predict", { form: formId });
                return;
              }
            } catch (err) { showToast(err.message, "error"); }
          }
          navigate("predict");
        }}
        className="btn-duo btn-duo-primary btn-duo-cta mb-3 md:mb-7"
      >
        קדימה, מלאו טופס
      </button>

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
            footerText={<KickoffFooter />}
          />
        )}
      </div>

      <div
        className="rounded-2xl border-2 p-2.5"
        style={{ background: "var(--color-primary-soft)", borderColor: "var(--color-primary)" }}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ background: "var(--color-primary)" }}
            aria-hidden="true"
          />
          <span className="sr-only">סטטוס: ניתן להגיש ולערוך טפסים</span>
          <span
            className="text-sm font-extrabold"
            style={{ color: "var(--color-primary-dark)" }}
          >
            ניתן להגיש ולערוך טפסים
          </span>
        </div>
      </div>
    </div>
  );
}
