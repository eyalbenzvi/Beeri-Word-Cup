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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
            <p className="text-sm text-gray-700 whitespace-pre-line mb-4">{state.message}</p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl text-sm border-none cursor-pointer"
              >
                אישור
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 font-semibold text-sm cursor-pointer"
              >
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
