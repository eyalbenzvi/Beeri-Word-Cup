// "את מי לעודד" — up to 3 upcoming (48h-window) matches, sorted by how much
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
  type RootForKey,
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
  phrase: string,
  owned: boolean,
  predictedAdvancers: Set<string> | null,
): string {
  if (advice.side === "draw") {
    return owned
      ? `תיקו זו התוצאה הכי טובה בשבילך פה 🤝`
      : `תיקו זו התוצאה הכי טובה עבור הטופס הזה 🤝`;
  }
  const team = advice.side === "home" ? wm.home : wm.away;
  const other = advice.side === "home" ? wm.away : wm.home;
  const teamName = getTeamDisplayName(team, team);
  const otherName = getTeamDisplayName(other, other);

  // Against-your-heart: the form predicted the OTHER side to advance from
  // this slot, but the target is better served by it losing.
  const againstHeart =
    !!predictedAdvancers && predictedAdvancers.has(other) && !predictedAdvancers.has(team);

  if (!owned) {
    if (againstHeart) {
      return `דווקא הפסד של ${otherName} עוזר לטופס הזה — ${otherName} מסומנת בו, אבל המסלול שלו ${phrase} עובר דרך ${teamName} 📣`;
    }
    if (advice.strong) {
      return `המשחק הזה משנה את התמונה עבור הטופס הזה: ניצחון של ${teamName} מקרב אותו משמעותית ${phrase} 📣`;
    }
    return `ניצחון של ${teamName} מקרב את הטופס הזה ${phrase} 📣`;
  }

  if (againstHeart) {
    return `דווקא הפסד של ${otherName} עוזר לך הפעם — הלב שלך עם ${otherName}, אבל המסלול שלך ${phrase} עובר דרך ${teamName} 📣`;
  }
  if (advice.strong) {
    return `המשחק הזה משנה לך את התמונה: ניצחון של ${teamName} מקרב אותך משמעותית ${phrase}. שווה לעודד את ${teamName} 📣`;
  }
  return `ניצחון של ${teamName} מקרב אותך ${phrase}. שווה לעודד את ${teamName} 📣`;
}

export default function RootForSection({
  watchMatches,
  agg,
  targetFormIndex,
  targetKey,
  predictedAdvancers,
  owned,
  phraseOverride,
  title,
  subtitle,
  emptyText,
}: {
  watchMatches: WatchMatch[];
  agg: PersonalAnalysisAggregate | null;
  targetFormIndex: number;
  targetKey: RootForKey | "none";
  // Teams the selected form predicted to advance to the NEXT round of each
  // watch match's stage (for against-heart detection); null = unknown.
  predictedAdvancers: Set<string> | null;
  // false → third-person copy (viewing someone else's form).
  owned: boolean;
  // Required when targetKey === "beat" (e.g. `לעקיפת ״שם הטופס״`) — the
  // money-target phrases come from TARGET_PHRASE.
  phraseOverride?: string;
  title?: string;
  subtitle?: string;
  emptyText?: string;
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

  const phrase =
    phraseOverride ?? (targetKey !== "beat" ? TARGET_PHRASE[targetKey] : "");

  return (
    <div className="mb-4">
      <h3 className="text-base font-extrabold text-ink mb-0.5">{title || "📣 את מי לעודד"}</h3>
      <p className="text-xs text-ink-muted font-medium mb-2">
        {subtitle ||
          (owned
            ? "המשחקים הקרובים, מנקודת המבט של הטופס שלך"
            : "המשחקים הקרובים, מנקודת המבט של הטופס הזה")}
      </p>

      {advice.length === 0 ? (
        <div className="card-duo-tight">
          <p className="text-sm font-bold text-ink">
            {emptyText ||
              (owned
                ? "המשחקים הקרובים כמעט לא משנים לך — אפשר פשוט ליהנות מהכדורגל 😌"
                : "המשחקים הקרובים כמעט לא משנים לטופס הזה — כדורגל נטו 😌")}
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
                  {adviceSentence(a, wm, phrase, owned, predictedAdvancers)}
                </p>
                <div className="flex gap-1.5 mt-1.5">
                  {i === 0 && <span className="badge-duo badge-duo-accent">הכי חשוב</span>}
                  {a.lowSample && (
                    <span className="badge-duo badge-duo-muted">משוער — החישוב עוד מתחדד</span>
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
