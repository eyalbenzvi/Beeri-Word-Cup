import { useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { usePublicSettings } from "../hooks/usePublicSettings";
import CountdownUnit from "../components/CountdownUnit";
import UpcomingMatches from "../components/UpcomingMatches";
import GoogleSignInButton from "../components/GoogleSignInButton";
import PhoneSignIn from "../components/PhoneSignIn";
import MenuOverlay from "../components/MenuOverlay";
import { Menu } from "lucide-react";

export default function WelcomeScreen() {
  const countdown = useCountdown();
  const publicSettings = usePublicSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMethod, setAuthMethod] = useState("google"); // "google" | "phone"
  // Show upcoming matches when predictions are admin-locked OR kickoff has passed.
  const tournamentStarted = !!publicSettings?.predictionsLocked || countdown.started;

  return (
    <div className={`min-h-dvh bg-bg flex flex-col ${tournamentStarted ? "" : "h-dvh overflow-hidden"}`}>
      {/* Header with hamburger */}
      <header className="header-duo sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="text-ink-muted bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-ink rounded-lg hover:bg-bg-soft"
              aria-label="תפריט"
            >
              <Menu size={24} />
            </button>
            <span className="text-lg font-extrabold text-ink flex items-center gap-2 tracking-tight">
              <img src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png" alt="בארי" className="h-9 w-auto object-contain" />
              <span className="hidden sm:inline">בארי מונדיאל</span>
            </span>
          </div>
        </div>
      </header>
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className={`flex-1 flex flex-col items-center px-4 py-4 min-h-0 ${tournamentStarted ? "justify-start" : "justify-center"}`}>
      <div className="w-full max-w-md text-center space-y-4">
        <div>
          <div className="text-5xl md:text-6xl mb-2 animate-pop-in">⚽🏆</div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight mb-1">
            טורניר הניחושים של בארי
          </h1>
          <p className="text-ink-muted text-sm font-bold">מונדיאל 2026</p>
        </div>

        {tournamentStarted ? (
          <UpcomingMatches />
        ) : (
          <div className="card-duo-lg">
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
              12 ביוני 2026 · 00:00 שעון ישראל · ארה״ב • מקסיקו • קנדה
            </p>
          </div>
        )}

        <div className="pt-2 space-y-3">
          {authMethod === "google" ? (
            <>
              <GoogleSignInButton />
              <button
                onClick={() => setAuthMethod("phone")}
                className="w-full text-sm text-secondary font-extrabold bg-transparent border-none cursor-pointer py-1 hover:text-secondary-dark"
              >
                📱 התחבר עם מספר טלפון
              </button>
            </>
          ) : (
            <>
              <PhoneSignIn />
              <button
                onClick={() => setAuthMethod("google")}
                className="w-full text-sm text-secondary font-extrabold bg-transparent border-none cursor-pointer py-1 hover:text-secondary-dark"
              >
                ← חזור להתחברות עם Google
              </button>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
