import { getTeamByCode } from "../data/teams";

export default function MatchCard({
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
  const homeTeam = getTeamByCode(match.homeTeam);
  const awayTeam = getTeamByCode(match.awayTeam);
  const homeName = homeTeam?.name || "טרם נקבע";
  const awayName = awayTeam?.name || "טרם נקבע";
  const predHome = prediction?.homeScore ?? "";
  const predAway = prediction?.awayScore ?? "";
  const hasResult = actualResult && actualResult.homeScore !== null;
  const hasPrediction = predHome !== "" && predAway !== "";
  const showLabel = match.label && match.stage !== "group";

  const importanceStyles = {
    group: "p-3.5",
    knockout: "p-4",
    showcase: "p-5 ring-2 ring-accent/50 shadow-md",
  };

  const nameStyles = {
    group: "text-sm font-semibold",
    knockout: "text-[15px] font-bold",
    showcase: "text-base font-bold",
  };

  return (
    <div
      className={`bg-white rounded-2xl border mb-0.5 transition-all card-hover ${importanceStyles[importance]} ${
        hasResult
          ? "border-primary/25"
          : hasPrediction && !editable
            ? "border-green-200/80"
            : "border-gray-100"
      }`}
    >
      {importance === "showcase" && (
        <div className="h-1 w-full rounded-full bg-gradient-to-l from-secondary via-accent to-primary mb-3 -mt-1" />
      )}

      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          <span
            className={`text-[11px] font-medium ${importance === "knockout" || importance === "showcase" ? "text-secondary/90" : "text-gray-400"}`}
          >
            {match.label}
          </span>
          {match.date && (
            <span className="text-[11px] text-gray-300">{match.date}</span>
          )}
        </div>
      )}

      {showPoints && points !== null && (
        <div className="flex justify-end mb-1.5">
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
              points.points > 0
                ? "bg-green-50 text-green-700"
                : "bg-gray-50 text-gray-400"
            }`}
          >
            {points.points > 0 ? `+${points.points}` : "0"} נק׳ —{" "}
            {points.breakdown}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-center">
          <div
            className={`${nameStyles[importance]} ${homeTeam ? "text-gray-800" : "text-gray-300 italic"}`}
          >
            {homeName}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 min-w-[130px]">
          {hasResult && (
            <div className="text-xl font-extrabold text-primary tracking-wider">
              {actualResult.homeScore} – {actualResult.awayScore}
            </div>
          )}

          {editable ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="20"
                  inputMode="numeric"
                  value={predHome}
                  onChange={(e) => {
                    const v =
                      e.target.value === "" ? null : parseInt(e.target.value);
                    const p = { ...prediction, homeScore: v };
                    if (isKnockout) delete p.advancingTeam;
                    onPredictionChange?.(p);
                  }}
                  className={`min-w-[52px] min-h-[52px] text-center border-2 rounded-2xl text-lg font-bold transition-all bg-gradient-to-b from-white to-gray-50 shadow-inner focus:ring-2 focus:ring-accent/40 focus:border-accent ${
                    hasPrediction ? "border-primary/30" : "border-gray-200"
                  }`}
                  placeholder="–"
                />
                <span className="text-gray-300 font-black text-xs bg-gray-100/80 px-1.5 py-0.5 rounded-md">
                  :
                </span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  inputMode="numeric"
                  value={predAway}
                  onChange={(e) => {
                    const v =
                      e.target.value === "" ? null : parseInt(e.target.value);
                    const p = { ...prediction, awayScore: v };
                    if (isKnockout) delete p.advancingTeam;
                    onPredictionChange?.(p);
                  }}
                  className={`min-w-[52px] min-h-[52px] text-center border-2 rounded-2xl text-lg font-bold transition-all bg-gradient-to-b from-white to-gray-50 shadow-inner focus:ring-2 focus:ring-accent/40 focus:border-accent ${
                    hasPrediction ? "border-primary/30" : "border-gray-200"
                  }`}
                  placeholder="–"
                />
              </div>
            </div>
          ) : (
            !hasResult && (
              <div
                className={`text-sm tracking-wider ${hasPrediction ? "font-bold text-gray-600" : "text-gray-300"}`}
              >
                {hasPrediction ? `${predHome} – ${predAway}` : "– : –"}
              </div>
            )
          )}

          {hasResult && !editable && predHome !== "" && (
            <div className="text-[11px] text-gray-400 font-medium">
              ניחוש: {predHome} – {predAway}
            </div>
          )}
        </div>

        <div className="flex-1 text-center">
          <div
            className={`${nameStyles[importance]} ${awayTeam ? "text-gray-800" : "text-gray-300 italic"}`}
          >
            {awayName}
          </div>
        </div>
      </div>

      {isKnockout &&
        predHome !== "" &&
        predAway !== "" &&
        parseInt(predHome) === parseInt(predAway) &&
        (editable ? (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-[11px] text-gray-400 text-center mb-2 font-medium">
              מי עולה? (בעיטות הכרעה)
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
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : prediction?.advancingTeam ? (
          <div className="mt-1.5 text-[11px] text-gray-400 text-center font-medium">
            עולה:{" "}
            {prediction.advancingTeam === match.homeTeam ? homeName : awayName}
          </div>
        ) : null)}
    </div>
  );
}
