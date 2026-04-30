import { useMemo, useState } from "react";
import {
  useAllPredictions,
  useMatchResults,
  useActualBonuses,
  useUserDirectory,
} from "../../hooks/useStore";
import { auth } from "../../firebase";
import { flattenAll } from "../../utils/adminQuery/flatten";
import { canonicalize } from "../../utils/adminQuery/canonicalize";
import { validateQuerySpec } from "../../utils/adminQuery/schemas";
import { resolveResidual } from "../../utils/adminQuery/resolveResidual";
import { parseChipsFromText, defaultLabelLookup } from "../../utils/adminQuery/chipSerialize";
import type { QuerySpec, EvalResult, FlatForm } from "../../utils/adminQuery/types";
import ChipInput from "./ChipInput";
import VerificationPanel from "./VerificationPanel";
import ResultPanel from "./ResultPanel";
import CannedQueryGallery from "./CannedQueryGallery";

type Phase =
  | { kind: "idle" }
  | { kind: "translating" }
  | { kind: "ready"; spec: QuerySpec; warnings: string[] }
  | { kind: "clarify"; question: string }
  | { kind: "done"; spec: QuerySpec; result: EvalResult }
  | { kind: "error"; message: string };

export default function AdminQueryTab() {
  const allPredictions = useAllPredictions();
  const results = useMatchResults();
  const actualBonuses = useActualBonuses();
  const userDirectory = useUserDirectory();

  const flatForms: FlatForm[] = useMemo(
    () =>
      flattenAll(
        allPredictions as any,
        userDirectory as any,
        results as any,
        actualBonuses,
      ),
    [allPredictions, userDirectory, results, actualBonuses],
  );

  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const formsForAutocomplete = useMemo(
    () =>
      flatForms.map((f) => ({
        formId: f.formId,
        formName: f.formName,
        ownerName: f.ownerName,
      })),
    [flatForms],
  );

  const handlePickCanned = (spec: QuerySpec) => {
    setPhase({ kind: "ready", spec, warnings: [] });
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    setPhase({ kind: "translating" });
    try {
      const { chips } = parseChipsFromText(question, defaultLabelLookup);
      const resolved = resolveResidual(question, chips);
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setPhase({ kind: "error", message: "לא מחובר. נסה/י להתחבר מחדש." });
        return;
      }
      const res = await fetch("/.netlify/functions/admin-query-translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ question, resolvedEntities: resolved }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPhase({ kind: "error", message: err.error || `HTTP ${res.status}` });
        return;
      }
      const data = await res.json();
      const raw = data.raw || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // One retry: ask the function to fix the JSON.
        const retry = await fetch("/.netlify/functions/admin-query-translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            question,
            resolvedEntities: resolved,
            retryError: `${raw}\n--RETRY--\nNot valid JSON.`,
          }),
        });
        if (!retry.ok) {
          setPhase({ kind: "error", message: "התרגום נכשל. נסה/י שאילתה אחרת." });
          return;
        }
        const data2 = await retry.json();
        parsed = JSON.parse(data2.raw || "{}");
      }
      if (parsed.clarifyingQuestion) {
        setPhase({ kind: "clarify", question: parsed.clarifyingQuestion });
        return;
      }
      const c = canonicalize(parsed.spec);
      const v = validateQuerySpec(c);
      if (!v.ok) {
        // Single retry path with validation error fed back.
        const retry = await fetch("/.netlify/functions/admin-query-translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            question,
            resolvedEntities: resolved,
            retryError: `${raw}\n--RETRY--\n${(v as any).error}`,
          }),
        });
        if (!retry.ok) {
          setPhase({ kind: "error", message: `תרגום שגוי: ${(v as any).error}` });
          return;
        }
        const data2 = await retry.json();
        const parsed2 = JSON.parse(data2.raw || "{}");
        const c2 = canonicalize(parsed2.spec);
        const v2 = validateQuerySpec(c2);
        if (!v2.ok) {
          setPhase({ kind: "error", message: `תרגום שגוי: ${(v2 as any).error}` });
          return;
        }
        setPhase({ kind: "ready", spec: c2, warnings: resolved.warnings });
        return;
      }
      setPhase({ kind: "ready", spec: c, warnings: resolved.warnings });
    } catch (e: any) {
      setPhase({ kind: "error", message: e?.message || "שגיאה לא ידועה" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-2">
          שאילתות חופשיות
        </h3>
        <p className="text-xs text-ink-muted mb-3 font-medium">
          הקלד/י שאלה בעברית. ה-AI יתרגם אותה לשאילתה. סמן/י את כל הסעיפים בפירוש לפני הרצה.
        </p>
        <ChipInput
          value={question}
          onChange={setQuestion}
          forms={formsForAutocomplete}
          onSubmit={handleAsk}
        />
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={handleAsk}
            disabled={phase.kind === "translating" || !question.trim()}
            className="btn-duo btn-duo-primary"
          >
            {phase.kind === "translating" ? "מתרגם..." : "תרגם שאילתה"}
          </button>
          <button
            type="button"
            onClick={() => {
              setQuestion("");
              setPhase({ kind: "idle" });
            }}
            className="btn-duo btn-duo-sm"
          >
            נקה
          </button>
        </div>
      </div>

      {phase.kind === "clarify" && (
        <div className="card-duo bg-yellow-50 border-yellow-300">
          <h4 className="font-extrabold text-sm text-ink">דרושה הבהרה</h4>
          <p className="text-sm text-ink-muted mt-1">{phase.question}</p>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="card-duo bg-red-50 border-red-300">
          <h4 className="font-extrabold text-sm text-ink">שגיאה</h4>
          <p className="text-sm text-ink-muted mt-1">{phase.message}</p>
        </div>
      )}

      {phase.kind === "ready" && (
        <VerificationPanel
          spec={phase.spec}
          flatForms={flatForms}
          warnings={phase.warnings}
          onRun={(spec, result) =>
            setPhase({ kind: "done", spec, result })
          }
        />
      )}

      {phase.kind === "done" && (
        <div className="space-y-3">
          <ResultPanel result={phase.result} />
          <button
            type="button"
            onClick={() => setPhase({ kind: "ready", spec: phase.spec, warnings: [] })}
            className="btn-duo btn-duo-sm"
          >
            ערוך שאילתה
          </button>
        </div>
      )}

      {phase.kind === "idle" && (
        <CannedQueryGallery onPick={handlePickCanned} />
      )}
    </div>
  );
}
