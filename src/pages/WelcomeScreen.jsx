import { useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { useSettings } from "../hooks/useStore";
import CountdownUnit from "../components/CountdownUnit";
import GoogleSignInButton from "../components/GoogleSignInButton";
import ScoringTable from "../components/ScoringTable";
import { ChevronDown, ChevronUp } from "lucide-react";

function InfoSection({ title, icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3.5 bg-transparent border-none cursor-pointer text-right"
      >
        <span className="text-ink-muted">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
        <span className="text-sm font-bold text-primary">
          {icon} {title}
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function WelcomeScreen() {
  const countdown = useCountdown();
  const settings = useSettings();

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

        <div className="pt-1 space-y-3">
          <GoogleSignInButton />

          <p className="text-xs text-ink-muted/60">
            נרשמים בשנייה עם Google — בלי סיסמה נפרדת
          </p>
        </div>

        <div className="pt-2 space-y-2">
          <InfoSection title="שיטת הניקוד" icon="📊">
            <ScoringTable />
          </InfoSection>

          <InfoSection title="החוקים" icon="📜">
            <div className="text-right text-xs text-ink-muted space-y-2 leading-relaxed">
              <p>• כל משתתף ממלא טופס ניחושים לכל משחקי המונדיאל.</p>
              <p>• ניתן להגיש יותר מטופס אחד.</p>
              <p>• ניקוד מחושב אוטומטית לפי תוצאות בפועל.</p>
              <p>• ניחוש הכרעה נכונה (ניצחון/תיקו) מזכה בנקודות בסיס.</p>
              <p>• ניחוש תוצאה מדויקת מזכה בבונוס נוסף.</p>
              <p>• ניחוש נכון של קבוצה עולה בנוקאאוט מזכה בנקודות עליה.</p>
              <p>• בונוסים ניתנים על ניחוש אלופה ומלך שערים.</p>
              <p>• הטפסים ננעלים לפני שריקת הפתיחה.</p>
            </div>
          </InfoSection>
        </div>
      </div>
    </div>
  );
}
