import { useEffect, useMemo } from "react";
import { ChevronRight, ChevronLeft, Trophy } from "lucide-react";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SummaryArticle from "../components/SummaryArticle";
import {
  useSummaries,
  useSummariesReady,
  useMatchResults,
  useAllPredictions,
  useUsers,
  useCurrentUser,
  useSettings,
  useSettingsReady,
} from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { useActualBonuses } from "../hooks/useStore";
import { useRightRail } from "../hooks/useRail";
import { BLOG } from "../constants/messages";

function LeaderboardRail({ rankedLeaderboard, users }) {
  if (!rankedLeaderboard || rankedLeaderboard.length === 0) return null;
  const top = rankedLeaderboard.slice(0, 10);
  return (
    <div className="card-duo">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={18} className="text-accent" />
        <h3 className="font-extrabold text-sm text-ink">צמרת הטבלה</h3>
      </div>
      <ol className="space-y-1">
        {top.map((entry) => {
          const displayName = users?.[entry.userId]?.displayName || entry.userName || "משתתף";
          return (
            <li
              key={entry.formId}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-bg-soft text-[11px] font-extrabold text-ink-muted tabular-nums">
                  {entry.rank}
                </span>
                <span className="font-bold text-ink truncate">{displayName}</span>
              </div>
              <span className="text-sm font-extrabold text-primary tabular-nums">
                {entry.totalPoints}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LatestCountdown({ sortedSummaries, currentNumber }) {
  const latestNumber = sortedSummaries.length > 0
    ? sortedSummaries[sortedSummaries.length - 1].number
    : null;
  if (!latestNumber || latestNumber === currentNumber) return null;
  return (
    <div className="alert-primary-soft text-center mb-3">
      <p className="text-sm font-extrabold text-primary-dark">
        {BLOG.public.latestBadge(latestNumber)}
      </p>
    </div>
  );
}

export default function DailySummary() {
  const summaries = useSummaries();
  const matchResults = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const { user } = useCurrentUser();
  const settings = useSettings();
  const settingsReady = useSettingsReady();
  const summariesReady = useSummariesReady();
  const { params, navigate } = useNavigation();

  const { rankedLeaderboard } = useLeaderboardComputed(
    matchResults,
    allPredictions,
    users,
    actualBonuses,
  );

  // Non-admin users see only published summaries. Admins can preview drafts
  // as well, which is useful for checking how a post will render.
  const visibleSummaries = useMemo(() => {
    const arr = Object.values(summaries || {});
    return arr
      .filter((s) => s.status === "published" || user?.isAdmin)
      .sort((a, b) => (a.number || 0) - (b.number || 0));
  }, [summaries, user?.isAdmin]);

  const publishedSummaries = useMemo(
    () => visibleSummaries.filter((s) => s.status === "published"),
    [visibleSummaries],
  );

  // Resolve the active summary from URL. If no `n` param, jump to the newest.
  const active = useMemo(() => {
    const n = Number(params?.n);
    if (Number.isFinite(n) && n > 0) {
      const byNum = visibleSummaries.find((s) => s.number === n);
      if (byNum) return byNum;
    }
    // Prefer latest PUBLISHED; fall back to latest of anything (admin only).
    if (publishedSummaries.length > 0) {
      return publishedSummaries[publishedSummaries.length - 1];
    }
    return visibleSummaries.length > 0
      ? visibleSummaries[visibleSummaries.length - 1]
      : null;
  }, [visibleSummaries, publishedSummaries, params?.n]);

  // If the URL has no `n` (or the value isn't a positive number), jump to the
  // latest so refresh + share always land on a stable URL. If `n` IS set and
  // doesn't resolve to a real summary, we intentionally DON'T redirect — the
  // page below renders a not-found state so the broken link is visible.
  useEffect(() => {
    if (!active) return;
    const raw = params?.n;
    const cur = Number(raw);
    const hasValidN = raw != null && raw !== "" && Number.isFinite(cur) && cur > 0;
    if (!hasValidN && cur !== active.number) {
      // Replace (not push) — we're fixing up the URL rather than taking the
      // user somewhere new, so we don't want Back to bounce them into the
      // no-param state they never meant to land on.
      navigate("blog", { n: active.number }, { replace: true });
    }
    // navigate intentionally omitted — it's stable from the provider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, params?.n]);

  // Desktop side rail: leaderboard snapshot (skip for logged-out viewers —
  // we can't compute scores without the full predictions stream, and showing
  // an empty table would be confusing).
  const rail = useMemo(
    () =>
      user && rankedLeaderboard && rankedLeaderboard.length > 0
        ? <LeaderboardRail rankedLeaderboard={rankedLeaderboard} users={users} />
        : null,
    [rankedLeaderboard, users, user],
  );
  useRightRail(rail);

  // For a guest hitting /blog directly, the store starts with default
  // values (predictionsLocked: false, summaries: {}) until the public
  // listeners resolve a moment later. Without readiness gates, the first
  // render briefly shows "אין עדיין סיכומים" — wrongly — even when there
  // IS a published post. We hold a loading state until BOTH:
  //   1. settings is loaded (to know if predictionsLocked is true), AND
  //   2. summaries listener has fired at least once (to know if there's
  //      really nothing, vs. just not arrived yet).
  // Admins go through the full auth flow + App.jsx ready gate, so by the
  // time they see this component the store is already populated; the
  // readiness checks below are no-ops for them.
  const predictionsLocked = !!settings?.predictionsLocked;
  const blogDataReady = settingsReady && summariesReady;
  if (!user?.isAdmin && !blogDataReady) {
    return (
      <div className="text-center py-8 text-ink-muted font-bold">
        טוען...
      </div>
    );
  }

  // Pre-tournament: hide the blog from logged-out guests. Logged-in users
  // (including admins) keep access — they see published summaries or an
  // empty state.
  if (!user && !predictionsLocked) {
    return (
      <div>
        <PageHeader eyebrow={BLOG.pageTitle} title="סיכומים יומיים" />
        <EmptyState
          icon="📰"
          title={BLOG.public.emptyTitle}
        />
      </div>
    );
  }

  // No summaries at all (now safe to evaluate — the summaries listener has
  // either resolved with data or genuinely returned an empty set).
  if (visibleSummaries.length === 0) {
    return (
      <div>
        <PageHeader eyebrow={BLOG.pageTitle} title="סיכומים יומיים" />
        <EmptyState
          icon="📰"
          title={BLOG.public.emptyTitle}
        />
      </div>
    );
  }

  // URL asked for a specific n that doesn't exist — show graceful not-found.
  // Tighten to digits-only so "1e9" / hex / empty strings fall through to
  // the latest-summary path instead of showing a bogus "not found" card.
  const rawN = params?.n;
  const isStrictInt = typeof rawN === "string" && /^\d+$/.test(rawN);
  const requestedN = isStrictInt ? Number(rawN) : NaN;
  if (isStrictInt && requestedN > 0 && !visibleSummaries.find((s) => s.number === requestedN)) {
    return (
      <div>
        <PageHeader eyebrow={BLOG.pageTitle} title="סיכום לא נמצא" />
        <EmptyState
          icon="🔎"
          title={BLOG.public.notFoundTitle(requestedN)}
          description={BLOG.public.notFoundBody}
          cta={
            <button
              onClick={() => navigate("blog")}
              className="btn-duo btn-duo-primary"
            >
              {BLOG.public.notFoundCta}
            </button>
          }
        />
      </div>
    );
  }

  if (!active) return null;

  const prev = visibleSummaries.find((s) => s.number === active.number - 1);
  const next = visibleSummaries.find((s) => s.number === active.number + 1);

  return (
    <div>
      {active.status !== "published" && (
        <div className="alert-accent-soft mb-3 text-center">
          <p className="text-sm font-extrabold text-accent-text">
            {BLOG.public.draftBanner}
          </p>
        </div>
      )}

      {!user && (
        <div className="alert-primary-soft mb-3 text-center">
          <p className="text-sm font-extrabold text-primary-dark mb-1">
            {BLOG.public.guestTitle}
          </p>
          <p className="text-xs text-ink-muted font-medium">
            {BLOG.public.guestBody}
          </p>
          <button
            onClick={() => navigate("home")}
            className="btn-duo btn-duo-primary btn-duo-sm mt-2"
          >
            {BLOG.public.guestCta}
          </button>
        </div>
      )}

      {/* Compact post nav — flat (no 3-D shadow) so the headline still leads. */}
      <div className="flex items-center justify-between gap-2 mb-6 text-sm">
        <button
          onClick={() => prev && navigate("blog", { n: prev.number })}
          disabled={!prev}
          className="btn-duo-flat disabled:opacity-40"
          aria-label="סיכום קודם"
        >
          <ChevronRight size={16} />
          <span>קודם</span>
        </button>
        <span className="text-xs text-ink-light font-bold tabular-nums">
          {active.number} / {publishedSummaries.length || visibleSummaries.length}
        </span>
        <button
          onClick={() => next && navigate("blog", { n: next.number })}
          disabled={!next}
          className="btn-duo-flat disabled:opacity-40"
          aria-label="סיכום הבא"
        >
          <span>הבא</span>
          <ChevronLeft size={16} />
        </button>
      </div>

      <LatestCountdown sortedSummaries={publishedSummaries} currentNumber={active.number} />

      {/* The article itself — pure render, reused by the editor preview. */}
      <SummaryArticle
        summary={active}
        matchResults={matchResults}
        allPredictions={allPredictions}
        users={users}
      />

      {/* Archive grid */}
      {visibleSummaries.length > 1 && (
        <div className="mt-12">
          <h3 className="font-heading text-base font-extrabold text-ink mb-3">
            {BLOG.archiveHeader}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[...visibleSummaries].reverse().map((s) => {
              const isCurrent = s.number === active.number;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate("blog", { n: s.number })}
                  className={`text-right card-duo-tight bg-transparent cursor-pointer transition ${
                    isCurrent ? "border-primary bg-primary/5" : "hover:border-ink-muted"
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-extrabold text-secondary tabular-nums">
                      #{s.number}
                    </span>
                    {s.status !== "published" && (
                      <span className="text-[10px] font-extrabold bg-accent-soft-2 text-accent-text px-2 py-0.5 rounded-full">
                        טיוטה
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-extrabold text-ink truncate">
                    {s.title || `סיכום #${s.number}`}
                  </div>
                  <div className="text-[11px] text-ink-muted font-medium">
                    {(s.coveredMatchIds || []).length} משחקים
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
