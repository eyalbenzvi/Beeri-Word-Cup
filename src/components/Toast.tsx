import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";

type ToastType = "success" | "error" | "info";
type ShowToast = (message: string, type?: ToastType) => void;
const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: any }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [exiting, setExiting] = useState(false);

  const showToast: ShowToast = useCallback((message, type = "success") => {
    setExiting(false);
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    let innerTimer: ReturnType<typeof setTimeout> | undefined;
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
          className={`fixed bottom-24 md:bottom-8 left-1/2 z-[100] px-5 py-3.5 rounded-2xl text-white text-sm font-extrabold max-w-[90%] md:max-w-sm text-center ${
            toast.type === "error"
              ? "bg-danger"
              : toast.type === "info"
                ? "bg-secondary"
                : "bg-primary"
          } ${exiting ? "toast-exit" : "toast-enter"}`}
          style={{
            boxShadow: toast.type === "error"
              ? "0 4px 0 0 var(--color-danger-dark)"
              : toast.type === "info"
                ? "0 4px 0 0 var(--color-secondary-dark)"
                : "0 4px 0 0 var(--color-primary-dark)",
          }}
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
