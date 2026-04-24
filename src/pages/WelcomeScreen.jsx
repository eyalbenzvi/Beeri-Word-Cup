import { useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { usePublicSettings } from "../hooks/usePublicSettings";
import CountdownUnit from "../components/CountdownUnit";
import UpcomingMatches from "../components/UpcomingMatches";
import GoogleSignInButton from "../components/GoogleSignInButton";
import PhoneSignIn from "../components/PhoneSignIn";
import MenuOverlay from "../components/MenuOverlay";
import { Menu, Phone, ArrowRight, Info } from "lucide-react";

export default function WelcomeScreen() {
  const countdown = useCountdown();
  const publicSettings = usePublicSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMethod, setAuthMethod] = useState("google"); // "google" | "phone"
  // Show upcoming matches when predictions are admin-locked OR kickoff has passed.
  const tournamentStarted = !!publicSettings?.predictionsLocked || countdown.started;

  const countdownPanel = tournamentStarted ? (
    <UpcomingMatches />
  ) : (
    <div className="card-duo-lg">
      <p className="text-sm md:text-base font-extrabold text-ink-muted mb-3">
        עוד עד שריקת הפתיחה
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
        12 ביוני 2026 · <bdi>00:00</bdi> שעון ישראל · ארה״ב • מקסיקו • קנדה
      </p>
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
    <div className={`min-h-dvh bg-bg flex flex-col ${tournamentStarted ? "" : "lg:h-dvh lg:overflow-hidden"}`}>
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
              <img src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png" alt="בארי" className="h-9 w-auto object-contain" />
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

      {/* Main — mobile: centered column, lg+: two-column split */}
      <div className={`flex-1 px-4 md:px-6 py-4 md:py-6 min-h-0 flex flex-col items-center ${tournamentStarted ? "justify-start" : "justify-center lg:justify-start"}`}>
        <div className="w-full max-w-md lg:max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10 lg:items-center lg:pt-4">
          {/* LEFT (RTL: appears on LEFT visually) — tournament hype panel */}
          <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:order-last">
            <div className="text-center lg:text-right">
              <div className="text-6xl mb-3" aria-hidden="true">⚽🏆</div>
              <h1 className="font-heading text-4xl xl:text-5xl font-extrabold text-ink tracking-tight mb-1 leading-tight">
                טורניר הניחושים של בארי
              </h1>
              <p className="text-ink-muted font-bold mb-4">מונדיאל 2026 · ארה״ב • מקסיקו • קנדה</p>
            </div>
            {countdownPanel}
          </div>

          {/* RIGHT (RTL: appears on RIGHT visually) — auth card */}
          <div className="text-center space-y-4 lg:bg-white lg:border-2 lg:border-border lg:rounded-3xl lg:p-8 lg:shadow-sm lg:order-first">
            {/* Mobile-only branding (desktop has it in left panel) */}
            <div className="lg:hidden">
              <div className="text-5xl md:text-6xl mb-2 animate-pop-in" aria-hidden="true">⚽🏆</div>
              <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-ink tracking-tight mb-1">
                טורניר הניחושים של בארי
              </h1>
              <p className="text-ink-muted text-sm font-bold">מונדיאל 2026</p>
            </div>
            {/* Desktop-only auth heading */}
            <div className="hidden lg:block text-right">
              <h2 className="font-heading text-2xl font-extrabold text-ink tracking-tight">
                התחברות
              </h2>
              <p className="text-ink-muted text-sm font-medium mt-1">
                חברו עם גוגל או עם מספר טלפון כדי להתחיל לנחש
              </p>
            </div>

            {/* Mobile-only countdown (desktop has it in left panel) */}
            <div className="lg:hidden">{countdownPanel}</div>

            {authPanel}
          </div>
        </div>
      </div>
    </div>
  );
}
