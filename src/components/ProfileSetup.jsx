import { useState } from "react";
import { updateUserProfile } from "../store";

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
      <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-lg border border-border text-center">
        <div className="text-4xl mb-3">⚽</div>
        <h1 className="text-xl font-extrabold text-primary mb-1">ברוך הבא!</h1>
        <p className="text-sm text-ink-muted mb-6">בוא נגדיר את הפרופיל שלך</p>

        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-primary/20 text-primary flex items-center justify-center text-3xl font-bold">
            {initials}
          </div>
        </div>

        <div className="space-y-3 text-right">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">שם פרטי</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="שם פרטי"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">שם משפחה</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="שם משפחה"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">כינוי (יוצג בדירוג)</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="כינוי"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary text-white font-extrabold py-3.5 rounded-2xl hover:bg-primary-light transition text-base border-none cursor-pointer shadow-md mt-6 disabled:opacity-60"
        >
          {saving ? "שומר..." : "!בואו נתחיל"}
        </button>

        <button
          onClick={handleSkip}
          disabled={saving}
          className="mt-3 text-sm text-ink-muted hover:text-primary transition bg-transparent border-none cursor-pointer underline disabled:opacity-60"
        >
          דלג
        </button>

        {error && (
          <p className="text-sm text-red-500 mt-3" role="alert">{error}</p>
        )}
      </div>
    </div>
  );
}
