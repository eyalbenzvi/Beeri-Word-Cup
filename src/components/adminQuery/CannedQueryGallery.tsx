import { CANNED_QUERIES } from "../../utils/adminQuery/cannedQueries";
import type { QuerySpec } from "../../utils/adminQuery/types";

interface Props {
  onPick: (spec: QuerySpec, title: string) => void;
}

export default function CannedQueryGallery({ onPick }: Props) {
  return (
    <div className="space-y-2">
      <h4 className="font-extrabold text-sm text-ink">שאילתות מוכנות</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {CANNED_QUERIES.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onPick(q.spec, q.title)}
            className="text-right p-3 bg-bg-soft border-2 border-border rounded-xl hover:border-primary cursor-pointer"
          >
            <div className="font-extrabold text-sm text-ink">{q.title}</div>
            <div className="text-xs text-ink-muted mt-1">{q.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
