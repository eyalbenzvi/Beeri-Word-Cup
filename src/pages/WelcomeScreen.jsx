import { useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import CountdownUnit from "../components/CountdownUnit";
import GoogleSignInButton from "../components/GoogleSignInButton";
import MenuOverlay from "../components/MenuOverlay";
import { Menu } from "lucide-react";

export default function WelcomeScreen() {
  const countdown = useCountdown();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="h-dvh bg-bg flex flex-col overflow-hidden">
      {/* Header with hamburger */}
      <header className="header-gradient text-white sticky top-0 z-50 shadow-lg border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="text-white/90 bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-white"
              aria-label="תפריט"
            >
              <Menu size={22} />
            </button>
            <span className="text-lg font-bold flex items-center gap-2 tracking-tight">
              <img src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png" alt="בארי" className="h-9 w-auto object-contain" />
              בארי מונדיאל
            </span>
          </div>
        </div>
      </header>
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 min-h-0">
      <div className="w-full max-w-md text-center space-y-3">
        <div>
          <div className="text-4xl md:text-5xl mb-1">⚽🏆</div>
          <h1 className="text-lg md:text-3xl font-extrabold text-primary tracking-tight mb-0.5">
            טורניר הניחושים של בארי
          </h1>
          <p className="text-ink-muted text-xs">מונדיאל 2026</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-4 md:p-6">
          {countdown.started ? (
            <div className="text-lg md:text-2xl font-extrabold text-green-600">
              🎉 המונדיאל התחיל!
            </div>
          ) : (
            <>
              <p className="text-[11px] md:text-sm font-bold text-ink-muted mb-2 md:mb-4">
                שריקת הפתיחה בעוד
              </p>
              <div className="flex justify-center gap-2.5 md:gap-4" dir="ltr">
                <CountdownUnit value={countdown.seconds} label="שניות" />
                <CountdownUnit value={countdown.minutes} label="דקות" />
                <CountdownUnit value={countdown.hours} label="שעות" />
                <CountdownUnit
                  value={countdown.days}
                  label="ימים"
                  accent="bg-primary-light"
                />
              </div>
              <p className="text-[10px] text-ink-muted/50 mt-2">
                11 ביוני 2026 · 19:00 שעון ישראל · ארה״ב • מקסיקו • קנדה
              </p>
            </>
          )}
        </div>

        <div className="pt-1">
          <GoogleSignInButton />
        </div>
      </div>
      </div>
    </div>
  );
}
