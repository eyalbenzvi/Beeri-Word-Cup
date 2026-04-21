import { useState } from "react";
import { GROUPS, getTeamByCode } from "../data/teams";

const ALL_TEAMS_SORTED = Object.entries(GROUPS)
  .flatMap(([group, teams]) => teams.map((t) => ({ ...t, group })))
  .sort((a, b) => a.name.localeCompare(b.name, "he"));

function TeamSelect({ label, value, onChange, excludeCode }) {
  const options = ALL_TEAMS_SORTED.filter((t) => t.code !== excludeCode);
  return (
    <div>
      <label className="text-xs font-semibold text-ink-muted mb-1 block">{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
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

  const canSubmit = champion && runnerUp && champion !== runnerUp;
  const championTeam = champion ? getTeamByCode(champion) : null;
  const runnerUpTeam = runnerUp ? getTeamByCode(runnerUp) : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">✨</div>
          <h2 className="text-lg font-extrabold text-primary">יצירת תרחיש עם AI</h2>
          <p className="text-xs text-ink-muted mt-1">
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
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-center text-xs text-yellow-800">
            <div className="font-bold mb-1">הגמר יהיה:</div>
            <div>
              {championTeam.flag} {championTeam.name}
              <span className="mx-2">נגד</span>
              {runnerUpTeam.flag} {runnerUpTeam.name}
            </div>
          </div>
        )}

        <div className="text-[11px] text-ink-muted/70 mb-4 leading-relaxed">
          ניחושים שכבר מילאת יישמרו. משחקי הגמר והדרך אליו ייווצרו לפי הבחירה שלך —
          ייתכנו תיקו+הכרעה בדרך, לא רק ניצחונות.
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-200 transition border-none cursor-pointer text-sm"
          >
            ביטול
          </button>
          <button
            onClick={() => canSubmit && onConfirm(champion, runnerUp)}
            disabled={!canSubmit}
            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold py-2.5 rounded-xl hover:from-blue-600 hover:to-purple-600 transition border-none cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            צור תרחיש
          </button>
        </div>
      </div>
    </div>
  );
}
