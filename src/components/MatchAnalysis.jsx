import { useState, useCallback, useRef } from "react";

const analysisCache = {};

function cacheKey(homeTeam, awayTeam, stage) {
  return `${homeTeam}-${awayTeam}-${stage}`;
}

export default function MatchAnalysis({
  homeTeam,
  awayTeam,
  homeTeamName,
  awayTeamName,
  stage,
  group,
  onAccept,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);

  const fetchAnalysis = useCallback(async () => {
    const key = cacheKey(homeTeam, awayTeam, stage);
    if (analysisCache[key]) {
      setResult(analysisCache[key]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { auth: firebaseAuth } = await import("../firebase.js");
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("נדרשת התחברות לניתוח AI");
      }
      const res = await fetch("/.netlify/functions/match-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          homeTeam: homeTeamName,
          awayTeam: awayTeamName,
          stage,
          group,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || `שגיאה ${res.status}`);
      if (data.error) throw new Error(data.error);
      analysisCache[key] = data;
      setResult(data);
    } catch (err) {
      setError(err.message || "ניתוח לא זמין כרגע");
    } finally {
      setLoading(false);
    }
  }, [homeTeam, awayTeam, homeTeamName, awayTeamName, stage, group]);

  // Auto-fetch on mount
  if (!fetchedRef.current) {
    fetchedRef.current = true;
    fetchAnalysis();
  }

  return (
    <div className="border-2 border-secondary/30 rounded-2xl p-4 mt-2 animate-fade-in" style={{ background: "#F0F9FF" }}>
      {loading && (
        <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-3">
          <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-secondary font-extrabold">
            מנתח את המשחק...
          </span>
        </div>
      )}

      {error && (
        <div className="text-center py-2">
          <p className="text-sm text-danger font-bold mb-3">{error}</p>
          <div className="flex justify-center gap-2">
            <button onClick={fetchAnalysis} className="btn-duo-flat" style={{ background: "var(--color-secondary)", color: "white" }}>
              נסה שוב
            </button>
            <button onClick={onClose} className="btn-duo-flat">
              סגור
            </button>
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-lg">🤖</span>
            <span className="text-sm font-extrabold text-secondary">ניתוח AI</span>
          </div>

          <p className="text-sm text-ink leading-relaxed mb-3 text-right font-medium">
            {result.analysis}
          </p>

          <div className="flex items-center justify-center gap-2 mb-3 bg-white rounded-xl py-2.5 border-2 border-secondary/20">
            <span className="text-sm font-bold text-ink-muted">
              תוצאה מומלצת:
            </span>
            <span className="text-lg font-extrabold text-secondary" dir="ltr">
              {result.homeScore} - {result.awayScore}
            </span>
          </div>

          <div className="flex gap-2">
            <button onClick={() => onAccept(result.homeScore, result.awayScore)} className="btn-duo btn-duo-blue flex-1" style={{ padding: "0.65rem 1rem", fontSize: "0.85rem" }}>
              ✅ קבל תוצאה
            </button>
            <button onClick={onClose} className="btn-duo btn-duo-ghost flex-1" style={{ padding: "0.65rem 1rem", fontSize: "0.85rem" }}>
              ❌ דחה
            </button>
          </div>
        </>
      )}
    </div>
  );
}
