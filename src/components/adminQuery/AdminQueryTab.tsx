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
import { evaluate } from "../../utils/adminQuery/evaluate";
import { interpretSpec } from "../../utils/adminQuery/interpret";
import { parseChipsFromText, defaultLabelLookup } from "../../utils/adminQuery/chipSerialize";
import type { QuerySpec, EvalResult, FlatForm } from "../../utils/adminQuery/types";
import ChipInput from "./ChipInput";
import ResultPanel from "./ResultPanel";
import CannedQueryGallery from "./CannedQueryGallery";

type Phase =
  | { kind: "idle" }
  | { kind: "translating" }
  | { kind: "clarify"; question: string }
  | { kind: "done"; spec: QuerySpec; result: EvalResult; warnings: string[] }
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

  // Run a validated spec straight to a result. Shared between the free-text
  // path (after LLM translation) and the canned-query path. Per user request,
  // there is no middle verification step.
  const runSpec = (spec: QuerySpec, warnings: string[] = []): Phase => {
    try {
      const result = evaluate(spec, flatForms);
      return { kind: "done", spec, result, warnings };
    } catch (e: any) {
      return { kind: "error", message: e?.message || "שגיאה בהרצת השאילתה" };
    }
  };

  const handlePickCanned = (spec: QuerySpec) => {
    setPhase(runSpec(canonicalize(spec)));
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

      const callTranslate = async (retryError?: string) => {
        const res = await fetch("/.netlify/functions/admin-query-translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            question,
            resolvedEntities: resolved,
            ...(retryError ? { retryError } : {}),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        return data.raw || "{}";
      };

      // First call.
      let raw: string;
      try {
        raw = await callTranslate();
      } catch (e: any) {
        setPhase({ kind: "error", message: e?.message || "התרגום נכשל" });
        return;
      }

      // Parse + validate, with a single retry on failure (JSON or schema).
      const tryParseValidate = (text: string) => {
        try {
          const obj = JSON.parse(text);
          if (obj.clarifyingQuestion) {
            return { kind: "clarify" as const, question: obj.clarifyingQuestion };
          }
          const c = canonicalize(obj.spec);
          const v = validateQuerySpec(c);
          if (!v.ok) return { kind: "invalid" as const, error: (v as any).error };
          return { kind: "ok" as const, spec: c };
        } catch {
          return { kind: "invalid" as const, error: "Not valid JSON" };
        }
      };

      let outcome = tryParseValidate(raw);
      if (outcome.kind === "invalid") {
        try {
          const raw2 = await callTranslate(`${raw}\n--RETRY--\n${outcome.error}`);
          outcome = tryParseValidate(raw2);
        } catch (e: any) {
          setPhase({ kind: "error", message: e?.message || "התרגום נכשל" });
          return;
        }
      }

      if (outcome.kind === "clarify") {
        setPhase({ kind: "clarify", question: outcome.question });
        return;
      }
      if (outcome.kind === "invalid") {
        setPhase({ kind: "error", message: `תרגום שגוי: ${outcome.error}` });
        return;
      }

      // Translate succeeded → run immediately. No checkbox gate.
      setPhase(runSpec(outcome.spec, resolved.warnings));
    } catch (e: any) {
      setPhase({ kind: "error", message: e?.message || "שגיאה לא ידועה" });
    }
  };

  const interpreted = phase.kind === "done" ? interpretSpec(phase.spec) : null;

  return (
    <div className="space-y-4">
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-2">
          שאילתות חופשיות
        </h3>
        <p className="text-xs text-ink-muted mb-3 font-medium">
          הקלד/י שאלה בעברית. ה-AI יתרגם אותה ויריץ את השאילתה.
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
            {phase.kind === "translating" ? "מריץ..." : "הרץ שאילתה"}
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

      {phase.kind === "done" && interpreted && (
        <div className="space-y-3">
          {phase.warnings.length > 0 && (
            <div className="card-duo bg-yellow-50 border-yellow-300">
              <h4 className="font-extrabold text-sm text-ink mb-1">⚠ שים/י לב</h4>
              <ul className="text-xs text-ink-muted list-disc pr-4 space-y-0.5">
                {phase.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="card-duo bg-bg-soft">
            <h4 className="font-extrabold text-sm text-ink mb-1">פירוש השאילתה</h4>
            <p className="text-sm text-ink-muted">{interpreted.sentence}</p>
          </div>
          <ResultPanel result={phase.result} />
        </div>
      )}

      {phase.kind === "idle" && (
        <CannedQueryGallery onPick={handlePickCanned} />
      )}
    </div>
  );
}
