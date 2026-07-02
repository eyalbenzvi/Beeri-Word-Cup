// Hero of "המצב שלי בתחרות": the verdict sentence vs the user's most
// relevant money target, a simple distance "ladder", deterministic badges,
// and the plain-language scenario range. Numbers policy: place facts only
// (rank / distance / target place) — probabilities always go through the
// verbal ladder in analysisVerdict, never shown as percentages.

import { useMemo } from "react";
import { getTeamByCode } from "../../data/teams";
import { getCachedBracket, getCachedChampion } from "../../utils/bracketCache";
import { deriveAdvancingTeams } from "../../utils/bracket";
import {
  chanceLabel,
  formatChance,
  rankRange,
  refundBandLabel,
  PRIZE_TOP_PLACES,
  type PrimaryTarget,
} from "../../utils/analysisVerdict";
import { isClinchedTopN, type PoolCertainty } from "../../utils/poolCertainty";
import type { PersonalAnalysisAggregate } from "../../utils/personalAnalysis";

const MAX_LADDER_DOTS = 10;

function LadderStrip({
  rank,
  targetRank,
  targetLabel,
}: {
  rank: number;
  targetRank: number;
  targetLabel: string;
}) {
  const distance = Math.abs(targetRank - rank);
  if (distance === 0) {
    return (
      <div className="text-center my-3">
        <span className="inline-block bg-primary-soft border-2 border-primary rounded-full px-4 py-1.5 text-sm font-extrabold text-primary-dark">
          אתה בדיוק על היעד 🎯
        </span>
      </div>
    );
  }
  if (distance > MAX_LADDER_DOTS) return null;
  return (
    <div
      className="flex items-center gap-1 my-3"
      aria-label={`אתה במקום ${rank}, במרחק ${distance} מקומות מ${targetLabel}`}
    >
      <span className="bg-primary-soft border-2 border-primary rounded-full px-2.5 py-1 text-xs font-extrabold text-primary-dark shrink-0">
        אתה · מקום <bdi>{rank}</bdi>
      </span>
      <span className="flex-1 flex items-center" aria-hidden="true">
        {Array.from({ length: distance - 1 }).map((_, i) => (
          <span key={i} className="flex-1 flex items-center">
            <span className="w-full h-0.5 bg-border" />
            <span className="w-1.5 h-1.5 rounded-full bg-border-strong shrink-0" />
          </span>
        ))}
        <span className="flex-1 h-0.5 bg-border" />
      </span>
      <span
        className="rounded-full px-2.5 py-1 text-xs font-extrabold shrink-0 border-2"
        style={{ borderColor: "var(--color-gold)", color: "var(--color-ink)", background: "var(--color-bg)" }}
      >
        🎯 {targetLabel}
      </span>
    </div>
  );
}

// "Still alive on the pitch" line for users with no realistic money target:
// how much of the form's own story is still playing.
function LivePicksLine({ formData, aliveSet }: { formData: any; aliveSet: Set<string> | null }) {
  const info = useMemo(() => {
    if (!formData?.matches || !aliveSet) return null;
    const bracket = getCachedBracket(formData.matches);
    const advancing = deriveAdvancingTeams(bracket);
    const champion = getCachedChampion(formData.matches);
    const picked = new Set<string>([...(advancing.SF || []), ...(advancing.F || [])]);
    let aliveCount = 0;
    for (const t of picked) if (aliveSet.has(t)) aliveCount++;
    return {
      championAlive: !!champion && aliveSet.has(champion),
      championName: champion ? getTeamByCode(champion)?.name || champion : null,
      aliveCount,
      pickedCount: picked.size,
    };
  }, [formData, aliveSet]);

  if (!info) return null;
  return (
    <div className="text-sm font-bold text-ink mt-2 space-y-1">
      {info.championAlive && info.championName && (
        <div>
          🏆 {info.championName} — האלופה שסימנת — עדיין במשחק. יש למי לעודד.
        </div>
      )}
      {info.pickedCount > 0 && (
        <div>
          ⚽ <bdi>{info.aliveCount}</bdi> מתוך <bdi>{info.pickedCount}</bdi> הקבוצות
          שסימנת לשלבים הגבוהים עדיין בטורניר.
        </div>
      )}
    </div>
  );
}

