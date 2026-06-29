// Pure render of a single blog post — masthead + intro + match digests +
// conclusion. Reused by DailySummary (public page, store-driven) and
// SummaryEditor (admin live preview, draft-driven). Takes everything as
// props so the same JSX renders both a saved post and an in-progress draft.
//
// Intentionally does NOT render: draft banner, guest banner, prev/next nav,
// "newer summary" callout, or the archive grid. Those are concerns of the
// page wrapper, not the article itself.
import MatchDigest from "./MatchDigest";
import { getMatchById } from "../data/matches";
import { getCachedBracket, getFormBracketTeams } from "../utils/bracketCache";
import { BLOG } from "../constants/messages";

function formatDateHe(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jerusalem",
    });
  } catch {
    return "";
  }
}

export default function SummaryArticle({
  summary,
  matchResults = {},
  allPredictions = {},
  users = {},
}) {
  if (!summary) return null;

  const coveredIds = summary.coveredMatchIds || [];
  // Actual results-gated bracket — the single source of truth for which teams
  // really played each knockout slot. Threaded into every digest so knockout
  // stats only count forms that predicted the correct matchup (and so the
  // headline shows the real teams, not a "מנצחת 73" slot label). getCachedBracket
  // is LRU-memoized by results hash, so this is cheap to call on each render.
  const actualBracketTeams = getCachedBracket(matchResults || {}, true);
  // For a draft preview, publishedAt is null — fall back to "now" via
  // updatedAt/createdAt so the byline strip never reads as broken.
  const dateLabel = formatDateHe(
    summary.publishedAt || summary.updatedAt || summary.createdAt,
  );

  return (
    <div>
      {/* Masthead */}
      <header className="mb-6 md:mb-10">
        <div className="text-xs font-extrabold text-secondary uppercase tracking-wider mb-2">
          {BLOG.pageTitle}
          {summary.number ? ` · סיכום #${summary.number}` : ""}
        </div>
        <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-ink leading-tight tracking-tight">
          {summary.title || (summary.number ? `סיכום #${summary.number}` : "סיכום חדש")}
        </h1>
        {summary.subtitle && (
          <p className="text-base md:text-lg text-ink-muted font-bold leading-snug mt-2 max-w-[68ch]">
            {summary.subtitle}
          </p>
        )}
        {(dateLabel || coveredIds.length > 0) && (
          <div className="mt-3 text-xs font-bold text-ink-light flex items-center gap-2 flex-wrap">
            {dateLabel && <time>{dateLabel}</time>}
            {dateLabel && coveredIds.length > 0 && <span aria-hidden="true">·</span>}
            {coveredIds.length > 0 && <span>{coveredIds.length} משחקים</span>}
          </div>
        )}
        <div className="h-px bg-border mt-4" />
      </header>

      {/* The post body — capped reading column. */}
      <article className="prose-column">
        {summary.intro && summary.intro.trim() && (
          <p className="text-base md:text-lg leading-relaxed text-ink whitespace-pre-wrap mt-6 mb-2">
            {summary.intro}
          </p>
        )}

        {coveredIds.length > 0 && coveredIds.map((mid) => {
          const m = getMatchById(mid);
          if (!m) return null;
          return (
            <MatchDigest
              key={mid}
              match={m}
              result={matchResults[mid]}
              note={summary.matchNotes?.[mid]}
              allPredictions={allPredictions}
              users={users}
              actualBracketTeams={actualBracketTeams}
              getFormBracketTeams={getFormBracketTeams}
            />
          );
        })}

        {summary.conclusion && summary.conclusion.trim() && (
          <aside className="mt-10 text-base md:text-lg leading-relaxed text-ink whitespace-pre-wrap">
            {summary.conclusion}
          </aside>
        )}
      </article>
    </div>
  );
}
