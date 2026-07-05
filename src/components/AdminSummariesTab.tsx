import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Pencil, Eye } from "lucide-react";
import { useSummaries, useMatchResults, useUsers } from "../hooks/useStore";
import { deleteSummary, fetchBlogViews } from "../store";
import type { BlogViewRow } from "../store";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";
import SummaryEditor from "./SummaryEditor";
import { BLOG } from "../constants/messages";

// Aggregate raw blog-view rows into one line per unique viewer, newest first.
function aggregateViews(rows: BlogViewRow[]) {
  const byUser = new Map<string, { count: number; lastTs: string }>();
  for (const r of rows) {
    const prev = byUser.get(r.userId);
    if (!prev) {
      byUser.set(r.userId, { count: 1, lastTs: r.timestamp });
    } else {
      prev.count += 1;
      if (r.timestamp > prev.lastTs) prev.lastTs = r.timestamp;
    }
  }
  return Array.from(byUser.entries())
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => (b.lastTs > a.lastTs ? 1 : b.lastTs < a.lastTs ? -1 : 0));
}

function formatViewTime(ts: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status) {
  if (status === "published") {
    return (
      <span className="text-3xs font-extrabold bg-primary text-white px-2 py-0.5 rounded-full">
        {BLOG.status.publishedBadge}
      </span>
    );
  }
  return (
    <span className="text-3xs font-extrabold bg-accent-soft-2 text-accent-text px-2 py-0.5 rounded-full">
      {BLOG.status.draftBadge}
    </span>
  );
}

