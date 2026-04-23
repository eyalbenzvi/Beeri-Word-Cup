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
      <div className="border-2 border-danger rounded-2xl px-3 py-2 flex items-center justify-between gap-2 mb-3" style={{ background: "var(--color-danger-soft)" }}>
        <span className="text-xs font-bold text-danger">
          {errorMsg}
        </span>
        <button
          onClick={() => {
            setState("idle");
            setErrorMsg("");
          }}
          className="btn-duo-flat"
          style={{ padding: "0.25rem 0.75rem", fontSize: "0.7rem" }}
        >
          סגור
        </button>
      </div>
    );
  }

  return (
    <div
      className={`text-xs font-extrabold px-2.5 py-1 rounded-xl transition-all ${
        state === "saving"
          ? "text-accent-text"
          : "text-white bg-primary"
      }`}
      style={state === "saving" ? { background: "var(--color-accent-soft-2)" } : undefined}
    >
      {state === "saving" ? "שומר..." : "נשמר ✓"}
    </div>
  );
}
