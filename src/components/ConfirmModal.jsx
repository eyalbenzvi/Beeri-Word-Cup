import { useState, useCallback, useRef, createContext, useContext } from "react";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ message });
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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border-2 border-border max-w-sm w-full p-6 animate-pop-in">
            <p className="text-base text-ink font-medium whitespace-pre-line mb-5 leading-relaxed">{state.message}</p>
            <div className="flex gap-3">
              <button onClick={handleConfirm} className="btn-duo btn-duo-primary flex-1">
                אישור
              </button>
              <button onClick={handleCancel} className="btn-duo btn-duo-ghost flex-1">
                ביטול
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
