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
  subject,
}: {
  rank: number;
  targetRank: number;
  targetLabel: string;
  subject: string; // "הטופס שלך" / "הטופס הזה"
}) {
  const distance = Math.abs(targetRank - rank);
  if (distance === 0) {
    return (
      <div className="text-center my-3">
        <span className="inline-block bg-primary-soft border-2 border-primary rounded-full px-4 py-1.5 text-sm font-extrabold text-primary-dark">
          {subject} בדיוק על היעד 🎯
        </span>
      </div>
    );
  }
  if (distance > MAX_LADDER_DOTS) return null;
  return (
    <div
      className="flex items-center gap-1 my-3"
      aria-label={`${subject} במקום ${rank}, במרחק ${distance} מקומות מ${targetLabel}`}
    >
      <span className="bg-primary-soft border-2 border-primary rounded-full px-2.5 py-1 text-xs font-extrabold text-primary-dark shrink-0">
        {subject} · מקום <bdi>{rank}</bdi>
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
function LivePicksLine({
  formData,
  aliveSet,
  owned,
}: {
  formData: any;
  aliveSet: Set<string> | null;
  owned: boolean;
}) {
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
          🏆 {info.championName} — {owned ? "האלופה שסימנת" : "האלופה שסומנה בטופס"} — עדיין
          במשחק. יש את מי לעודד.
        </div>
      )}
      {info.pickedCount > 0 && (
        <div>
          ⚽ <bdi>{info.aliveCount}</bdi> מתוך <bdi>{info.pickedCount}</bdi> הקבוצות
          {owned ? " שסימנת" : " שסומנו בטופס"} לשלבים הגבוהים עדיין בטורניר.
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
        return `הזכייה רחוקה — רק בנס. אבל ניסים כבר קרו במונדיאל ⚽`;
      }
      if (label.kind === "slim") {
        return `הזכייה עוד אפשרית — סיכוי קלוש, אבל חי ✨`;
      }
      if (label.kind === "almost") {
        return `הזכייה ממש קרובה — כמעט בכל תרחיש הטופס שלך מסיים ראשון 🏆`;
      }
      if (label.kind === "good") {
        return `הטופס שלך הפייבוריט לזכייה — ברוב התרחישים המקום הראשון שלך 🏆`;
      }
      if (label.kind === "coin") {
        return `הזכייה פתוחה לגמרי — בערך חצי מהתרחישים נגמרים בזכייה שלך 🏆`;
      }
      if (rank <= PRIZE_TOP_PLACES) {
        return `הטופס שלך על הפודיום כבר עכשיו — והסיכוי שזה ייגמר בזכייה: ${chance} 🏆`;
      }
      return `יש לך סיכוי אמיתי לזכייה 🏆 כמה אמיתי? ${chance}`;
    case "podium":
      if (rank <= PRIZE_TOP_PLACES) {
        return `הטופס שלך על הפודיום — מקום ששווה פרס 🏆 הסיכוי לשמור עליו עד הסוף: ${chance}. עכשיו רק לא לעזוב`;
      }
      return `הפודיום — מקום ששווה פרס — עדיין במשחק 🏆 הסיכוי לסיים בטופ־${PRIZE_TOP_PLACES}: ${chance}`;
    case "p100":
    case "p200": {
      const tr = target.targetRank!;
      return `היעד שלך: מקום ${tr} — שמחזיר את ההשקעה 💰 הסיכוי לנחות באזור (${refundBandLabel(tr)}): ${chance}`;
    }
    case "last":
      return `המקום האחרון מחזיר את ההשקעה 😄 הסיכוי לסיים שם: ${chance}. שלא ייקחו לך אותו`;
    default:
      return "האמת? הפרסים כנראה לא בתמונה הפעם. אבל הטופס שלך עדיין חי על המגרש:";
  }
}

