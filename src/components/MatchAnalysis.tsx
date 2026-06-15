import { useState, useCallback, useEffect, useRef } from "react";
import InlineError from "./InlineError";

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
  const abortRef = useRef(null);

  const fetchAnalysis = useCallback(async () => {
    const key = cacheKey(homeTeam, awayTeam, stage);
    if (analysisCache[key]) {
      setResult(analysisCache[key]);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || `שגיאה ${res.status}`);
      if (data.error) throw new Error(data.error);
      analysisCache[key] = data;
      if (!controller.signal.aborted) setResult(data);
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err.message || "ניתוח לא זמין כרגע");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [homeTeam, awayTeam, homeTeamName, awayTeamName, stage, group]);

  // Auto-fetch on mount; runs once per cache-key change. Side-effects belong
  // in useEffect — calling fetch from render body is undefined behaviour and
  // double-fires under StrictMode in dev.
  useEffect(() => {
    fetchAnalysis();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchAnalysis]);

  return (
    <div className="border-2 border-secondary/30 rounded-2xl p-4 mt-2 animate-fade-in" style={{ background: "var(--color-secondary-soft)" }}>
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
          <InlineError align="center" className="mb-3">{error}</InlineError>
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
              {result.awayScore} - {result.homeScore}
            </span>
          </div>

          <div className="flex gap-2">
            <button onClick={() => onAccept(result.homeScore, result.awayScore)} className="btn-duo btn-duo-blue btn-duo-sm flex-1">
              ✅ קבל תוצאה
            </button>
            <button onClick={onClose} className="btn-duo btn-duo-ghost btn-duo-sm flex-1">
              ❌ דחה
            </button>
          </div>
        </>
      )}
    </div>
  );
}
