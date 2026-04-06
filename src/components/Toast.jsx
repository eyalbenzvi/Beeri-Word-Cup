import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [exiting, setExiting] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setExiting(false);
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    let innerTimer;
    const timer = setTimeout(() => {
      setExiting(true);
      innerTimer = setTimeout(() => {
        setToast(null);
        setExiting(false);
      }, 250);
    }, 3000);
    return () => {
      clearTimeout(timer);
      clearTimeout(innerTimer);
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-20 md:bottom-8 left-1/2 z-[100] px-5 py-3 rounded-2xl text-white text-sm font-medium shadow-xl max-w-[90%] md:max-w-sm text-center backdrop-blur-sm ${
            toast.type === "error"
              ? "bg-red-600/95"
              : toast.type === "info"
                ? "bg-primary/95"
                : "bg-gray-800/95"
          } ${exiting ? "toast-exit" : "toast-enter"}`}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
