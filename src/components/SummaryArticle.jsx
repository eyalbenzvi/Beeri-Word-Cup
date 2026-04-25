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
  // For a draft preview, publishedAt is null — fall back to "now" via
  // updatedAt/createdAt so the byline strip never reads as broken.
  const dateLabel = formatDateHe(
    summary.publishedAt || summary.updatedAt || summary.createdAt,
  );

  return (
    <div>
      {/* Masthead */}
      <header className="mb-6 md:mb-10">
        <div className="text-xs font-extrabold text-secondary tracking-[0.18em] uppercase mb-2">
          {BLOG.pageTitle}
          {summary.number ? ` · סיכום #${summary.number}` : ""}
        </div>
        <h1 className="font-heading text-3xl md:text-4xl xl:text-5xl font-extrabold text-ink leading-[1.1] tracking-tight">
          {summary.title || (summary.number ? `סיכום #${summary.number}` : "סיכום חדש")}
        </h1>
        {summary.subtitle && (
          <p className="font-heading text-lg md:text-xl text-ink-muted font-bold leading-snug mt-2 max-w-[68ch]">
            {summary.subtitle}
          </p>
        )}
        {(dateLabel || coveredIds.length > 0) && (
          <div className="mt-3 text-xs font-bold text-ink-light tracking-wider flex items-center gap-2 flex-wrap">
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
          <p className="lede text-lg md:text-xl leading-[1.85] text-ink font-medium whitespace-pre-wrap mt-6 mb-2">
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
            />
          );
        })}

        {summary.conclusion && summary.conclusion.trim() && (
          <aside
            className="mt-10 border-r-4 pr-4 text-base md:text-lg leading-relaxed text-ink whitespace-pre-wrap"
            style={{ borderColor: "var(--color-accent)" }}
          >
            {summary.conclusion}
          </aside>
        )}
      </article>
    </div>
  );
}
