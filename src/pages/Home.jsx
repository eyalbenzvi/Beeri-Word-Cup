import { useSettings, useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useCountdown } from "../hooks/useCountdown";
import { createForm } from "../store";
import CountdownUnit from "../components/CountdownUnit";
import UpcomingMatches from "../components/UpcomingMatches";
import { useToast } from "../components/Toast";

export default function Home() {
  const settings = useSettings();
  const { user } = useCurrentUser();
  const { navigate } = useNavigation();
  const countdown = useCountdown();
  const showToast = useToast();

  return (
    <div className="text-center max-w-xl mx-auto -mb-20 md:mb-0">
      <div className="pt-2 pb-3 md:pt-8 md:pb-5">
        <div className="text-4xl md:text-6xl mb-2">⚽🏆</div>
        <h1 className="text-xl md:text-3xl font-extrabold text-primary mb-0.5 tracking-tight">
          טורניר הניחושים של בארי — מונדיאל 2026
        </h1>
      </div>

      {!settings.predictionsLocked && (
        <button
          onClick={() => {
            if (user) {
              try { createForm(user.id); } catch (err) { showToast(err.message, "error"); }
            }
            navigate("predict");
          }}
          className="w-full bg-primary text-white font-extrabold py-4 rounded-2xl hover:bg-primary-light transition text-base border-none cursor-pointer shadow-md mb-3"
        >
          צור את הטופס המנצח שלך
        </button>
      )}

      {settings.predictionsLocked ? (
        <div className="mb-3">
          <UpcomingMatches />
        </div>
      ) : (
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
                <CountdownUnit
                  value={countdown.days}
                  label="ימים"
                  accent="bg-primary-light"
                />
                <CountdownUnit value={countdown.hours} label="שעות" />
                <CountdownUnit value={countdown.minutes} label="דקות" />
                <CountdownUnit value={countdown.seconds} label="שניות" />
              </div>
              <p className="text-[10px] text-ink-muted/50 mt-2">
                11 ביוני 2026 · 22:00 שעון ישראל · ארה״ב • מקסיקו • קנדה
              </p>
            </>
          )}
        </div>
      )}

      <div
        className={`rounded-2xl shadow-sm border p-3 ${
          settings.predictionsLocked
            ? "bg-amber-50 border-amber-200"
            : "bg-green-50 border-green-200"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              settings.predictionsLocked ? "bg-amber-400" : "bg-green-400"
            } animate-pulse`}
            aria-hidden="true"
          />
          <span className="sr-only">
            {settings.predictionsLocked ? "סטטוס: המשחקים התחילו — ההגשה נסגרה" : "סטטוס: ניתן להגיש ולערוך טפסים"}
          </span>
          <span
            className={`text-sm font-bold ${
              settings.predictionsLocked ? "text-amber-700" : "text-green-700"
            }`}
          >
            {settings.predictionsLocked
              ? "המשחקים התחילו — ההגשה נסגרה"
              : "ניתן להגיש ולערוך טפסים"}
          </span>
        </div>
      </div>
    </div>
  );
}
