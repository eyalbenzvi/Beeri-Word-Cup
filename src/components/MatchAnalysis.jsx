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
      const res = await fetch("/.netlify/functions/match-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-xl p-4 mt-2 animate-fade-in">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-3">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-blue-600 font-medium">
            מנתח את המשחק...
          </span>
        </div>
      )}

      {error && (
        <div className="text-center py-2">
          <p className="text-sm text-red-500 mb-2">{error}</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={fetchAnalysis}
              className="text-sm bg-blue-100 text-blue-700 px-4 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-200 transition"
            >
              נסה שוב
            </button>
            <button
              onClick={onClose}
              className="text-sm bg-gray-100 text-gray-600 px-4 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200 transition"
            >
              סגור
            </button>
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">🤖</span>
            <span className="text-sm font-bold text-blue-700">ניתוח AI</span>
          </div>

          <p className="text-sm text-ink-muted leading-relaxed mb-3 text-right">
            {result.analysis}
          </p>

          <div className="flex items-center justify-center gap-2 mb-3 bg-white rounded-lg py-2.5 border border-blue-100">
            <span className="text-sm font-bold text-ink-muted">
              תוצאה מומלצת:
            </span>
            <span className="text-base font-extrabold text-blue-700" dir="ltr">
              {result.homeScore} - {result.awayScore}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onAccept(result.homeScore, result.awayScore)}
              className="flex-1 text-sm font-bold bg-blue-600 text-white py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-700 transition"
            >
              ✅ קבל תוצאה
            </button>
            <button
              onClick={onClose}
              className="flex-1 text-sm font-bold bg-gray-100 text-gray-600 py-2.5 rounded-lg border-none cursor-pointer hover:bg-gray-200 transition"
            >
              ❌ דחה
            </button>
          </div>
        </>
      )}
    </div>
  );
}
