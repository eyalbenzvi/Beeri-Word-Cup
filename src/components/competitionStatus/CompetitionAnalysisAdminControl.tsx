// Admin release control for "המצב שלי בתחרות" — all-or-nothing per user.
// Mounted with one line in AdminSettingsTab. Writes the flag into the
// existing settings doc via updateSettings (admin-gated in the store); the
// control always writes the WHOLE `features` object so a shallow settings
// merge can never drop sibling flags.

import { useMemo, useState } from "react";
import { updateSettings } from "../../store";
import { useToast } from "../Toast";
import {
  getCompetitionAnalysisFlag,
  type FeatureFlagMode,
} from "../../utils/featureFlags";

const MODES: { value: FeatureFlagMode; label: string; hint: string }[] = [
  { value: "off", label: "כבוי", hint: "אף אחד לא רואה את הפיצ'ר (גם לא את הכפתור)" },
  { value: "admin", label: "רק מנהל", hint: "בדיקה עצמית בסביבת אמת" },
  { value: "allowlist", label: "משתמשים נבחרים", hint: "המנהל + הרשימה שלמטה" },
  { value: "all", label: "כולם", hint: "כל משתמש מחובר עם טופס מוגש" },
];

export default function CompetitionAnalysisAdminControl({
  settings,
  users,
}: {
  settings: any;
  users: Record<string, any>;
}) {
  const showToast = useToast();
  const flag = getCompetitionAnalysisFlag(settings);
  const mode: FeatureFlagMode = flag.mode || "off";
  const allow: string[] = Array.isArray(flag.allow) ? flag.allow : [];
  const [search, setSearch] = useState("");

  const writeFlag = (next: { mode?: FeatureFlagMode; allow?: string[] }) => {
    updateSettings({
      features: {
        ...(settings.features || {}),
        competitionAnalysis: { mode, allow, ...next },
      },
    });
  };

  const userList = useMemo(() => {
    const list = Object.entries(users || {}).map(([uid, u]: [string, any]) => ({
      uid,
      name:
        [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
        u?.displayName ||
        uid,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name, "he"));
    return list;
  }, [users]);

  const filtered = search.trim()
    ? userList.filter((u) => u.name.includes(search.trim()) || u.uid.includes(search.trim()))
    : userList;

  const toggleUid = (uid: string) => {
    const next = allow.includes(uid) ? allow.filter((x) => x !== uid) : [...allow, uid];
    writeFlag({ allow: next });
  };

  return (
    <div className="card-duo">
      <h3 className="font-bold text-sm mb-1">🎯 המצב שלי בתחרות — פתיחה הדרגתית</h3>
      <p className="text-xs text-ink-muted mb-3">
        קובע מי רואה את עמוד ניתוח התחרות. הכול או כלום לכל משתמש; שינוי נקלט
        אצל כולם תוך שניות, וכיבוי הוא מיידי.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => {
              writeFlag({ mode: m.value });
              showToast(`המצב עודכן: ${m.label}`);
            }}
            aria-pressed={mode === m.value}
            className={`chip-duo ${mode === m.value ? "active" : ""}`}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-light mb-3">
        {MODES.find((m) => m.value === mode)?.hint}
      </p>

      {mode === "allowlist" && (
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-extrabold text-ink">
              {allow.length === 1 ? (
                "פתוח למשתמש אחד"
              ) : (
                <>
                  פתוח ל־<bdi>{allow.length}</bdi> משתמשים
                </>
              )}
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש משתמש…"
              className="input-duo input-duo-sm w-40"
              aria-label="חיפוש משתמש לפתיחת הפיצ'ר"
            />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {filtered.map((u) => (
              <label
                key={u.uid}
                className="flex items-center gap-2 text-xs font-bold text-ink py-1 px-1.5 rounded-lg odd:bg-bg-soft cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={allow.includes(u.uid)}
                  onChange={() => toggleUid(u.uid)}
                />
                <span className="flex-1 truncate">{u.name}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-ink-muted text-center py-2">לא נמצאו משתמשים</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
