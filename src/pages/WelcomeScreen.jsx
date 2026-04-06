import { useCountdown } from "../hooks/useCountdown";
import CountdownUnit from "../components/CountdownUnit";
import GoogleSignInButton from "../components/GoogleSignInButton";

export default function WelcomeScreen() {
  const countdown = useCountdown();

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center space-y-4">
        <div>
          <img
            src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png"
            alt="בארי"
            className="h-14 w-auto object-contain mx-auto mb-3"
          />
          <h1 className="text-2xl md:text-3xl font-extrabold text-primary tracking-tight mb-0.5">
            טורניר הניחושים של בארי
          </h1>
          <p className="text-ink-muted text-sm">מונדיאל 2026</p>
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
  );
}
