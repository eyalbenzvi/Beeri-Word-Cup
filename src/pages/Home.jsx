import { useState, useEffect } from 'react';
import { useCurrentUser, useSettings } from '../hooks/useStore';
import { useNavigation } from '../hooks/useNavigation';

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

function CountdownUnit({ value, label, accent }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`${accent || 'bg-primary'} text-white w-14 h-14 md:w-18 md:h-18 rounded-2xl flex items-center justify-center text-2xl md:text-3xl font-extrabold shadow-md tabular-nums`}>
        {String(value).padStart(2, '0')}
      </div>
      <span className="text-[10px] md:text-xs text-gray-400 font-semibold mt-1.5">{label}</span>
    </div>
  );
}

export default function Home() {
  const { user } = useCurrentUser();
  const settings = useSettings();
  const { navigate } = useNavigation();
  const countdown = useCountdown();

  return (
    <div className="text-center max-w-xl mx-auto">
      {/* Hero */}
      <div className="pt-4 pb-3 md:pt-8 md:pb-5">
        <div className="text-5xl md:text-6xl mb-3">⚽🏆</div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary mb-1 tracking-tight">
          טורניר הניחושים של בארי
        </h1>
        <p className="text-gray-500 text-sm md:text-base font-medium">מונדיאל 2026</p>
        <p className="text-xs text-gray-400 mt-0.5">
          ארה״ב • מקסיקו • קנדה
        </p>
      </div>

      {/* Countdown */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-7 mb-3">
        {countdown.started ? (
          <div className="text-lg md:text-2xl font-extrabold text-green-600">🎉 המונדיאל התחיל!</div>
        ) : (
          <>
            <p className="text-xs md:text-sm font-bold text-gray-400 mb-3 md:mb-4">⏱ שריקת הפתיחה בעוד</p>
            <div className="flex justify-center gap-2.5 md:gap-4" dir="ltr">
              <CountdownUnit value={countdown.seconds} label="שניות" />
              <CountdownUnit value={countdown.minutes} label="דקות" />
              <CountdownUnit value={countdown.hours} label="שעות" />
              <CountdownUnit value={countdown.days} label="ימים" accent="bg-primary-light" />
            </div>
            <p className="text-[10px] text-gray-300 mt-3">11 ביוני 2026, 19:00 שעון ישראל</p>
          </>
        )}
      </div>

      {/* Status */}
      <div className={`rounded-2xl shadow-sm border p-4 ${
        settings.predictionsLocked
          ? 'bg-red-50 border-red-200'
          : 'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-center justify-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${
            settings.predictionsLocked ? 'bg-red-400' : 'bg-green-400'
          } animate-pulse`} />
          <span className={`text-sm font-bold ${
            settings.predictionsLocked ? 'text-red-700' : 'text-green-700'
          }`}>
            {settings.predictionsLocked
              ? 'הגשת טפסים נעולה'
              : 'הגשת טפסים פתוחה — מלא ניחושים עכשיו!'}
          </span>
        </div>

        {!user && (
          <button
            onClick={() => navigate('login')}
            className="w-full md:w-auto md:px-12 bg-primary text-white font-bold py-3 rounded-2xl hover:bg-primary-light transition text-sm border-none cursor-pointer shadow-sm mt-3"
          >
            התחבר והצטרף למשחק
          </button>
        )}
      </div>
    </div>
  );
}