const TARGET_LABEL: Record<string, string> = {
  win: "זכייה",
  podium: "פודיום",
  p100: "מקום 100",
  p200: "מקום 200",
  last: "המקום האחרון",
};

function verdictSentence(target: PrimaryTarget, rank: number): string {
  const label = chanceLabel(target.prob);
  const chance = formatChance(label);
  switch (target.key) {
    case "win":
      if (label.kind === "miracle") {
        return `הזכייה רחוקה — רק בנס. אבל נסים כבר קרו במונדיאל ⚽`;
      }
      if (label.kind === "slim") {
        return `הזכייה עוד אפשרית — סיכוי קלוש, אבל חי ✨`;
      }
      if (label.kind === "almost") {
        return `הזכייה כמעט בכיס — כמעט בכל תרחיש אתה מסיים ראשון 🏆`;
      }
      if (label.kind === "good") {
        return `אתה הפייבוריט לזכייה — ברוב התרחישים זה נגמר אצלך 🏆`;
      }
      if (label.kind === "coin") {
        return `הזכייה על הכף — בערך חצי מהתרחישים נגמרים אצלך 🏆`;
      }
      if (rank <= PRIZE_TOP_PLACES) {
        return `אתה על הפודיום עכשיו — ${chance} זה נגמר בזכייה שלך 🏆`;
      }
      return `יש לך סיכוי אמיתי לזכייה — ${chance} מסתיים אצלך 🏆`;
    case "podium":
      if (rank <= PRIZE_TOP_PLACES) {
        return `אתה על הפודיום — מקום ששווה פרס 🏆 הסיכוי שתשמור עליו עד הסוף: ${chance}. עכשיו רק לא לעזוב`;
      }
      return `הפודיום — ומדליה ששווה פרס — בטווח שלך 🏆 הסיכוי שתסיים בטופ־${PRIZE_TOP_PLACES}: ${chance}`;
    case "p100":
    case "p200": {
      const tr = target.targetRank!;
      return `היעד שלך: מקום ${tr} — שמחזיר את ההשקעה 💰 הסיכוי שתנחת בסביבתו (${refundBandLabel(tr)}): ${chance}`;
    }
    case "last":
      return `המקום האחרון מחזיר את ההשקעה 😄 הסיכוי שתסיים שם: ${chance}. אל תיתן לאף אחד לקחת לך אותו`;
    default:
      return "בוא נהיה כנים: הפרסים כנראה לא בתמונה הפעם. אבל הטופס שלך עדיין חי על המגרש:";
  }
}

