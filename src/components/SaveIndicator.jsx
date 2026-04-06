import { useState, useEffect } from "react";
import { hasPendingWrites } from "../store";

export default function SaveIndicator() {
  const [state, setState] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let savedTimer;

    const onSaving = () => {
      clearTimeout(savedTimer);
      setState("saving");
    };

    const onSaved = () => {
      setState("saved");
      savedTimer = setTimeout(() => {
        if (!hasPendingWrites()) setState("idle");
      }, 2000);
    };

    const onError = (e) => {
      setState("error");
      setErrorMsg(e.detail?.error || "שגיאת שמירה");
    };

    window.addEventListener("store-saving", onSaving);
    window.addEventListener("store-saved", onSaved);
    window.addEventListener("store-write-error", onError);
    return () => {
      clearTimeout(savedTimer);
      window.removeEventListener("store-saving", onSaving);
      window.removeEventListener("store-saved", onSaved);
      window.removeEventListener("store-write-error", onError);
    };
  }, []);

  if (state === "idle") return null;

  if (state === "error") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-medium text-red-600">
          שגיאה: {errorMsg}
        </span>
        <button
          onClick={() => {
            setState("idle");
            setErrorMsg("");
          }}
          className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-lg border-none cursor-pointer hover:bg-red-200 transition"
        >
          סגור
        </button>
      </div>
    );
  }

  return (
    <div
      className={`text-[11px] font-medium px-2 py-1 rounded-lg transition-all ${
        state === "saving"
          ? "text-amber-600 bg-amber-50"
          : "text-green-600 bg-green-50"
      }`}
    >
      {state === "saving" ? "שומר..." : "נשמר ✓"}
    </div>
  );
}
