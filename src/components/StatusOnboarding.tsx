import { useState, useEffect } from "react";
import { X } from "lucide-react";

const SEEN_KEY = "beeri:status-onboarding-seen";

// One-time inline explainer for the three form statuses. Shows on the user's
// first visit to FormList that has at least one form, and stays dismissed
// across sessions. Stored in localStorage — if a user clears it, the banner
// reappears next visit, which is the right behaviour.
export default function StatusOnboarding() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "true") setHidden(false);
    } catch {
      /* private mode / quota — keep hidden */
    }
  }, []);

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(SEEN_KEY, "true"); } catch { /* noop */ }
  };

  if (hidden) return null;

  return (
    <div
      className="card-duo mb-3 relative"
      style={{ background: "var(--color-primary-soft)", borderColor: "var(--color-primary)" }}
      role="region"
      aria-label="הסבר על מצבי טופס"
    >
      <button
        onClick={dismiss}
        aria-label="סגור הסבר"
        className="absolute top-2 left-2 text-ink-muted bg-transparent border-none cursor-pointer p-1 rounded-lg hover:bg-white/40"
      >
        <X size={16} />
      </button>
      <div className="text-sm font-extrabold text-ink mb-2 pl-7">
        מצבי הטפסים שלך
      </div>
      <ul className="text-xs text-ink space-y-1.5 font-medium leading-relaxed">
        <li>
          <span className="font-extrabold">טיוטה</span> — טרם הגשת. תוכל לערוך
          חופשי.
        </li>
        <li>
          <span className="font-extrabold">⏳ ממתין</span> — הגשת, ועכשיו ממתין
          לאישור מנהל. עדיין לא בדירוג.
        </li>
        <li>
          <span className="font-extrabold">✅ הוגש</span> — אושר על ידי המנהל
          ונכלל בדירוג. נעול עד תחילת הטורניר.
        </li>
      </ul>
      <button
        onClick={dismiss}
        className="btn-duo btn-duo-primary btn-duo-sm mt-3"
      >
        הבנתי
      </button>
    </div>
  );
}
