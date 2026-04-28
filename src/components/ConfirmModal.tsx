import { useState, useCallback, useRef, createContext, useContext, useEffect } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

type ConfirmFn = (messageOrOpts: string | { message: string; title?: string; confirmLabel?: string; cancelLabel?: string; variant?: "primary" | "danger" }) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: any }) {
  const [state, setState] = useState<any>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, !!state);

  /**
   * confirm(message) — simple yes/no
   * confirm({ message, title, confirmLabel, cancelLabel, variant })
   *   variant: "primary" (default) | "danger"
   */
  const confirm: ConfirmFn = useCallback((messageOrOpts) => {
    const opts =
      typeof messageOrOpts === "string" ? { message: messageOrOpts } : messageOrOpts;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        message: opts.message || "",
        title: opts.title || null,
        confirmLabel: opts.confirmLabel || "אישור",
        cancelLabel: opts.cancelLabel || "ביטול",
        variant: opts.variant || "primary",
      });
    });
  }, []);

  const handleConfirm = () => {
    resolveRef.current?.(true);
    setState(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setState(null);
  };

  // Esc to cancel
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const confirmBtnClass =
    state?.variant === "danger"
      ? "btn-duo btn-duo-danger flex-1"
      : "btn-duo btn-duo-primary flex-1";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={state.title ? "confirm-title" : undefined}
          aria-describedby="confirm-message"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancel();
          }}
        >
          <div
            ref={dialogRef}
            className="bg-white rounded-3xl border-2 border-border max-w-sm w-full p-6 animate-pop-in"
          >
            {state.title && (
              <h2 id="confirm-title" className="text-lg font-extrabold text-ink mb-2">
                {state.title}
              </h2>
            )}
            <p
              id="confirm-message"
              className="text-base text-ink font-medium whitespace-pre-line mb-5 leading-relaxed"
            >
              {state.message}
            </p>
            <div className="flex gap-3">
              <button onClick={handleConfirm} className={confirmBtnClass}>
                {state.confirmLabel}
              </button>
              <button onClick={handleCancel} className="btn-duo btn-duo-ghost flex-1">
                {state.cancelLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
