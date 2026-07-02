// "למי לעודד" — up to 3 upcoming (48h-window) matches, sorted by how much
// their outcome moves the user's primary money target. Direction words only,
// no numbers. Counterintuitive advice ("root against your own pick") always
// carries a why-clause — never emitted bare.

import { useMemo } from "react";
import { getMatchById } from "../../data/matches";
import { formatIsraelDateLabel } from "../../utils/matchTime";
import { getTeamDisplayName, getTeamFlagName } from "../../utils/teamDisplay";
import {
  classifyRootFor,
  type RootForAdvice,
} from "../../utils/analysisVerdict";
import type {
  PersonalAnalysisAggregate,
  TargetKey,
} from "../../utils/personalAnalysis";
import type { WatchMatch } from "../../utils/analysisWindow";

const TARGET_PHRASE: Record<TargetKey, string> = {
  win: "לזכייה",
  podium: "לפודיום",
  p100: "למקום 100",
  p200: "למקום 200",
  last: "למקום האחרון",
};

function adviceSentence(
  advice: RootForAdvice,
  wm: WatchMatch,
  targetKey: TargetKey,
  predictedAdvancers: Set<string> | null,
): string {
  const phrase = TARGET_PHRASE[targetKey];
  if (advice.side === "draw") {
    return `תיקו זו התוצאה הכי טובה בשבילך פה 🤝`;
  }
  const team = advice.side === "home" ? wm.home : wm.away;
  const other = advice.side === "home" ? wm.away : wm.home;
  const teamName = getTeamDisplayName(team, team);
  const otherName = getTeamDisplayName(other, other);

  // Against-your-heart: the form predicted the OTHER side to advance from
  // this slot, but the target is better served by it losing.
  const againstHeart =
    !!predictedAdvancers && predictedAdvancers.has(other) && !predictedAdvancers.has(team);

  if (againstHeart) {
    return `דווקא הפסד של ${otherName} עוזר לך הפעם — הלב שלך עם ${otherName}, אבל הדרך שלך ${phrase} עוברת דרך ${teamName} 📣`;
  }
  if (advice.strong) {
    return `המשחק הזה משנה לך את התמונה: ניצחון של ${teamName} מקדם אותך משמעותית ${phrase}. תעודד את ${teamName} 📣`;
  }
  return `ניצחון של ${teamName} מקרב אותך ${phrase}. תעודד את ${teamName} 📣`;
}

export default function RootForSection({
  watchMatches,
  agg,
  targetFormIndex,
  targetKey,
  predictedAdvancers,
}: {
  watchMatches: WatchMatch[];
  agg: PersonalAnalysisAggregate | null;
  targetFormIndex: number;
  targetKey: TargetKey | "none";
  // Teams the selected form predicted to advance to the NEXT round of each
  // watch match's stage (for against-heart detection); null = unknown.
  predictedAdvancers: Set<string> | null;
}) {
  const byId = useMemo(() => {
    const m: Record<string, WatchMatch> = {};
    for (const wm of watchMatches) m[wm.id] = wm;
    return m;
  }, [watchMatches]);

  const advice = useMemo(() => {
    if (!agg || targetFormIndex < 0 || targetKey === "none") return [];
    return classifyRootFor(agg.watch, targetFormIndex, targetKey, agg.simCount);
  }, [agg, targetFormIndex, targetKey]);

  if (watchMatches.length === 0 || !agg || agg.simCount === 0 || targetKey === "none") {
    return null;
  }

  return (
    <div className="mb-4">
      <h3 className="text-base font-extrabold text-ink mb-0.5">📣 למי לעודד</h3>
      <p className="text-xs text-ink-muted font-medium mb-2">
        המשחקים הקרובים, מנקודת המבט של הטופס שלך
      </p>

      {advice.length === 0 ? (
        <div className="card-duo-tight">
          <p className="text-sm font-bold text-ink">
            המשחקים הקרובים כמעט לא משנים לך — תיהנה מהכדורגל 😌
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {advice.map((a, i) => {
            const wm = byId[a.matchId];
            if (!wm) return null;
            const match = getMatchById(a.matchId);
            const dateLabel = match ? formatIsraelDateLabel(match) : "";
            const isFor = a.side !== "draw";
            return (
              <div
                key={a.matchId}
                className="card-duo-tight"
                style={{
                  borderInlineStartWidth: 4,
                  borderInlineStartColor: isFor
                    ? "var(--color-primary)"
                    : "var(--color-accent)",
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-extrabold text-ink">
                    {getTeamFlagName(wm.home)} <span className="text-ink-muted">נגד</span>{" "}
                    {getTeamFlagName(wm.away)}
                  </span>
                  <span className="text-2xs text-ink-muted font-bold shrink-0">
                    <bdi>{dateLabel}</bdi>
                    {match?.time ? (
                      <>
                        {" · "}
                        <bdi>{match.time}</bdi>
                      </>
                    ) : null}
                  </span>
                </div>
                <p className="text-sm font-bold text-ink">
                  {adviceSentence(a, wm, targetKey, predictedAdvancers)}
                </p>
                <div className="flex gap-1.5 mt-1.5">
                  {i === 0 && <span className="badge-duo badge-duo-accent">הכי חשוב</span>}
                  {a.lowSample && (
                    <span className="badge-duo badge-duo-muted">משוער — החישוב עוד מתדייק</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
