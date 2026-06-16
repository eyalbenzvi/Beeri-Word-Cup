import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useSummaries, useMatchResults } from "../hooks/useStore";
import { deleteSummary } from "../store";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";
import SummaryEditor from "./SummaryEditor";
import { BLOG } from "../constants/messages";

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
  const showToast = useToast();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

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
        {sortedSummaries.map((s) => (
          <div
            key={s.id}
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
        ))}
      </div>
    </div>
  );
}
