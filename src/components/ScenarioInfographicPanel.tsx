import { useMemo, useState } from "react";
import { useScenarioData } from "../hooks/useScenarioRun";
import { useCurrentUser } from "../hooks/useStore";
import { useToast } from "./Toast";
import Spinner from "./Spinner";
import {
  selectLikelyScenarios,
  buildInfographicSvg,
  toFixedSizeSvg,
} from "../utils/scenarioInfographic";

// Admin-only "page": the likely-finals infographic + a PNG export. Reuses the
// already-loaded server run (useScenarioData) — no extra fetch. Renders one
// canonical SVG inline (responsive preview) and rasterises the SAME SVG for the
// download, so what you save matches what you see.
//
// Rasterise via XMLSerializer-free path: blob-URL the SVG, draw onto a canvas
// at 2× for crispness, toBlob → download. The whole export is guarded so a
// failure toasts instead of hanging (CLAUDE.md failure-path rule).

const DEFAULT_THRESHOLD = 10; // percent
const EXPORT_SCALE = 2;

function downloadPng(svg: string, width: number, height: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const fixed = toFixedSizeSvg(svg, width, height);
    const blob = new Blob([fixed], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width * EXPORT_SCALE;
        canvas.height = height * EXPORT_SCALE;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => {
          if (!png) {
            reject(new Error("toBlob failed"));
            return;
          }
          const a = document.createElement("a");
          const dl = URL.createObjectURL(png);
          a.href = dl;
          a.download = `beeri-scenarios-${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(dl);
          resolve();
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("svg image load failed"));
    };
    img.src = url;
  });
}

export default function ScenarioInfographicPanel() {
  const { state } = useScenarioData();
  const { user } = useCurrentUser();
  const showToast = useToast();
  const [thresholdPct, setThresholdPct] = useState<number>(DEFAULT_THRESHOLD);
  const [formsPerScenario, setFormsPerScenario] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  const run = state.result;

  const built = useMemo(() => {
    if (!run || run.scenarios.length === 0) return null;
    const selection = selectLikelyScenarios(run, {
      threshold: Math.min(0.95, Math.max(0, thresholdPct / 100)),
      formsPerScenario,
      currentUserId: user?.id || null,
    });
    const { svg, width, height } = buildInfographicSvg(run, selection);
    return { selection, svg, width, height };
  }, [run, thresholdPct, formsPerScenario, user?.id]);

  const handleSave = async () => {
    if (!built) return;
    setSaving(true);
    try {
      await downloadPng(built.svg, built.width, built.height);
      showToast("התמונה נשמרה");
    } catch {
      showToast("שמירת התמונה נכשלה. נסו שוב.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-duo">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-extrabold text-base text-ink">🖼️ אינפוגרפיקה: התרחישים הסבירים ביותר</h3>
          <p className="text-xs text-ink-muted font-medium mt-0.5">
            הגמרים הסבירים והטופס שמוביל בכל אחד. ניתן לשמור כתמונה לשיתוף.
          </p>
        </div>
        <div className="flex items-end gap-2 shrink-0">
          <label className="flex flex-col gap-1">
            <span className="text-2xs text-ink-muted font-extrabold">טפסים בתרחיש</span>
            <div className="flex rounded-lg overflow-hidden border border-ink/10">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFormsPerScenario(n)}
                  className={`px-3 py-1.5 text-2xs font-extrabold transition-colors ${
                    formsPerScenario === n ? "bg-blue-600 text-white" : "bg-white text-ink-muted"
                  }`}
                  aria-pressed={formsPerScenario === n}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs text-ink-muted font-extrabold">סף סבירות (%)</span>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value))}
              className="input-duo input-duo-sm w-24"
              aria-label="סף סבירות באחוזים"
            />
          </label>
          <button
            onClick={handleSave}
            disabled={!built || saving}
            className="btn-duo btn-duo-primary btn-duo-sm disabled:opacity-60"
            title="שומר את האינפוגרפיקה כקובץ PNG"
          >
            {saving ? "שומר…" : "שמירת תמונה (PNG)"}
          </button>
        </div>
      </div>
      <p className="text-3xs text-ink-light font-medium mb-2">
        מציג גמרים (אלופה + סגנית) עם סיכוי גבוה מהסף. ברירת המחדל 10% — שנו את הסף כדי להציג יותר או פחות תרחישים.
      </p>

      {state.loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : !built ? (
        <div className="text-center py-8">
          <div className="text-5xl mb-2">📊</div>
          <p className="text-sm text-ink-muted font-medium">
            {state.error
              ? "טעינת הנתונים נכשלה. נסו לרענן."
              : "עוד אין נתוני תרחישים — יחושבו אוטומטית אחרי התוצאה הבאה."}
          </p>
        </div>
      ) : (
        <>
          {!built.selection.thresholdMet && (
            <p className="text-3xs text-accent-text font-bold mb-2 text-center">
              ⚠️ אף גמר לא עבר את סף ה-{thresholdPct}% — מוצגים הגמרים הסבירים ביותר במקום.
            </p>
          )}
          <div
            className="rounded-2xl overflow-hidden border-2 border-border"
            dangerouslySetInnerHTML={{ __html: built.svg }}
          />
        </>
      )}
    </div>
  );
}