export default function AdminSummariesTab() {
  const summaries = useSummaries();
  const matchResults = useMatchResults();
  const users = useUsers();
  const showToast = useToast();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

  // Per-row "who viewed" panel. Only one row is expanded at a time. A request
  // token guards against a stale fetch (fast row switching) writing the wrong
  // list into state.
  const [viewsForId, setViewsForId] = useState<string | null>(null);
  const [viewsRows, setViewsRows] = useState<BlogViewRow[] | null>(null);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsError, setViewsError] = useState(false);
  const viewsReqRef = useRef(0);

  const resolveViewerName = (uid: string) =>
    (users?.[uid] as any)?.displayName || uid;

  const toggleViews = async (summaryId: string) => {
    if (viewsForId === summaryId) {
      // Closing: bump the token so any in-flight fetch for this row is
      // ignored when it resolves (no stale write into a closed panel).
      viewsReqRef.current++;
      setViewsForId(null);
      setViewsRows(null);
      setViewsError(false);
      setViewsLoading(false);
      return;
    }
    const reqId = ++viewsReqRef.current;
    setViewsForId(summaryId);
    setViewsRows(null);
    setViewsError(false);
    setViewsLoading(true);
    try {
      const rows = await fetchBlogViews(summaryId);
      if (viewsReqRef.current !== reqId) return; // superseded by a newer click
      setViewsRows(rows);
    } catch {
      if (viewsReqRef.current !== reqId) return;
      setViewsError(true);
    } finally {
      if (viewsReqRef.current === reqId) setViewsLoading(false);
    }
  };

  const sortedSummaries = useMemo<any[]>(() => {
    return (Object.values(summaries) as any[]).sort((a, b) => (b.number || 0) - (a.number || 0));
  }, [summaries]);

  const coveredByOthers = useMemo(() => {
    const set = new Set<string>();
    for (const sAny of Object.values(summaries)) {
      const s = sAny as any;
      for (const mid of s.coveredMatchIds || []) set.add(mid);
    }
    return set;
  }, [summaries]);

  const uncoveredCount = useMemo(() => {
    const withResults = Object.keys(matchResults);
    return withResults.filter((mid) => !coveredByOthers.has(mid)).length;
  }, [matchResults, coveredByOthers]);

  const handleDelete = async (summary) => {
    const yes = await confirm({
      title: "למחוק סיכום?",
      message: `סיכום #${summary.number} יוסר לצמיתות.\nהמשחקים שהוא מכסה יחזרו להיות "לא סוכמו".`,
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!yes) return;
    const ok = await deleteSummary(summary.id);
    if (ok) showToast(BLOG.editor.deleted, "success");
    else showToast(BLOG.editor.deleteFailed, "error");
  };

  if (editingId || creating) {
    const editingDoc = editingId ? summaries[editingId] : null;
    const headerLabel = creating
      ? BLOG.editor.newSummary
      : editingDoc
        ? BLOG.editor.editSummary(editingDoc.number)
        : BLOG.editor.editSummary("");
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-extrabold text-lg text-ink">{headerLabel}</h3>
        </div>
        <SummaryEditor
          summaryId={editingId}
          onClose={() => {
            setEditingId(null);
            setCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-duo flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-extrabold text-base text-ink">בלוג המונדיאל</h3>
          <p className="text-xs text-ink-muted font-medium">
            {sortedSummaries.length} סיכומים · {uncoveredCount} משחקים חדשים עם תוצאה
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn-duo btn-duo-primary flex items-center gap-1.5"
        >
          <Plus size={18} />
          <span>סיכום חדש</span>
        </button>
      </div>

      {sortedSummaries.length === 0 && (
        <div className="text-center py-12 card-duo-lg">
          <div className="text-5xl mb-3">📰</div>
          <p className="text-lg font-extrabold text-ink mb-1">אין סיכומים עדיין</p>
          <p className="text-sm text-ink-muted font-medium">
            לחץ "סיכום חדש" כדי לכתוב את הראשון (למשל: לקראת הפתיחה).
          </p>
        </div>
      )}

      <div className="space-y-2">
        {sortedSummaries.map((s) => {
          const viewsOpen = viewsForId === s.id;
          const aggregated = viewsOpen && viewsRows ? aggregateViews(viewsRows) : [];
          return (
          <div key={s.id}>
          <div
            className="card-duo flex items-center justify-between gap-3 flex-wrap"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-2xs font-extrabold text-secondary tabular-nums">
                  #{s.number}
                </span>
                {statusBadge(s.status)}
                <span className="text-2xs text-ink-muted font-medium">
                  {(s.coveredMatchIds || []).length} משחקים
                </span>
              </div>
              <div className="text-base font-extrabold text-ink truncate">
                {s.title || "(ללא כותרת)"}
              </div>
              {s.subtitle && (
                <div className="text-xs text-ink-muted font-medium truncate">{s.subtitle}</div>
              )}
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => toggleViews(s.id)}
                className={`btn-duo btn-duo-sm flex items-center gap-1 ${
                  viewsOpen ? "btn-duo-primary" : "btn-duo-ghost-raised"
                }`}
                aria-label={viewsOpen ? BLOG.views.hide : BLOG.views.button}
                aria-expanded={viewsOpen}
              >
                <Eye size={14} />
                <span>{BLOG.views.button}</span>
              </button>
              <button
                onClick={() => setEditingId(s.id)}
                className="btn-duo btn-duo-ghost-raised btn-duo-sm flex items-center gap-1"
                aria-label="ערוך"
              >
                <Pencil size={14} />
                <span>ערוך</span>
              </button>
              <button
                onClick={() => handleDelete(s)}
                className="btn-duo btn-duo-danger btn-duo-sm flex items-center gap-1"
                aria-label="מחק"
              >
                <Trash2 size={14} />
                <span>מחק</span>
              </button>
            </div>
          </div>

          {viewsOpen && (
            <div className="mt-1 mb-1 mr-2 ml-2 card-duo-tight bg-bg-soft">
              <h4 className="text-xs font-extrabold text-ink mb-2 flex items-center gap-1.5">
                <Eye size={14} />
                {BLOG.views.title} #{s.number}
              </h4>
              {viewsLoading && (
                <p className="text-2xs text-ink-muted font-bold py-1">{BLOG.views.loading}</p>
              )}
              {!viewsLoading && viewsError && (
                <p className="text-2xs text-danger font-bold py-1">{BLOG.views.error}</p>
              )}
              {!viewsLoading && !viewsError && aggregated.length === 0 && (
                <p className="text-2xs text-ink-muted font-bold py-1">{BLOG.views.empty}</p>
              )}
              {!viewsLoading && !viewsError && aggregated.length > 0 && (
                <div>
                  <p className="text-2xs text-secondary font-extrabold mb-2 tabular-nums">
                    {BLOG.views.summary(aggregated.length, viewsRows?.length || 0)}
                  </p>
                  <ul className="space-y-1">
                    {aggregated.map((v) => (
                      <li
                        key={v.userId}
                        className="flex items-center justify-between gap-2 text-2xs bg-white rounded-lg px-2 py-1.5"
                      >
                        <span className="font-extrabold text-ink truncate">
                          {resolveViewerName(v.userId)}
                        </span>
                        <span className="text-ink-muted font-medium tabular-nums flex-shrink-0">
                          {BLOG.views.viewCount(v.count)} · {formatViewTime(v.lastTs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