export default function VerdictSection({
  formId,
  formData,
  cert,
  agg,
  targetFormIndex,
  target,
  aliveSet,
  refining,
  failed,
  retry,
}: {
  formId: string;
  formData: any;
  cert: PoolCertainty;
  agg: PersonalAnalysisAggregate | null;
  targetFormIndex: number;
  // Computed ONCE by the page (single evaluation shared with the root-for
  // section, so headline and advice always describe the same target).
  target: PrimaryTarget | null;
  aliveSet: Set<string> | null;
  refining: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const my = cert.byFormId[formId];

  const analysis = useMemo(() => {
    if (!my || !target) return null;
    if (!agg || targetFormIndex < 0 || agg.simCount === 0) return null;
    const range = rankRange(agg.targetForms[targetFormIndex].hist, agg.simCount);
    return { target, range };
  }, [agg, targetFormIndex, my, target]);

  // Deterministic claims are O(nForms) scans — inputs only change when a
  // result lands, not on every Monte-Carlo refinement tick.
  const clinched = useMemo(() => {
    const first = isClinchedTopN(cert, formId, 1);
    const podium = !first && isClinchedTopN(cert, formId, PRIZE_TOP_PLACES);
    const top10 = !first && !podium && isClinchedTopN(cert, formId, 10);
    return { first, podium, top10 };
  }, [cert, formId]);

  if (!my) return null;

  const clinchedFirst = clinched.first;
  const clinchedPodium = clinched.podium;
  const clinchedTop10 = clinched.top10;

  const today = new Date().toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });

  return (
    <div className="card-duo-lg mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-extrabold text-ink truncate">
          ⚽ {my.formName} · מקום <bdi>{my.rank}</bdi> מתוך <bdi>{cert.nForms}</bdi>
        </span>
        <span className="text-3xs text-ink-light font-bold shrink-0">
          נכון ל<bdi>{today}</bdi>
        </span>
      </div>

      {/* Verdict line */}
      {clinchedFirst ? (
        <p className="text-lg font-extrabold text-ink font-heading text-balance">
          זה סגור: המקום הראשון שלך, לא משנה מה יקרה על הדשא 🏆🔒
        </p>
      ) : analysis ? (
        <>
          <p className="text-lg font-extrabold text-ink font-heading text-balance">
            {verdictSentence(analysis.target, my.rank)}
          </p>
          {analysis.target.key === "none" && (
            <LivePicksLine formData={formData} aliveSet={aliveSet} />
          )}
          {/* Distance ladder only for the fixed refund places — "last" is a
              moving rank under bottom-ties, so the sentence carries it alone. */}
          {analysis.target.targetRank != null &&
            (analysis.target.key === "p100" || analysis.target.key === "p200") && (
              <LadderStrip
                rank={my.rank}
                targetRank={analysis.target.targetRank}
                targetLabel={TARGET_LABEL[analysis.target.key] || ""}
              />
            )}
          {analysis.range && analysis.target.key !== "none" && (
            <p className="text-sm text-ink-muted font-bold mt-1.5">
              ברוב התרחישים תסיים בין מקום <bdi>{analysis.range.lo}</bdi> למקום{" "}
              <bdi>{analysis.range.hi}</bdi>.
            </p>
          )}
        </>
      ) : failed ? (
        <div>
          <p className="text-sm font-bold text-ink">
            הניתוח ההסתברותי לא זמין כרגע — אבל העובדות המתמטיות שלמטה בתוקף.
          </p>
          <button onClick={retry} className="btn-duo btn-duo-ghost btn-duo-sm mt-2">
            נסו שוב
          </button>
        </div>
      ) : (
        <p className="text-sm font-bold text-ink-muted animate-pulse">
          מריצים את שארית המונדיאל אלפי פעמים… ⚽
        </p>
      )}

      {/* Deterministic badges — math only, never probabilistic */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {clinchedFirst && <span className="badge-duo badge-duo-primary">אלוף — מובטח 🔒</span>}
        {clinchedPodium && <span className="badge-duo badge-duo-primary">פודיום מובטח 🔒</span>}
        {clinchedTop10 && <span className="badge-duo badge-duo-secondary">טופ־10 מובטח 🔒</span>}
        {/* The "still alive for the win" fact is shown ONLY when the win is
            the verdict's own story — for a form whose realistic target is
            place 100, "עדיין בחיים במרוץ לזכייה" is technically true (the
            sound bound is loose by design) but reads as a promise the
            verdict itself contradicts. Mathematical elimination, by
            contrast, is always worth stating. */}
        {!clinchedFirst && my.aliveForFirst && analysis?.target.key === "win" && (
          <span className="badge-duo badge-duo-muted">הזכייה עוד בהישג יד ✅</span>
        )}
        {!clinchedFirst && !my.aliveForFirst && (
          <span className="badge-duo badge-duo-muted">הזכייה כבר לא אפשרית מתמטית</span>
        )}
        {refining && !failed && (
          <span className="badge-duo badge-duo-muted">מדייק את החישוב…</span>
        )}
      </div>

      <p className="text-3xs text-ink-light font-bold mt-3">
        בארי מונדיאל 2026 ⚽ · הערכה, לא הימור
      </p>
    </div>
  );
}
