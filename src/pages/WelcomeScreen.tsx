import { useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { usePublicSettings } from "../hooks/usePublicSettings";
import TournamentCountdown from "../components/TournamentCountdown";
import UpcomingMatches from "../components/UpcomingMatches";
import MatchdayHero from "../components/MatchdayHero";
import GoogleSignInButton from "../components/GoogleSignInButton";
import PhoneSignIn from "../components/PhoneSignIn";
import MenuOverlay from "../components/MenuOverlay";
import { Menu, Phone, ArrowRight, Info } from "lucide-react";
import { BRAND } from "../constants/messages";

export default function WelcomeScreen() {
  const countdown = useCountdown();
  const publicSettings = usePublicSettings();
  // Logged-out users have no Firestore listeners, so the store's match
  // results are empty. Use the public endpoint's results instead so the
  // "next match" widget correctly hides already-played matches.
  const results = publicSettings.matchResults;
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMethod, setAuthMethod] = useState("google"); // "google" | "phone"
  // Show upcoming matches when predictions are admin-locked OR kickoff has passed.
  const tournamentStarted = !!publicSettings?.predictionsLocked || countdown.started;

  // Parity with Home: when the tournament is running, show the same
  // MatchdayHero (featured today's match) above the upcoming-matches list
  // so logged-in and logged-out users see the same current match.
  // MatchdayHero carries its own mb-4 — no wrapper spacing needed.
  const countdownPanel = tournamentStarted ? (
    <>
      <MatchdayHero results={results} />
      <UpcomingMatches matchResultsOverride={results} />
    </>
  ) : (
    <div className="card-duo">
      <TournamentCountdown
        countdown={countdown}
        variant="large"
        headerText={BRAND.countdownHeader}
        footerText={<>11 ביוני 2026 · <bdi>22:00</bdi> שעון ישראל · {BRAND.hosts}</>}
      />
    </div>
  );

  const authPanel = (
    <div className="pt-2 space-y-3">
      {authMethod === "google" ? (
        <>
          <GoogleSignInButton />
          <button
            onClick={() => setAuthMethod("phone")}
            className="btn-duo btn-duo-ghost-raised w-full"
          >
            <Phone size={20} aria-hidden="true" />
            התחבר עם מספר טלפון
          </button>
        </>
      ) : (
        <>
          <PhoneSignIn />
          <button
            onClick={() => setAuthMethod("google")}
            className="w-full text-sm text-secondary font-extrabold bg-transparent border-none cursor-pointer py-1 hover:text-secondary-dark flex items-center justify-center gap-1"
          >
            <ArrowRight size={16} aria-hidden="true" />
            חזור להתחברות עם Google
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {/* Header */}
      <header className="header-duo sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="text-ink-muted bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-ink rounded-xl hover:bg-bg-soft lg:hidden"
              aria-label="תפריט"
            >
              <Menu size={24} />
            </button>
            <span className="text-lg font-extrabold text-ink flex items-center gap-2 tracking-tight">
              <img src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png" alt="בארי" width="36" height="36" loading="eager" decoding="async" className="h-9 w-auto object-contain" />
              <span className="hidden sm:inline">בארי מונדיאל</span>
            </span>
          </div>
          {/* Desktop: info button in header (no hamburger) */}
          <button
            onClick={() => setMenuOpen(true)}
            className="hidden lg:inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted bg-transparent border-none cursor-pointer hover:text-ink px-3 py-1.5 rounded-xl hover:bg-bg-soft"
            aria-label="מידע וחוקים"
          >
            <Info size={18} aria-hidden="true" />
            מידע
          </button>
        </div>
      </header>
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex-1 px-4 md:px-6 py-3 md:py-6 min-h-0 flex flex-col items-center justify-start gap-3">
        <div className="w-full max-w-md space-y-3">
          {/* Branding */}
          <div className="text-center">
            <div className="text-4xl md:text-5xl mb-1 animate-pop-in" aria-hidden="true">⚽🏆</div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-ink tracking-tight mb-1 leading-tight text-balance">
              {BRAND.tournamentTitle}
            </h1>
            <p className="text-ink-muted text-sm md:text-base font-bold">{BRAND.tagline}</p>
          </div>

          {/* Auth card */}
          <div className="text-center space-y-3 bg-white border-2 border-border rounded-3xl p-4 md:p-5 shadow-sm">
            {authPanel}
          </div>
        </div>

        {/* Countdown/upcoming-matches panel widens on xl — 4 timer units reach 432px at xl:w-24, too wide for max-w-md. */}
        <div className="w-full max-w-md xl:max-w-xl">
          {countdownPanel}
        </div>
      </div>
    </div>
  );
}
