import { useState, useEffect } from 'react';
import { useCurrentUser, useSettings } from '../hooks/useStore';
import { useNavigation } from '../hooks/useNavigation';


// World Cup 2026 kickoff: June 11, 2026, 12:00 ET (16:00 UTC)
const KICKOFF = new Date('2026-06-11T16:00:00Z').getTime();

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

function CountdownUnit({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-primary text-white w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-extrabold shadow-md tabular-nums">
        {String(value).padStart(2, '0')}
      </div>
      <span className="text-[10px] text-gray-400 font-semibold mt-1.5">{label}</span>
    </div>
  );
}

export default function Home() {
  const { user } = useCurrentUser();
  const settings = useSettings();
  const { navigate } = useNavigation();
  const countdown = useCountdown();

  return (
    <div className="text-center">
      {/* Hero */}
      <div className="py-6">
        <div className="text-5xl mb-3">⚽🏆</div>
        <h1 className="text-2xl font-extrabold text-primary mb-1.5 tracking-tight">
          טורניר הניחושים של בארי
        </h1>
        <p className="text-gray-500 text-sm font-medium">מונדיאל 2026</p>
        <p className="text-xs text-gray-400 mt-1">
          ארה״ב • מקסיקו • קנדה
        </p>
      </div>

      {/* Countdown */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-3">
        {countdown.started ? (
          <div className="text-lg font-extrabold text-green-600">🎉 המונדיאל התחיל!</div>
        ) : (
          <>
            <p className="text-xs font-bold text-gray-400 mb-3">⏱ שריקת הפתיחה בעוד</p>
            <div className="flex justify-center gap-3" dir="ltr">
              <CountdownUnit value={countdown.seconds} label="שניות" />
              <CountdownUnit value={countdown.minutes} label="דקות" />
              <CountdownUnit value={countdown.hours} label="שעות" />
              <CountdownUnit value={countdown.days} label="ימים" />
            </div>
          </>
        )}
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            settings.predictionsLocked ? 'bg-red-400' : 'bg-green-400'
          } animate-pulse`} />
          <span className="text-sm font-semibold text-gray-600">
            {settings.predictionsLocked
              ? 'הגשת טפסים נעולה'
              : 'הגשת טפסים פתוחה'}
          </span>
        </div>

        {!user && (
          <button
            onClick={() => navigate('login')}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition text-base border-none cursor-pointer shadow-sm mt-4"
          >
            התחבר למשחק
          </button>
        )}
      </div>

    </div>
  );
}
