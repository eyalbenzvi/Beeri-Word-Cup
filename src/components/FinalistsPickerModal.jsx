import { useState, useRef, useEffect } from "react";
import { GROUPS, getTeamByCode } from "../data/teams";
import { useFocusTrap } from "../hooks/useFocusTrap";

const ALL_TEAMS_SORTED = Object.entries(GROUPS)
  .flatMap(([group, teams]) => teams.map((t) => ({ ...t, group })))
  .sort((a, b) => a.name.localeCompare(b.name, "he"));

function TeamSelect({ label, value, onChange, excludeCode }) {
  const options = ALL_TEAMS_SORTED.filter((t) => t.code !== excludeCode);
  return (
    <div>
      <label className="text-xs font-extrabold text-ink mb-1 block">{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="input-duo"
      >
        <option value="">-- בחר נבחרת --</option>
        {options.map((t) => (
          <option key={t.code} value={t.code}>
            {t.flag} {t.name} (בית {t.group})
          </option>
        ))}
      </select>
    </div>
  );
}

export default function FinalistsPickerModal({
  initialChampion,
  initialRunnerUp,
  onCancel,
  onConfirm,
}) {
  const [champion, setChampion] = useState(initialChampion || null);
  const [runnerUp, setRunnerUp] = useState(initialRunnerUp || null);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canSubmit = champion && runnerUp && champion !== runnerUp;
  const championTeam = champion ? getTeamByCode(champion) : null;
  const runnerUpTeam = runnerUp ? getTeamByCode(runnerUp) : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="בחירת אלופה וסגנית"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div ref={dialogRef} className="bg-white rounded-3xl p-6 max-w-md w-full border-2 border-border animate-pop-in">
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">✨</div>
          <h2 className="text-xl font-extrabold text-ink">יצירת תרחיש עם AI</h2>
          <p className="text-sm text-ink-muted mt-1 font-medium">
            בחר את האלופה והסגנית — הטופס ימולא כך שהן ייפגשו בגמר
          </p>
        </div>

        <div className="space-y-3 mb-4">
          <TeamSelect
            label="🏆 אלופה"
            value={champion}
            onChange={setChampion}
            excludeCode={runnerUp}
          />
          <TeamSelect
            label="🥈 סגנית"
            value={runnerUp}
            onChange={setRunnerUp}
            excludeCode={champion}
          />
        </div>

        {championTeam && runnerUpTeam && (
          <div className="border-2 border-accent rounded-2xl p-3 mb-4 text-center text-sm text-accent-text font-bold" style={{ background: "var(--color-accent-soft)" }}>
            <div className="font-extrabold mb-1">הגמר יהיה:</div>
            <div>
              {championTeam.flag} {championTeam.name}
              <span className="mx-2">נגד</span>
              {runnerUpTeam.flag} {runnerUpTeam.name}
            </div>
          </div>
        )}

        <div className="text-xs text-ink-muted mb-4 leading-relaxed font-medium">
          ניחושים שכבר מילאת יישמרו. משחקי הגמר והדרך אליו ייווצרו לפי הבחירה שלך —
          ייתכנו תיקו+הכרעה בדרך, לא רק ניצחונות.
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-duo btn-duo-ghost flex-1">
            ביטול
          </button>
          <button
            onClick={() => canSubmit && onConfirm(champion, runnerUp)}
            disabled={!canSubmit}
            className="btn-duo btn-duo-blue flex-1"
          >
            ✨ צור תרחיש
          </button>
        </div>
      </div>
    </div>
  );
}
