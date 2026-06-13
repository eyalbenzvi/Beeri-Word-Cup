// Slim home-page teaser for the latest published daily summary (blog).
// Free distribution for content the admin already writes. Always shows the
// latest published post — no read-tracking bookkeeping (v1 decision).
// Renders nothing while summaries are loading or none are published.

import { useMemo } from "react";
import { Newspaper, ChevronLeft } from "lucide-react";
import { useSummaries, useSummariesReady } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { SUMMARY_TEASER, BLOG } from "../constants/messages";

export default function SummaryTeaser() {
  const summaries = useSummaries();
  const ready = useSummariesReady();
  const { navigate } = useNavigation();

  const latest = useMemo(() => {
    let best = null;
    for (const s of Object.values(summaries || {})) {
      const sum = s as any;
      if (sum?.status !== "published") continue;
      if (!best || (sum.number || 0) > (best.number || 0)) best = sum;
    }
    return best;
  }, [summaries]);

  if (!ready || !latest) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("blog", { n: latest.number })}
      className="card-duo w-full text-right mb-3 cursor-pointer tap-44"
      aria-label={`${BLOG.pageTitle}: ${latest.title || ""}`}
    >
      <div className="flex items-center gap-2.5">
        <Newspaper size={20} className="shrink-0 text-secondary" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold text-ink-muted">
            {SUMMARY_TEASER.title(latest.number)}
          </div>
          {latest.title && (
            <div className="text-sm font-bold text-ink truncate">
              {latest.title}
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs font-extrabold text-secondary inline-flex items-center gap-0.5">
          {SUMMARY_TEASER.readCta}
          <ChevronLeft size={14} aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}