// Third-person verdict for a form that is NOT the viewer's ("ניתוח של טופס
// אחר"). Deliberately compact — the second-person sub-branches (pep talk per
// chance bucket) don't translate to someone else's form.
function verdictSentenceThirdPerson(target: PrimaryTarget): string {
  const chance = formatChance(chanceLabel(target.prob));
  switch (target.key) {
    case "win":
      return `הטופס הזה עדיין במרוץ לזכייה 🏆 הסיכוי שזה ייגמר בזכייה שלו: ${chance}`;
    case "podium":
      return `הפודיום — מקום ששווה פרס — בתמונה עבור הטופס הזה 🏆 הסיכוי לסיים בטופ־${PRIZE_TOP_PLACES}: ${chance}`;
    case "p100":
    case "p200": {
      const tr = target.targetRank!;
      return `היעד של הטופס הזה: מקום ${tr} — שמחזיר את ההשקעה 💰 הסיכוי לנחות באזור (${refundBandLabel(tr)}): ${chance}`;
    }
    case "last":
      return `המקום האחרון מחזיר את ההשקעה 😄 הסיכוי של הטופס הזה לסיים שם: ${chance}`;
    default:
      // No trailing colon: the live-picks line below may legitimately render
      // nothing (aliveSet unknown before the groups finish).
      return "הפרסים כנראה כבר לא בתמונה עבור הטופס הזה. אבל הוא עדיין חי על המגרש ⚽";
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
  owned,
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
  // false → the form belongs to someone else; all copy goes third-person.
  owned: boolean;
  refining: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const my = cert.byFormId[formId];
  const subject = owned ? "הטופס שלך" : "הטופס הזה";

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
          {`זה סגור: המקום הראשון ${owned ? "שלך" : "של הטופס הזה"}, לא משנה מה יקרה על הדשא 🏆🔒`}
        </p>
      ) : analysis ? (
        <>
          <p className="text-lg font-extrabold text-ink font-heading text-balance">
            {owned
              ? verdictSentence(analysis.target, my.rank)
              : verdictSentenceThirdPerson(analysis.target)}
          </p>
          {analysis.target.key === "none" && (
            <LivePicksLine formData={formData} aliveSet={aliveSet} owned={owned} />
          )}
          {/* Distance ladder only for the fixed refund places — "last" is a
              moving rank under bottom-ties, so the sentence carries it alone. */}
          {analysis.target.targetRank != null &&
            (analysis.target.key === "p100" || analysis.target.key === "p200") && (
              <LadderStrip
                rank={my.rank}
                targetRank={analysis.target.targetRank}
                targetLabel={TARGET_LABEL[analysis.target.key] || ""}
                subject={subject}
              />
            )}
          {analysis.range && analysis.target.key !== "none" && (
            <p className="text-sm text-ink-muted font-bold mt-1.5">
              ברוב התרחישים {subject} מסיים בין מקום <bdi>{analysis.range.lo}</bdi> למקום{" "}
              <bdi>{analysis.range.hi}</bdi>.
            </p>
          )}
        </>
      ) : failed ? (
        <div>
          <p className="text-sm font-bold text-ink">
            הניתוח ההסתברותי לא זמין כרגע — אבל העובדות המתמטיות שלמטה עדיין תקפות.
          </p>
          <button onClick={retry} className="btn-duo btn-duo-ghost btn-duo-sm mt-2">
            נסו שוב
          </button>
        </div>
      ) : (
        <p className="text-sm font-bold text-ink-muted animate-pulse">
          מריצים את המשך המונדיאל אלפי פעמים… ⚽
        </p>
      )}

      {/* Deterministic badges — math only, never probabilistic */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {clinchedFirst && <span className="badge-duo badge-duo-primary">מקום ראשון — מובטח 🔒</span>}
        {clinchedPodium && <span className="badge-duo badge-duo-primary">פודיום מובטח 🔒</span>}
        {clinchedTop10 && <span className="badge-duo badge-duo-secondary">טופ־10 מובטח 🔒</span>}
        {/* The "still alive for the win" fact is shown ONLY when the win is
            the verdict's own story — for a form whose realistic target is
            place 100, "עדיין בחיים במרוץ לזכייה" is technically true (the
            sound bound is loose by design) but reads as a promise the
            verdict itself contradicts. Mathematical elimination, by
            contrast, is always worth stating. */}
        {!clinchedFirst && my.aliveForFirst && analysis?.target.key === "win" && (
          <span className="badge-duo badge-duo-muted">עדיין במרוץ לזכייה ✅</span>
        )}
        {!clinchedFirst && !my.aliveForFirst && (
          <span className="badge-duo badge-duo-muted">הזכייה כבר לא אפשרית מתמטית</span>
        )}
        {refining && !failed && (
          <span className="badge-duo badge-duo-muted">מדייקים את החישוב…</span>
        )}
      </div>

      <p className="text-3xs text-ink-light font-bold mt-3">
        בארי מונדיאל 2026 ⚽ · הערכה, לא הימור
      </p>
    </div>
  );
}
