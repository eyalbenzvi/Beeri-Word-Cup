import React, { useRef, useCallback, useState, useEffect } from "react";
import { getTeamByCode } from "../data/teams";
import MatchAnalysis from "./MatchAnalysis";

function focusNextInput(currentInput) {
  const card = currentInput.closest("[data-match-card]");
  if (!card) return;

  const inputs = card.querySelectorAll('input[type="number"]');
  const idx = Array.from(inputs).indexOf(currentInput);
  if (idx < inputs.length - 1) {
    inputs[idx + 1].focus();
    inputs[idx + 1].select();
    return;
  }

  // Use nextElementSibling traversal instead of querying all cards in DOM
  let nextCard = card.parentElement?.nextElementSibling;
  while (nextCard) {
    const cardEl = nextCard.querySelector("[data-match-card]") || (nextCard.hasAttribute("data-match-card") ? nextCard : null);
    if (cardEl) {
      const nextInput = cardEl.querySelector('input[type="number"]');
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
        nextInput.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    nextCard = nextCard.nextElementSibling;
  }
}

function MatchCard({
  match,
  prediction,
  actualResult,
  onPredictionChange,
  editable = false,
  showPoints = false,
  points = null,
  isKnockout = false,
  importance = "group",
}) {
  const homeInputRef = useRef(null);
  const awayInputRef = useRef(null);
  const [justSaved, setJustSaved] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const saveTimerRef = useRef(null);

  const prevPredRef = useRef(prediction);
  useEffect(() => {
    const prev = prevPredRef.current;
    prevPredRef.current = prediction;
    if (!editable || !prev) return;
    const prevH = prev?.homeScore;
    const prevA = prev?.awayScore;
    const curH = prediction?.homeScore;
    const curA = prediction?.awayScore;
    if (prevH === curH && prevA === curA) return;
    if (curH != null && curA != null) {
      clearTimeout(saveTimerRef.current);
      setJustSaved(true);
      saveTimerRef.current = setTimeout(() => setJustSaved(false), 800);
    }
    return () => clearTimeout(saveTimerRef.current);
  }, [prediction, editable]);

  const homeTeam = getTeamByCode(match.homeTeam);
  const awayTeam = getTeamByCode(match.awayTeam);
  const homeName = homeTeam?.name || "טרם נקבע";
  const awayName = awayTeam?.name || "טרם נקבע";
  const predHome = prediction?.homeScore ?? "";
  const predAway = prediction?.awayScore ?? "";
  const hasResult = actualResult && actualResult.homeScore !== null;
  const hasPrediction = predHome !== "" && predAway !== "";
  const showLabel = match.label && match.stage !== "group" && !/^W\d+\s+vs\s+W\d+$/.test(match.label);

  const importanceStyles = {
    group: "p-4",
    knockout: "p-4",
    showcase: "p-4 ring-2 ring-accent/50 shadow-md",
  };

  const nameStyles = {
    group: "text-sm font-medium",
    knockout: "text-[15px] font-medium",
    showcase: "text-base font-medium",
  };

  const clampScore = (raw) => {
    if (raw === "") return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(20, n));
  };

  const handleHomeChange = useCallback(
    (e) => {
      const raw = e.target.value;
      const v = clampScore(raw);
      const p = { ...prediction, homeScore: v };
      if (isKnockout) delete p.advancingTeam;
      onPredictionChange?.(p);
      if (raw.length === 1 && v !== null && v >= 0 && v <= 9) {
        setTimeout(() => {
          awayInputRef.current?.focus();
          awayInputRef.current?.select();
        }, 0);
      }
    },
    [prediction, isKnockout, onPredictionChange],
  );

  const handleAwayChange = useCallback(
    (e) => {
      const raw = e.target.value;
      const v = clampScore(raw);
      const p = { ...prediction, awayScore: v };
      if (isKnockout) delete p.advancingTeam;
      onPredictionChange?.(p);
      if (raw.length === 1 && v !== null && v >= 0 && v <= 9) {
        setTimeout(() => {
          if (awayInputRef.current) focusNextInput(awayInputRef.current);
        }, 0);
      }
    },
    [prediction, isKnockout, onPredictionChange],
  );

  return (
    <div
      data-match-card
      className={`bg-white rounded-2xl border mb-0.5 transition-all card-hover ${importanceStyles[importance]} ${
        justSaved
          ? "animate-save-flash border-accent"
          : hasResult
            ? "border-primary/25"
            : hasPrediction && !editable
              ? "border-green-200/80"
              : "border-border"
      }`}
    >
      {importance === "showcase" && (
        <div className="h-1 w-full rounded-full bg-gradient-to-l from-secondary via-accent to-primary mb-3 -mt-1" />
      )}

      {(showLabel || match.date) && (
        <div className="flex justify-between items-center mb-2">
          {showLabel ? (
            <span
              className={`text-[11px] font-medium ${importance === "knockout" || importance === "showcase" ? "text-secondary/90" : "text-ink-muted"}`}
            >
              {match.label}
            </span>
          ) : <span />}
          <span className="text-[11px] text-ink-muted/60">
            {[match.date, match.time, match.venue].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      {showPoints && points !== null && (
        <div className="flex justify-end mb-1.5">
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
              points.points > 0
                ? "bg-green-50 text-green-700"
                : "bg-gray-50 text-ink-muted"
            }`}
          >
            {points.points > 0 ? `+${points.points}` : "0"} נק׳
            {points.breakdown ? ` — ${points.breakdown}` : ""}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-center">
          <div
            className={`${nameStyles[importance]} ${homeTeam ? "text-ink" : "text-ink-muted/60 italic"}`}
          >
            <bdi>{homeName}</bdi>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 min-w-[130px]">
          {hasResult && (
            <div className="text-2xl font-extrabold text-primary tracking-wider tabular-nums">
              <span dir="ltr">{actualResult.awayScore} – {actualResult.homeScore}</span>
            </div>
          )}

          {editable ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={() => { const v = Math.min(20, (parseInt(predHome) || 0) + 1); const p = {...prediction, homeScore: v}; if (isKnockout) delete p.advancingTeam; onPredictionChange?.(p); }}
                    className="w-6 h-6 text-xs bg-gray-100 rounded-full border-none cursor-pointer text-gray-500 hover:bg-gray-200" disabled={!editable}>+</button>
                  <input
                    ref={homeInputRef}
                    type="number"
                    min="0"
                    max="20"
                    inputMode="numeric"
                    aria-label={`ניחוש גולים ${homeTeam?.name || match.homeTeam || 'ביתית'} (0-20)`}
                    value={predHome}
                    onChange={handleHomeChange}
                    className={`min-w-[44px] min-h-[44px] md:min-w-[52px] md:min-h-[52px] text-center border-2 rounded-2xl text-xl font-bold tabular-nums transition-colors bg-gradient-to-b from-white to-gray-50 shadow-inner focus:ring-2 focus:ring-accent/40 focus:border-accent ${
                      hasPrediction ? "border-primary/30" : "border-border"
                    }`}
                    placeholder="–"
                  />
                  <button type="button" onClick={() => { const v = Math.max(0, (parseInt(predHome) || 0) - 1); const p = {...prediction, homeScore: v}; if (isKnockout) delete p.advancingTeam; onPredictionChange?.(p); }}
                    className="w-6 h-6 text-xs bg-gray-100 rounded-full border-none cursor-pointer text-gray-500 hover:bg-gray-200" disabled={!editable}>−</button>
                </div>
                <span className="relative text-ink-muted/60 font-black text-xs bg-gray-100/80 px-1.5 py-0.5 rounded-md">
                  {justSaved ? (
                    <span className="text-green-500 text-[10px]">✓</span>
                  ) : (
                    ":"
                  )}
                </span>
                <div className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={() => { const v = Math.min(20, (parseInt(predAway) || 0) + 1); const p = {...prediction, awayScore: v}; if (isKnockout) delete p.advancingTeam; onPredictionChange?.(p); }}
                    className="w-6 h-6 text-xs bg-gray-100 rounded-full border-none cursor-pointer text-gray-500 hover:bg-gray-200" disabled={!editable}>+</button>
                  <input
                    ref={awayInputRef}
                    type="number"
                    min="0"
                    max="20"
                    inputMode="numeric"
                    enterKeyHint="done"
                    aria-label={`ניחוש גולים ${awayTeam?.name || match.awayTeam || 'חוץ'} (0-20)`}
                    value={predAway}
                    onChange={handleAwayChange}
                    className={`min-w-[44px] min-h-[44px] md:min-w-[52px] md:min-h-[52px] text-center border-2 rounded-2xl text-xl font-bold tabular-nums transition-colors bg-gradient-to-b from-white to-gray-50 shadow-inner focus:ring-2 focus:ring-accent/40 focus:border-accent ${
                      hasPrediction ? "border-primary/30" : "border-border"
                    }`}
                    placeholder="–"
                  />
                  <button type="button" onClick={() => { const v = Math.max(0, (parseInt(predAway) || 0) - 1); const p = {...prediction, awayScore: v}; if (isKnockout) delete p.advancingTeam; onPredictionChange?.(p); }}
                    className="w-6 h-6 text-xs bg-gray-100 rounded-full border-none cursor-pointer text-gray-500 hover:bg-gray-200" disabled={!editable}>−</button>
                </div>
              </div>
              {homeTeam && awayTeam && (
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border-none cursor-pointer transition-all ${
                    showAnalysis
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-50 text-ink-muted hover:bg-blue-50 hover:text-blue-600"
                  }`}
                  title="עזרת מומחה לניחוש"
                >
                  ✨ עזרת מומחה
                </button>
              )}
            </div>
          ) : (
            !hasResult && (
              <div
                className={`text-sm tracking-wider tabular-nums ${hasPrediction ? "font-bold text-ink" : "text-ink-muted/60"}`}
              >
                {hasPrediction ? <span dir="ltr">{predAway} – {predHome}</span> : "– : –"}
              </div>
            )
          )}

          {hasResult && !editable && predHome !== "" && (
            <div className="text-[11px] text-ink-muted font-medium tabular-nums">
              ניחוש: <span dir="ltr">{predAway} – {predHome}</span>
            </div>
          )}
        </div>

        <div className="flex-1 text-center">
          <div
            className={`${nameStyles[importance]} ${awayTeam ? "text-ink" : "text-ink-muted/60 italic"}`}
          >
            <bdi>{awayName}</bdi>
          </div>
        </div>
      </div>

      {isKnockout &&
        predHome !== "" &&
        predAway !== "" &&
        parseInt(predHome) === parseInt(predAway) &&
        (editable ? (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[11px] text-ink-muted text-center mb-2 font-medium">
              {match.stage === "F" ? "מי האלופה? (בעיטות הכרעה)" : "מי עולה? (בעיטות הכרעה)"}
            </div>
            <div className="flex gap-2 justify-center">
              {[
                { team: match.homeTeam, name: homeName },
                { team: match.awayTeam, name: awayName },
              ].map(({ team, name }) => (
                <button
                  key={team}
                  onClick={() =>
                    onPredictionChange?.({ ...prediction, advancingTeam: team })
                  }
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                    prediction?.advancingTeam === team
                      ? "bg-primary text-white shadow-md"
                      : "bg-gray-100 text-ink-muted hover:bg-gray-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : prediction?.advancingTeam ? (
          <div className="mt-1.5 text-[11px] text-ink-muted text-center font-medium">
            {match.stage === "F" ? "אלופה:" : "עולה:"}{" "}
            {prediction.advancingTeam === match.homeTeam ? homeName : awayName}
          </div>
        ) : null)}

      {showAnalysis && editable && homeTeam && awayTeam && (
        <MatchAnalysis
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          homeTeamName={homeName}
          awayTeamName={awayName}
          stage={match.stage}
          group={match.group}
          onAccept={(h, a) => {
            const p = { homeScore: h, awayScore: a };
            onPredictionChange?.(p);
            setShowAnalysis(false);
          }}
          onClose={() => setShowAnalysis(false)}
        />
      )}
    </div>
  );
}

export default React.memo(MatchCard, (prev, next) => {
  return (
    prev.match?.id === next.match?.id &&
    prev.match?.homeTeam === next.match?.homeTeam &&
    prev.match?.awayTeam === next.match?.awayTeam &&
    prev.prediction?.homeScore === next.prediction?.homeScore &&
    prev.prediction?.awayScore === next.prediction?.awayScore &&
    prev.prediction?.advancingTeam === next.prediction?.advancingTeam &&
    prev.editable === next.editable &&
    prev.isKnockout === next.isKnockout &&
    prev.importance === next.importance &&
    prev.showPoints === next.showPoints &&
    prev.actualResult?.homeScore === next.actualResult?.homeScore &&
    prev.actualResult?.awayScore === next.actualResult?.awayScore &&
    prev.points?.points === next.points?.points &&
    prev.onPredictionChange === next.onPredictionChange
  );
});
