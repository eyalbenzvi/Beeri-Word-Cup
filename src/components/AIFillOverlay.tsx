import { useState, useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

const AI_MESSAGES = [
  "⚽ סורק דירוגי FIFA...",
  "📊 מנתח סטטיסטיקות של נבחרות...",
  "🔍 בודק עימותים היסטוריים...",
  "🧠 מחשב הסתברויות...",
  "🌍 מעריך יתרון בית...",
  "💪 בודק פורם אחרון...",
  "🎯 מחפש הפתעות אפשריות...",
  "🏟️ מדמה תרחישי משחק...",
  "⭐ מזהה dark horses...",
  "🤔 מתלבט על תיקו פוטנציאלי...",
  "🔮 מנבא תוצאות...",
  "📝 מסכם ניתוח...",
];

function AiProgressMessage({ step }) {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    setMsgIdx(Math.floor(Math.random() * AI_MESSAGES.length));
    const interval = setInterval(() => {
      setMsgIdx((prev) => (prev + 1) % AI_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [step]);
  return (
    <div
      className="text-sm text-ink-muted font-bold animate-pulse h-5"
      role="status"
      aria-live="polite"
    >
      {AI_MESSAGES[msgIdx]}
    </div>
  );
}

export default function AIFillOverlay({ aiProgress, onCancel }: { aiProgress: any; onCancel?: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Focus-trap is gated on whether the overlay is open. Without trap, Tab
  // walks out to the form behind, and ESC silently swallowed by the body.
  useFocusTrap(dialogRef, !!aiProgress);
  useEffect(() => {
    if (!aiProgress || !onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiProgress, onCancel]);

  if (!aiProgress) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="מילוי אוטומטי בעזרת AI"
    >
      <div ref={dialogRef} className="bg-white rounded-3xl p-8 mx-4 max-w-sm w-full text-center border-2 border-border animate-pop-in">
        <div className="text-6xl mb-4 animate-bounce" aria-hidden="true">🤖</div>
        <div className="text-xl font-extrabold text-ink mb-4">
          הבינה המלאכותית מנתחת
        </div>
        <div
          className="w-full rounded-full h-4 mb-4 overflow-hidden border-2 border-border"
          style={{ background: "var(--color-bg-soft)" }}
          role="progressbar"
          aria-valuenow={aiProgress.current}
          aria-valuemin={0}
          aria-valuemax={aiProgress.total}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%`, background: "linear-gradient(90deg, var(--color-secondary), var(--color-purple))" }}
          />
        </div>
        <AiProgressMessage step={aiProgress.current} />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-duo btn-duo-ghost btn-duo-sm mt-4"
          >
            ביטול
          </button>
        )}
      </div>
    </div>
  );
}
