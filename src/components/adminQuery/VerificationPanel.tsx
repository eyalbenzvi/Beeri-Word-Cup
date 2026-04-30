import { useEffect, useMemo, useState } from "react";
import type { QuerySpec, FlatForm, EvalResult } from "../../utils/adminQuery/types";
import { canonicalize } from "../../utils/adminQuery/canonicalize";
import { validateQuerySpec } from "../../utils/adminQuery/schemas";
import { interpretSpec } from "../../utils/adminQuery/interpret";
import { evaluate } from "../../utils/adminQuery/evaluate";

interface Props {
  spec: QuerySpec;
  flatForms: FlatForm[];
  /** Called when admin commits to running. Receives the final canonical spec. */
  onRun: (spec: QuerySpec, result: EvalResult) => void;
  warnings?: string[];
}

export default function VerificationPanel({
  spec: initialSpec,
  flatForms,
  onRun,
  warnings = [],
}: Props) {
  // Local editable JSON of the canonicalized spec.
  const initialJson = useMemo(
    () => JSON.stringify(canonicalize(initialSpec), null, 2),
    [initialSpec],
  );
  const [json, setJson] = useState(initialJson);
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({});
  const [runError, setRunError] = useState<string | null>(null);

  // When the spec changes, reset BOTH json AND confirmed — otherwise old
  // checkbox ticks survive a spec change and admin "approves" rows that no
  // longer match the new spec's filters.
  useEffect(() => {
    setJson(initialJson);
    setConfirmed({});
    setRunError(null);
  }, [initialJson]);

  let parsed: QuerySpec | null = null;
  let validationError: string | null = null;
  try {
    const obj = JSON.parse(json);
    const c = canonicalize(obj);
    const v = validateQuerySpec(c);
    if (v.ok) parsed = v.value;
    else validationError = (v as any).error;
  } catch (e) {
    parsed = null;
    validationError = "JSON לא תקין";
  }

  const interpreted = parsed ? interpretSpec(parsed) : null;

  // Result preview — count + first 5 forms (per JS+AI reviewers' #1 ask).
  const preview = useMemo(() => {
    if (!parsed) return null;
    try {
      // Count first.
      const countSpec: QuerySpec = { ...parsed, aggregate: { kind: "count" } };
      const countRes = evaluate(countSpec, flatForms) as Extract<
        EvalResult,
        { kind: "count" }
      >;
      // List first 5 for preview.
      const listSpec: QuerySpec = {
        ...parsed,
        aggregate: { kind: "list", limit: 5 },
      };
      const listRes = evaluate(listSpec, flatForms) as Extract<
        EvalResult,
        { kind: "list" }
      >;
      return { count: countRes.value, sample: listRes.rows };
    } catch (e) {
      return null;
    }
  }, [parsed, flatForms]);

  const allConfirmed =
    interpreted &&
    interpreted.structured.every((_, i) => confirmed[i]);

  const handleRun = () => {
    if (!parsed) return;
    if (!allConfirmed) return;
    try {
      const r = evaluate(parsed, flatForms);
      onRun(parsed, r);
    } catch (e: any) {
      setRunError(e?.message || "שגיאה בהרצת השאילתה");
    }
  };

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <div className="card-duo bg-yellow-50 border-yellow-300">
          <h4 className="font-extrabold text-sm text-ink mb-1">⚠ שים/י לב</h4>
          <ul className="text-xs text-ink-muted list-disc pr-4 space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {validationError && (
        <div className="card-duo bg-red-50 border-red-300">
          <h4 className="font-extrabold text-sm text-ink mb-1">שגיאה בשאילתה</h4>
          <p className="text-xs text-ink-muted font-mono">{validationError}</p>
        </div>
      )}

      {interpreted && (
        <div className="card-duo">
          <h4 className="font-extrabold text-base text-ink mb-2">פירוש השאילתה</h4>
          <p className="text-sm text-ink-muted mb-3">{interpreted.sentence}</p>
          <div className="space-y-1">
            {interpreted.structured.map((row, i) => (
              <label
                key={i}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-soft cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!confirmed[i]}
                  onChange={(e) =>
                    setConfirmed((prev) => ({ ...prev, [i]: e.target.checked }))
                  }
                />
                <span className="text-xs text-ink-muted w-24 flex-shrink-0">
                  {row.label}
                </span>
                <span className="text-sm text-ink">{row.value}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="card-duo bg-bg-soft">
          <h4 className="font-extrabold text-sm text-ink mb-2">תצוגה מקדימה</h4>
          <p className="text-xs text-ink-muted mb-2">
            השאילתה תחזיר <strong>{preview.count}</strong> טפסים. דוגמה (5 ראשונים):
          </p>
          {preview.sample.length === 0 ? (
            <p className="text-xs text-ink-muted">אין תוצאות.</p>
          ) : (
            <ul className="text-xs space-y-0.5">
              {preview.sample.slice(0, 5).map((r: any, i) => (
                <li key={i} className="font-mono">
                  {r.formName || r.formId} — {r.ownerName} — {r.totalPoints}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details className="card-duo">
        <summary className="cursor-pointer font-extrabold text-sm">
          ערוך JSON ידנית
        </summary>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          dir="ltr"
          rows={12}
          className="w-full p-2 mt-2 text-xs font-mono border-2 border-border rounded-lg"
        />
      </details>

      <button
        type="button"
        disabled={!parsed || !allConfirmed}
        onClick={handleRun}
        className="btn-duo btn-duo-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        הרץ שאילתה
      </button>
      {!allConfirmed && interpreted && interpreted.structured.length > 0 && (
        <p className="text-xs text-ink-muted text-center">
          סמן/י ✓ ליד כל שורה כדי לאשר את השאילתה.
        </p>
      )}
      {runError && (
        <p className="text-xs text-red-600 text-center">{runError}</p>
      )}
    </div>
  );
}
