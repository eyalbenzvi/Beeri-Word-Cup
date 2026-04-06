import { useState, useEffect } from "react";
import { useCurrentUser, useSettings } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";

const KICKOFF = new Date("2026-06-11T16:00:00Z").getTime();

function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, KICKOFF - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    started: diff === 0,
  };
}

function CountdownUnit({ value, label, accent }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`${accent || "bg-primary"} text-white w-12 h-12 md:w-18 md:h-18 rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-3xl font-extrabold shadow-md tabular-nums`}
      >
        {String(value).padStart(2, "0")}
      </div>
      <span className="text-[10px] md:text-xs text-ink-muted font-semibold mt-1.5">
        {label}
      </span>
    </div>
  );
}

export default function Home() {
  const { user } = useCurrentUser();
  const settings = useSettings();
  const { navigate } = useNavigation();
  const countdown = useCountdown();

  return (
    <div className="text-center max-w-xl mx-auto -mb-20 md:mb-0">
      <div className="pt-2 pb-3 md:pt-8 md:pb-5">
        <div className="text-4xl md:text-6xl mb-2">⚽🏆</div>
        <h1 className="text-xl md:text-3xl font-extrabold text-primary mb-0.5 tracking-tight">
          טורניר הניחושים של בארי — מונדיאל 2026
        </h1>
      </div>

      {!user && !settings.predictionsLocked && (
        <button
          onClick={() => navigate("login")}
          className="w-full bg-secondary text-white font-extrabold py-4 rounded-2xl hover:bg-secondary/90 transition text-base border-none cursor-pointer shadow-md mb-3"
        >
          התחבר והתחל לנחש
        </button>
      )}

      {user && !settings.predictionsLocked && (
        <button
          onClick={() => navigate("predict")}
          className="w-full bg-secondary text-white font-extrabold py-4 rounded-2xl hover:bg-secondary/90 transition text-base border-none cursor-pointer shadow-md mb-3"
        >
          מלא ניחושים עכשיו
        </button>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-border p-4 md:p-7 mb-3">
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

      <div
        className={`rounded-2xl shadow-sm border p-3 ${
          settings.predictionsLocked
            ? "bg-red-50 border-red-200"
            : "bg-green-50 border-green-200"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              settings.predictionsLocked ? "bg-red-400" : "bg-green-400"
            } animate-pulse`}
          />
          <span
            className={`text-sm font-bold ${
              settings.predictionsLocked ? "text-red-700" : "text-green-700"
            }`}
          >
            {settings.predictionsLocked
              ? "הגשת טפסים נעולה"
              : "הגשת טפסים פתוחה"}
          </span>
        </div>
      </div>
    </div>
  );
}
