// Entry point to "המצב שלי בתחרות" — the ONLY component referenced from an
// existing surface (two one-line mounts in Leaderboard.tsx). ALL gating lives
// HERE so the mount lines are unconditionally safe: renders null unless
//   - the admin flag releases the current user (server-confirmed settings)
//   - predictions are locked (pre-lock there is nothing to analyse)
//   - the user owns at least one submitted form
// A user who isn't released never sees the button at all.

import { ChevronLeft } from "lucide-react";
import { useNavigation } from "../../hooks/useNavigation";
import { useAllPredictions } from "../../hooks/useStore";
import { useCompetitionAnalysisAccess } from "../../hooks/useCompetitionAnalysisAccess";
import { normalizeStatus } from "../../utils/helpers";

export default function CompetitionAnalysisEntry({
  compact = false,
  formId = null,
}: {
  compact?: boolean;
  // Compact variant renders only when this form belongs to the current user.
  formId?: string | null;
}) {
  const { visible, locked, user } = useCompetitionAnalysisAccess();
  const allPredictions = useAllPredictions();
  const { navigate } = useNavigation();

  if (!visible || !locked || !user) return null;

  const isMineSubmitted = (fid: string) => {
    const f = allPredictions?.[fid];
    return !!f && f.userId === user.id && normalizeStatus(f.status) === "submitted";
  };

  if (compact) {
    if (!formId || !isMineSubmitted(formId)) return null;
    return (
      <button
        onClick={() => navigate("mystatus", { form: formId })}
        className="btn-duo btn-duo-ghost-raised w-full mt-3 text-sm font-extrabold"
      >
        🎯 המצב שלי בתחרות — סיכויים ויעדים
      </button>
    );
  }

  const hasSubmitted = Object.keys(allPredictions || {}).some(isMineSubmitted);
  if (!hasSubmitted) return null;

  return (
    <button
      onClick={() => navigate("mystatus")}
      className="card-duo card-duo-hover mb-3 w-full flex items-center gap-3 text-right cursor-pointer"
    >
      <span
        className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center text-xl shrink-0"
        aria-hidden="true"
      >
        🎯
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-extrabold text-ink text-sm">המצב שלי בתחרות</span>
        <span className="block text-xs text-ink-muted font-medium mt-0.5">
          סיכויים, יעדים ואת מי לעודד במשחקים הקרובים
        </span>
      </span>
      <span className="badge-duo badge-duo-accent shrink-0">חדש</span>
      <ChevronLeft size={18} className="text-ink-light shrink-0" aria-hidden="true" />
    </button>
  );
}
