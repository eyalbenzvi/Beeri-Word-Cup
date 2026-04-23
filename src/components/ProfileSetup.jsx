import { useState } from "react";
import { updateUserProfile } from "../store";
import InlineError from "./InlineError";

export default function ProfileSetup({ user, onComplete }) {
  const googleName = user.displayName || "";
  const parts = googleName.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(parts[0] || "");
  const [lastName, setLastName] = useState(parts.slice(1).join(" ") || "");
  const [nickname, setNickname] = useState(parts[0] || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const initials = (firstName || googleName || "?").charAt(0).toUpperCase();

  const attempt = async (fields) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const ok = await updateUserProfile(user.id, fields);
      if (!ok) {
        setError("שמירה נכשלה. נסה שוב.");
        return;
      }
      onComplete();
    } catch (err) {
      setError(err?.message || "שמירה נכשלה. נסה שוב.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => attempt({
    firstName,
    lastName,
    displayName: nickname || firstName || googleName,
    profileCompleted: true,
  });

  const handleSkip = () => attempt({ profileCompleted: true });

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full border-2 border-border text-center animate-pop-in">
        <div className="text-5xl mb-3">⚽</div>
        <h1 className="text-2xl font-extrabold text-ink mb-1">ברוך הבא!</h1>
        <p className="text-sm text-ink-muted mb-6 font-medium">בוא נגדיר את הפרופיל שלך</p>

        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center text-4xl font-extrabold border-4 border-primary-dark">
            {initials}
          </div>
        </div>

        <div className="space-y-3 text-right">
          <div>
            <label className="block text-xs font-extrabold text-ink mb-1">שם פרטי</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="שם פרטי"
              className="input-duo"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-ink mb-1">שם משפחה</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="שם משפחה"
              className="input-duo"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-ink mb-1">כינוי (יוצג בדירוג)</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="כינוי"
              className="input-duo"
            />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-duo btn-duo-primary w-full mt-6">
          {saving ? "שומר..." : "!בואו נתחיל"}
        </button>

        <button
          onClick={handleSkip}
          disabled={saving}
          className="mt-3 text-sm text-ink-muted hover:text-ink transition bg-transparent border-none cursor-pointer underline disabled:opacity-60 font-medium"
        >
          דלג
        </button>

        <InlineError className="mt-3" align="center">{error}</InlineError>
      </div>
    </div>
  );
}
