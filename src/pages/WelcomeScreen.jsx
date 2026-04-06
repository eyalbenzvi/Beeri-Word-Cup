import { useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { useSettings } from "../hooks/useStore";
import { useToast } from "../components/Toast";
import { signInWithGoogle } from "../firebase";
import { ensureUserInStore } from "../store";
import { ChevronDown, ChevronUp } from "lucide-react";

const SCORING_DATA = [
  ["בתים", 1, 3, 2],
  ["שלב ה-32", 3, 3, 4],
  ["שמינית גמר", 5, 3, 6],
  ["רבע גמר", 7, 3, 8],
  ["חצי גמר", 9, 3, 10],
  ["מקום שלישי", 9, 3, null],
  ["גמר", 11, 3, null],
];

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
  const showToast = useToast();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const user = await signInWithGoogle();
      const displayName =
        user.displayName || user.email?.split("@")[0] || "משתמש";
      ensureUserInStore(user.uid, displayName);
      showToast(`ברוך הבא, ${displayName}!`);
    } catch (err) {
      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        return;
      } else if (err.code === "auth/popup-blocked") {
        setError("החלון נחסם. אפשר חלונות קופצים בדפדפן");
      } else {
        setError("שגיאה בהתחברות. נסה שוב");
        console.error("Auth error:", err.code, err.message);
      }
    } finally {
      setLoading(false);
    }
  };

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
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-white text-ink font-bold min-h-[52px] py-4 rounded-2xl border-2 border-border hover:border-primary/30 hover:bg-gray-50 transition text-sm cursor-pointer flex items-center justify-center gap-3 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? "מתחבר..." : "התחבר עם Google"}
          </button>

          <p className="text-xs text-ink-muted/60">
            נרשמים בשנייה עם Google — בלי סיסמה נפרדת
          </p>

          {error && <div className="text-sm text-red-500">{error}</div>}
        </div>

        <div className="pt-2 space-y-2">
          <InfoSection title="שיטת הניקוד" icon="📊">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-muted border-b-2 border-border">
                  <th className="text-right py-2 font-semibold">שלב</th>
                  <th className="text-center py-2 font-semibold">הכרעה</th>
                  <th className="text-center py-2 font-semibold">+מדויק</th>
                  <th className="text-center py-2 font-semibold">עליה</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {SCORING_DATA.map(([stage, outcome, exact, advance], i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 font-medium">{stage}</td>
                    <td className="text-center font-bold">{outcome}</td>
                    <td className="text-center font-bold text-green-600">
                      +{exact}
                    </td>
                    <td className="text-center font-bold text-purple-600">
                      {advance ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                <span className="text-ink-muted">🏆 ניחוש אלופה</span>
                <span className="font-bold text-accent-text">9 נק׳</span>
              </div>
              <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                <span className="text-ink-muted">⚽ מלך שערים</span>
                <span className="font-bold text-accent-text">8 נק׳</span>
              </div>
            </div>
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
