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
  bracketEntry,
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

  // Use bracket-derived teams for knockout matches, falling back to match data
  const homeCode = (bracketEntry?.home) || match.homeTeam;
  const awayCode = (bracketEntry?.away) || match.awayTeam;
  const homeTeam = getTeamByCode(homeCode);
  const awayTeam = getTeamByCode(awayCode);
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
    showcase: "p-4 ring-2 ring-accent/60",
  };

  const nameStyles = {
    group: "text-sm font-medium",
    knockout: "text-base font-medium",
    showcase: "text-base font-medium",
  };

  const clampScore = (raw) => {
    if (raw === "") return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(20, n));
  };

  const buildPredictionUpdate = useCallback(
    (side, value) => {
      const key = side === "home" ? "homeScore" : "awayScore";
      const otherKey = side === "home" ? "awayScore" : "homeScore";
      const p = { ...prediction, [key]: value };
      // Auto-initialize the other side to 0 the first time the user sets a score
      if (value !== null && value !== undefined && (prediction?.[otherKey] === null || prediction?.[otherKey] === undefined)) {
        p[otherKey] = 0;
      }
      if (isKnockout) delete p.advancingTeam;
      return p;
    },
    [prediction, isKnockout],
  );

  const handleHomeChange = useCallback(
    (e) => {
      const raw = e.target.value;
      const v = clampScore(raw);
      onPredictionChange?.(buildPredictionUpdate("home", v));
      if (raw.length === 1 && v !== null && v >= 0 && v <= 9) {
        setTimeout(() => {
          awayInputRef.current?.focus();
          awayInputRef.current?.select();
        }, 0);
      }
    },
    [buildPredictionUpdate, onPredictionChange],
  );

  const handleAwayChange = useCallback(
    (e) => {
      const raw = e.target.value;
      const v = clampScore(raw);
      onPredictionChange?.(buildPredictionUpdate("away", v));
      if (raw.length === 1 && v !== null && v >= 0 && v <= 9) {
        setTimeout(() => {
          if (awayInputRef.current) focusNextInput(awayInputRef.current);
        }, 0);
      }
    },
    [buildPredictionUpdate, onPredictionChange],
  );

  return (
    <div
      data-match-card
      className={`bg-white rounded-2xl border-2 mb-2 transition-all card-duo-hover ${importanceStyles[importance]} ${
        justSaved
          ? "animate-save-flash border-primary"
          : hasResult
            ? "border-primary/60"
            : hasPrediction && !editable
              ? "border-primary/40"
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
              className={`text-xs font-medium ${importance === "knockout" || importance === "showcase" ? "text-secondary/90" : "text-ink-muted"}`}
            >
              {match.label}
            </span>
          ) : <span />}
          <span className="text-xs text-ink-muted">
            {[match.date, match.time, match.venue].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      {showPoints && points !== null && (
        <div className="flex justify-end mb-1.5">
          <span
            className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${
              points.points > 0
                ? "text-white bg-primary"
                : "bg-bg-soft text-ink-muted"
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
            className={`${nameStyles[importance]} ${homeTeam ? "text-ink" : "text-ink-muted italic"}`}
          >
            <bdi>{homeName}</bdi>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 min-w-[130px]">
          {hasResult && (
            <div className="text-2xl font-extrabold text-primary tracking-wider tabular-nums">
              {/* RTL: away first so the home digit lands next to the home team name (right). */}
              <bdi>{actualResult.awayScore}–{actualResult.homeScore}</bdi>
            </div>
          )}

          {editable ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={() => { const v = Math.min(20, (parseInt(predHome) || 0) + 1); onPredictionChange?.(buildPredictionUpdate("home", v)); }}
                    aria-label={`הוסף גול ל${homeTeam?.name || match.homeTeam || 'קבוצה ביתית'}`}
                    className="tap-44 w-9 h-9 text-sm bg-bg-soft rounded-full border-none cursor-pointer text-ink-muted hover:bg-border font-bold leading-none flex items-center justify-center" disabled={!editable}>+</button>
                  <input
                    ref={homeInputRef}
                    type="number"
                    min="0"
                    max="20"
                    inputMode="numeric"
                    aria-label={`ניחוש גולים ${homeTeam?.name || match.homeTeam || 'ביתית'} (0-20)`}
                    value={predHome}
                    onChange={handleHomeChange}
                    className={`min-w-[48px] min-h-[48px] md:min-w-[56px] md:min-h-[56px] text-center border-2 rounded-2xl text-xl font-extrabold tabular-nums transition-colors bg-white focus:border-primary focus:bg-primary-soft ${
                      hasPrediction ? "border-primary/50" : "border-border"
                    }`}
                    placeholder="–"
                  />
                  <button type="button" onClick={() => { const v = Math.max(0, (parseInt(predHome) || 0) - 1); onPredictionChange?.(buildPredictionUpdate("home", v)); }}
                    aria-label={`הורד גול מ${homeTeam?.name || match.homeTeam || 'קבוצה ביתית'}`}
                    className="tap-44 w-9 h-9 text-sm bg-bg-soft rounded-full border-none cursor-pointer text-ink-muted hover:bg-border font-bold leading-none flex items-center justify-center" disabled={!editable}>−</button>
                </div>
                <span className="relative text-ink-muted font-black text-xs bg-bg-soft px-1.5 py-0.5 rounded-xl">
                  {justSaved ? (
                    <span className="text-primary text-xs animate-pop-in">✓</span>
                  ) : (
                    ":"
                  )}
                </span>
                <div className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={() => { const v = Math.min(20, (parseInt(predAway) || 0) + 1); onPredictionChange?.(buildPredictionUpdate("away", v)); }}
                    aria-label={`הוסף גול ל${awayTeam?.name || match.awayTeam || 'קבוצה אורחת'}`}
                    className="tap-44 w-9 h-9 text-sm bg-bg-soft rounded-full border-none cursor-pointer text-ink-muted hover:bg-border font-bold leading-none flex items-center justify-center" disabled={!editable}>+</button>
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
                    className={`min-w-[48px] min-h-[48px] md:min-w-[56px] md:min-h-[56px] text-center border-2 rounded-2xl text-xl font-extrabold tabular-nums transition-colors bg-white focus:border-primary focus:bg-primary-soft ${
                      hasPrediction ? "border-primary/50" : "border-border"
                    }`}
                    placeholder="–"
                  />
                  <button type="button" onClick={() => { const v = Math.max(0, (parseInt(predAway) || 0) - 1); onPredictionChange?.(buildPredictionUpdate("away", v)); }}
                    aria-label={`הורד גול מ${awayTeam?.name || match.awayTeam || 'קבוצה אורחת'}`}
                    className="tap-44 w-9 h-9 text-sm bg-bg-soft rounded-full border-none cursor-pointer text-ink-muted hover:bg-border font-bold leading-none flex items-center justify-center" disabled={!editable}>−</button>
                </div>
              </div>
              {homeTeam && awayTeam && (
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className={`text-xs font-extrabold px-3 py-1 rounded-full border-none cursor-pointer transition-all ${
                    showAnalysis
                      ? "bg-secondary text-white"
                      : "bg-bg-soft text-ink-muted hover:bg-secondary/10 hover:text-secondary"
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
                className={`text-sm tracking-wider tabular-nums ${hasPrediction ? "font-bold text-ink" : "text-ink-muted"}`}
              >
                {hasPrediction ? <bdi>{predAway}–{predHome}</bdi> : "– : –"}
              </div>
            )
          )}

          {hasResult && !editable && predHome !== "" && (
            <div className="text-xs text-ink-muted font-medium tabular-nums">
              ניחוש: <bdi>{predAway}–{predHome}</bdi>
            </div>
          )}
        </div>

        <div className="flex-1 text-center">
          <div
            className={`${nameStyles[importance]} ${awayTeam ? "text-ink" : "text-ink-muted italic"}`}
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
            <div className="text-xs text-ink-muted text-center mb-2 font-medium">
              {match.stage === "F" ? "מי האלופה?" : "מי עולה?"}
            </div>
            <div className="flex gap-2 justify-center">
              {[
                { team: homeCode, name: homeName },
                { team: awayCode, name: awayName },
              ].map(({ team, name }) => (
                <button
                  key={team}
                  onClick={() =>
                    onPredictionChange?.({ ...prediction, advancingTeam: team })
                  }
                  className={`chip-duo ${prediction?.advancingTeam === team ? "active" : ""}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : prediction?.advancingTeam ? (
          <div className="mt-1.5 text-xs text-ink-muted text-center font-medium">
            {match.stage === "F" ? "אלופה:" : "עולה:"}{" "}
            {prediction.advancingTeam === homeCode ? homeName : awayName}
          </div>
        ) : null)}

      {showAnalysis && editable && homeTeam && awayTeam && (
        <MatchAnalysis
          key={`${homeCode}-${awayCode}`}
          homeTeam={homeCode}
          awayTeam={awayCode}
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

// Custom memo comparator — update when adding new props that affect rendering
export default React.memo(MatchCard, (prev, next) => {
  // Match identity & bracket-derived teams
  if (prev.match?.id !== next.match?.id) return false;
  if (prev.bracketEntry?.home !== next.bracketEntry?.home ||
      prev.bracketEntry?.away !== next.bracketEntry?.away) return false;

  // Prediction state
  if (prev.prediction?.homeScore !== next.prediction?.homeScore ||
      prev.prediction?.awayScore !== next.prediction?.awayScore ||
      prev.prediction?.advancingTeam !== next.prediction?.advancingTeam) return false;

  // Actual result
  if (prev.actualResult?.homeScore !== next.actualResult?.homeScore ||
      prev.actualResult?.awayScore !== next.actualResult?.awayScore) return false;

  // Scalar props
  if (prev.editable !== next.editable ||
      prev.isKnockout !== next.isKnockout ||
      prev.importance !== next.importance ||
      prev.showPoints !== next.showPoints) return false;

  // Points & callback
  if (prev.points?.points !== next.points?.points ||
      prev.points?.breakdown !== next.points?.breakdown) return false;
  if (prev.onPredictionChange !== next.onPredictionChange) return false;

  return true;
});
