import type { EvalResult } from "../../utils/adminQuery/types";

interface Props {
  result: EvalResult;
}

function downloadCsv(filename: string, header: string[], rows: any[][]) {
  const escape = (s: any) =>
    `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob(["﻿" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResultPanel({ result }: Props) {
  if (result.kind === "count") {
    return (
      <div className="card-duo text-center py-8">
        <div className="text-5xl font-extrabold text-primary">{result.value}</div>
        <div className="text-sm text-ink-muted mt-2 font-medium">טפסים תואמים</div>
      </div>
    );
  }
  if (result.kind === "list") {
    const cols = result.rows[0] ? Object.keys(result.rows[0]) : [];
    return (
      <div className="card-duo space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-base text-ink">
            {result.rows.length} מתוך {result.total} טפסים
          </h4>
          <button
            type="button"
            className="btn-duo btn-duo-sm"
            onClick={() =>
              downloadCsv(
                `query-${Date.now()}.csv`,
                cols,
                result.rows.map((r) => cols.map((c) => (r as any)[c])),
              )
            }
          >
            ייצא CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-soft">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-2 text-right">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/40">
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-1.5">
                      {Array.isArray((r as any)[c])
                        ? ((r as any)[c] as any[]).join(", ")
                        : String((r as any)[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (result.kind === "rank") {
    return (
      <div className="card-duo">
        <h4 className="font-extrabold text-base text-ink mb-2">דירוג</h4>
        <ol className="space-y-1">
          {result.rows.map((r, i) => (
            <li
              key={r.formId}
              className="flex items-center justify-between p-2 rounded-lg even:bg-bg-soft"
            >
              <div className="flex gap-3">
                <span className="font-extrabold text-primary w-6">{i + 1}</span>
                <span className="text-ink">{r.formName}</span>
              </div>
              <span className="font-extrabold">{r.score}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (result.kind === "groupBy") {
    const max = Math.max(1, ...result.groups.map((g) => g.value));
    return (
      <div className="card-duo space-y-1">
        <h4 className="font-extrabold text-base text-ink mb-2">קיבוץ</h4>
        {result.groups.map((g) => (
          <div key={g.key} className="flex items-center gap-3 text-sm">
            <div className="w-24 text-ink truncate">{g.key}</div>
            <div className="flex-1 bg-bg-soft rounded-full h-3 overflow-hidden">
              <div
                className="bg-primary h-full"
                style={{ width: `${(g.value / max) * 100}%` }}
              />
            </div>
            <div className="w-12 text-end font-extrabold">{Math.round(g.value * 100) / 100}</div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
