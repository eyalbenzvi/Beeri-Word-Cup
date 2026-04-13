import { useState, useEffect } from "react";

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
    <div className="text-xs text-ink-muted/70 animate-pulse h-5">
      {AI_MESSAGES[msgIdx]}
    </div>
  );
}

export default function AIFillOverlay({ aiProgress }) {
  if (!aiProgress) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-2xl p-8 mx-4 max-w-sm w-full text-center">
        <div className="text-5xl mb-4 animate-bounce">🤖</div>
        <div className="text-lg font-extrabold text-primary mb-4">
          הבינה המלאכותית מנתחת
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700"
            style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
          />
        </div>
        <AiProgressMessage step={aiProgress.current} />
      </div>
    </div>
  );
}
