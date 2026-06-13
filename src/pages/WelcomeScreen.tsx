// Welcome page body for logged-out visitors. Rendered as a regular page
// inside AppShell (Layout) — the shell provides the header, hamburger
// menu, mobile bottom-nav, and DesktopSideNav. This file used to be a
// stand-alone full-page replacement with its own header; we delegate
// chrome to Layout so guests see the same tab navigation that authed
// users (and other guest tabs) get.
import { useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { usePublicSettings } from "../hooks/usePublicSettings";
import TournamentCountdown from "../components/TournamentCountdown";
import UpcomingMatches from "../components/UpcomingMatches";
import LiveNowCard from "../components/LiveNowCard";
import GoogleSignInButton from "../components/GoogleSignInButton";
import PhoneSignIn from "../components/PhoneSignIn";
import KickoffFooter from "../components/KickoffFooter";
import { Phone, ArrowRight } from "lucide-react";
import { BRAND } from "../constants/messages";

export default function WelcomeScreen() {
  const countdown = useCountdown();
  const publicSettings = usePublicSettings();
  // Logged-out users have no Firestore listeners, so the store's match
  // results are empty. Use the public endpoint's results instead so the
  // "next match" widget correctly hides already-played matches.
  const results = publicSettings.matchResults;
  const [authMethod, setAuthMethod] = useState<"google" | "phone">("google");
  // Show upcoming matches when predictions are admin-locked OR kickoff has passed.
  const tournamentStarted =
    !!publicSettings?.predictionsLocked || countdown.started;
  // Until the public-settings fetch resolves we don't actually know whether
  // the admin has flipped the lock — so showing the countdown by default
  // would briefly mis-render and then snap to the upcoming-matches panel
  // once the fetch landed. Suppress the panel choice until either the
  // fetch resolves or the local kickoff-time check has flipped (kickoff is
  // a one-way door, so once true it stays true regardless of network).
  const lockStateKnown = publicSettings.loaded || countdown.started;

  // Parity with Home: when the tournament is running, show the same
  // LiveNowCard (real-time scores; guests have no forms so no verdict
  // lines) above the upcoming-matches list. The card excludes its own
  // matches from the list below via excludeLive.
  const countdownPanel = !lockStateKnown ? (
    <div className="card-duo opacity-0" aria-hidden="true">
      <TournamentCountdown
        countdown={countdown}
        variant="large"
        headerText={BRAND.countdownHeader}
        footerText={<KickoffFooter />}
      />
    </div>
  ) : tournamentStarted ? (
    <>
      <LiveNowCard matchResultsOverride={results} />
      <UpcomingMatches matchResultsOverride={results} excludeLive />
    </>
  ) : (
    <div className="card-duo">
      <TournamentCountdown
        countdown={countdown}
        variant="large"
        headerText={BRAND.countdownHeader}
        footerText={<KickoffFooter />}
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

  // Body-only — Layout owns the surrounding chrome (header + viewport
  // sizing), so this returns just the auth card + countdown. The two
  // share a centered column that caps at max-w-md on small screens and
  // widens to max-w-xl on xl+, matching the previous look inside the
  // new AppShell layout.
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-md space-y-3">
        {/* Branding */}
        <div className="text-center">
          <div className="text-4xl md:text-5xl mb-1 animate-pop-in" aria-hidden="true">
            ⚽🏆
          </div>
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-ink tracking-tight mb-1 leading-tight text-balance">
            {BRAND.tournamentTitle}
          </h1>
          <p className="text-ink-muted text-sm md:text-base font-bold">
            {BRAND.tagline}
          </p>
        </div>

        {/* Auth card */}
        <div className="text-center space-y-3 bg-white border-2 border-border rounded-3xl p-4 md:p-5 shadow-sm">
          {authPanel}
        </div>
      </div>

      {/* Countdown / upcoming-matches panel widens on xl — 4 timer units
          reach 432px at xl:w-24, too wide for max-w-md. */}
      <div className="w-full max-w-md xl:max-w-xl">{countdownPanel}</div>
    </div>
  );
}
